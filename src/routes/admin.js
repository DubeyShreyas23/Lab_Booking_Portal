const express = require('express');
const db = require('../db');
const bookingRepo = require('../repos/bookingRepo');
const instrumentRepo = require('../repos/instrumentRepo');
const userRepo = require('../repos/userRepo');
const holidayRepo = require('../repos/holidayRepo');
const settingsRepo = require('../repos/settingsRepo');
const appConfig = require('../lib/appConfig');
const mail = require('../lib/email');
const instrumentService = require('../services/instrumentService');
const userService = require('../services/userService');
const { parseOrThrow } = require('../validators/parse');
const { upsertInstrument, createUser, updateUser } = require('../validators/schemas');
const { decorateBooking } = require('../lib/helpers');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('admin', 'faculty'));

router.get('/', async (req, res, next) => {
  try {
    const [instruments, users, pending, approvedFuture, recent] = await Promise.all([
      instrumentRepo.countActive(),
      userRepo.count(),
      bookingRepo.countByStatus(['pending_technician', 'pending_faculty']),
      bookingRepo.countApprovedFuture(),
      bookingRepo.recent(),
    ]);
    res.render('admin/dashboard', {
      title: 'Admin',
      stats: { instruments, users, pending, approvedFuture },
      recent: recent.map(decorateBooking), // IST-formatted times (stored UTC)
    });
  } catch (e) { next(e); }
});

// ── Equipment Inventory (counts + status) ────────────────────────────────
router.get('/inventory', async (req, res, next) => {
  try {
    const labFilter = req.query.lab || '';
    const [all, bookedIds, technicians] = await Promise.all([
      instrumentService.list(),
      instrumentRepo.currentlyBookedIds(),
      userService.listTechnicians(),
    ]);
    const active = all.filter((i) => i.active);
    const bookedSet = new Set(bookedIds);
    const counts = {
      total: active.length,
      working: active.filter((i) => (i.status || 'working') === 'working').length,
      repair: active.filter((i) => i.status === 'repair').length,
      booked: active.filter((i) => bookedSet.has(i.id)).length,
      available: active.filter((i) => (i.status || 'working') === 'working' && !bookedSet.has(i.id)).length,
    };
    const labs = [...new Set(active.map((i) => i.lab).filter(Boolean))].sort();
    const items = (labFilter ? active.filter((i) => i.lab === labFilter) : active)
      .map((i) => ({ ...i, isBooked: bookedSet.has(i.id) }));
    res.render('admin/inventory', { title: 'Equipment Inventory', counts, items, labs, labFilter, technicians });
  } catch (e) { next(e); }
});

router.post('/inventory/:id/technician', async (req, res, next) => {
  try {
    const techId = req.body.technician_id ? Number(req.body.technician_id) : null;
    await instrumentRepo.setTechnician(Number(req.params.id), techId);
    req.flash('info', 'Technician assigned.');
    res.redirect(req.get('Referer') || '/admin/inventory');
  } catch (e) { next(e); }
});

router.post('/inventory/:id/status', async (req, res, next) => {
  try {
    const status = ['working', 'repair', 'retired'].includes(req.body.status) ? req.body.status : 'working';
    await instrumentRepo.setStatus(Number(req.params.id), status);
    req.flash('info', 'Status updated.');
    res.redirect(req.get('Referer') || '/admin/inventory');
  } catch (e) { next(e); }
});

// ── Instruments ──────────────────────────────────────────────────────────
router.get('/instruments', async (req, res, next) => {
  try {
    const [items, technicians] = await Promise.all([
      instrumentService.list(),
      userService.listTechnicians(),
    ]);
    res.render('admin/instruments', { title: 'Instruments', items, technicians, edit: null });
  } catch (e) { next(e); }
});

router.get('/instruments/:id/edit', async (req, res, next) => {
  try {
    const edit = await instrumentRepo.findById(Number(req.params.id));
    if (!edit) return res.redirect('/admin/instruments');
    const [items, technicians] = await Promise.all([
      instrumentService.list(),
      userService.listTechnicians(),
    ]);
    res.render('admin/instruments', { title: 'Instruments', items, technicians, edit });
  } catch (e) { next(e); }
});

router.post('/instruments', async (req, res, next) => {
  try {
    const data = parseOrThrow(upsertInstrument, req.body);
    data.active = !!data.active; // checkbox -> boolean
    await instrumentService.upsert(data);
    req.flash('info', req.body.id ? 'Instrument updated.' : 'Instrument added.');
    res.redirect('/admin/instruments');
  } catch (e) {
    if (e.code === 'VALIDATION' || e.code === 'CONFLICT') {
      req.flash('error', e.message);
      return res.redirect('/admin/instruments');
    }
    next(e);
  }
});

router.post('/instruments/:id/delete', async (req, res, next) => {
  try {
    await instrumentService.deactivate(Number(req.params.id));
    req.flash('info', 'Instrument deactivated.');
    res.redirect('/admin/instruments');
  } catch (e) { next(e); }
});

// ── Users ────────────────────────────────────────────────────────────────
router.get('/users', async (req, res, next) => {
  try {
    const [users, faculty] = await Promise.all([
      userService.listAll(),
      userService.listFaculty(),
    ]);
    res.render('admin/users', { title: 'Users', users, faculty });
  } catch (e) { next(e); }
});

router.post('/users', async (req, res, next) => {
  try {
    const data = parseOrThrow(createUser, req.body);
    await userService.preRegister(data);
    req.flash('info', 'User created. They can sign in via Google immediately.');
    res.redirect('/admin/users');
  } catch (e) {
    if (e.code === 'VALIDATION' || e.code === 'CONFLICT') {
      req.flash('error', e.message);
      return res.redirect('/admin/users');
    }
    next(e);
  }
});

router.post('/users/:id', async (req, res, next) => {
  try {
    const data = parseOrThrow(updateUser, req.body);
    await userService.updateProfile(Number(req.params.id), {
      role: data.role,
      supervisor_id: data.supervisor_id ? Number(data.supervisor_id) : null,
      department: data.department || null,
      phone: data.phone || null,
    });
    req.flash('info', 'User updated.');
    res.redirect('/admin/users');
  } catch (e) {
    if (e.code === 'VALIDATION') {
      req.flash('error', e.message);
      return res.redirect('/admin/users');
    }
    next(e);
  }
});

// Delete a single user. Blocked for yourself, the default supervisor, and any
// user still referenced by bookings/complaints (data integrity).
router.post('/users/:id/delete', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (id === req.user.id) { req.flash('error', 'You cannot delete your own account.'); return res.redirect('/admin/users'); }
    const defaultSup = await settingsRepo.get('default_supervisor_id');
    if (defaultSup && Number(defaultSup) === id) {
      req.flash('error', 'This user is the default supervisor. Change the supervisor in Settings first.');
      return res.redirect('/admin/users');
    }
    try {
      // Null every *optional* link to this user (supervisor/technician/actor/
      // recipient), then delete. Only their OWN bookings (student_id) or raised
      // complaints (raised_by) — both NOT NULL — can still block, which is correct.
      await db.tx(async (c) => {
        await c.query(`UPDATE instruments      SET technician_id = NULL WHERE technician_id = $1`, [id]);
        await c.query(`UPDATE instruments      SET created_by    = NULL WHERE created_by    = $1`, [id]);
        await c.query(`UPDATE users            SET supervisor_id = NULL WHERE supervisor_id = $1`, [id]);
        await c.query(`UPDATE bookings         SET supervisor_id = NULL WHERE supervisor_id = $1`, [id]);
        await c.query(`UPDATE bookings         SET technician_id = NULL WHERE technician_id = $1`, [id]);
        await c.query(`UPDATE booking_events   SET actor_id      = NULL WHERE actor_id      = $1`, [id]);
        await c.query(`UPDATE audit_log        SET actor_id      = NULL WHERE actor_id      = $1`, [id]);
        await c.query(`UPDATE notifications    SET to_user_id    = NULL WHERE to_user_id    = $1`, [id]);
        await c.query(`UPDATE complaints       SET assigned_to   = NULL WHERE assigned_to   = $1`, [id]);
        await c.query(`UPDATE complaint_events SET actor_id      = NULL WHERE actor_id      = $1`, [id]);
        await c.query(`DELETE FROM users WHERE id = $1`, [id]);
      });
      req.flash('info', 'User deleted.');
    } catch (_) {
      req.flash('error', 'Cannot delete: this user has their own bookings or complaints on record. Change their role to a non-faculty role instead.');
    }
    res.redirect('/admin/users');
  } catch (e) { next(e); }
});

// ── Holidays ─────────────────────────────────────────────────────────────
router.get('/holidays', async (req, res, next) => {
  try {
    const [holidays, instruments] = await Promise.all([
      holidayRepo.listAll(),
      instrumentRepo.listAll(),
    ]);
    res.render('admin/holidays', { title: 'Holidays / lab closures', holidays, instruments });
  } catch (e) { next(e); }
});

router.post('/holidays', async (req, res, next) => {
  const date = String(req.body.date || '').trim();
  const label = String(req.body.label || '').trim();
  const instrumentId = req.body.instrument_id ? Number(req.body.instrument_id) : null;
  if (!date || !label) {
    req.flash('error', 'Date and label are required.');
    return res.redirect('/admin/holidays');
  }
  try {
    await holidayRepo.add({ date, label, instrumentId, createdBy: req.user.id });
    req.flash('info', 'Holiday added.');
  } catch (e) {
    req.flash('error', e.message);
  }
  res.redirect('/admin/holidays');
});

router.post('/holidays/:id/delete', async (req, res, next) => {
  try {
    await holidayRepo.remove(Number(req.params.id));
    req.flash('info', 'Holiday removed.');
    res.redirect('/admin/holidays');
  } catch (e) { next(e); }
});

// ── Settings (default supervisor, contact) ───────────────────────────────
router.get('/settings', async (req, res, next) => {
  try {
    const [faculty, settings] = await Promise.all([
      userService.listFaculty(),
      settingsRepo.getMany(['default_supervisor_id', 'contact_person', 'lab_name']),
    ]);
    res.render('admin/settings', { title: 'Settings', faculty, settings });
  } catch (e) { next(e); }
});

router.post('/settings', async (req, res, next) => {
  try {
    await settingsRepo.set('default_supervisor_id', req.body.default_supervisor_id || null, req.user.id);
    if (typeof req.body.contact_person === 'string') {
      await settingsRepo.set('contact_person', req.body.contact_person.trim(), req.user.id);
    }
    if (typeof req.body.lab_name === 'string' && req.body.lab_name.trim()) {
      await settingsRepo.set('lab_name', req.body.lab_name.trim(), req.user.id);
      await appConfig.refresh();   // update the cached site name shown in nav/footer/titles
    }
    req.flash('info', 'Settings saved.');
    res.redirect('/admin/settings');
  } catch (e) { next(e); }
});

// Send a test email to verify the SMTP/Brevo pipeline end to end.
router.post('/test-email', async (req, res, next) => {
  const to = (req.body.to || req.user.email || '').trim();
  try {
    if (!to) { req.flash('error', 'Enter an email address to test.'); return res.redirect('/admin/settings'); }
    const result = await mail.sendMail({
      to,
      subject: 'BEST Lab — test email',
      text: 'This is a test email from the BEST Lab portal.\n\nIf you received this, your email pipeline (SMTP/Brevo) is working correctly.\n\nRegards,\nBEST Lab',
    });
    if (result && result.mocked) {
      req.flash('error', 'SMTP is not configured on the server (SMTP_HOST missing). No real email was sent — add the Brevo SMTP env vars in Render.');
    } else {
      req.flash('info', `Test email sent to ${to}. Check that inbox and your Brevo → Transactional → Logs.`);
    }
  } catch (e) {
    req.flash('error', `Test email failed: ${e.message}`);
  }
  res.redirect('/admin/settings');
});

// ── Broadcast announcement ────────────────────────────────────────────────
// Sends one email (same subject+body) to every real lab member — anyone with
// role student/technician/faculty. Admin accounts are excluded (you don't
// need to email yourself). Recipients are shown BEFORE sending so nothing
// goes out until you've reviewed the exact list.
const DEFAULT_BROADCAST_SUBJECT = 'BEST Lab equipment booking is finally live! \u{1F389}';
const DEFAULT_BROADCAST_BODY = `Hi everyone,

Quick personal note before the "official" bit — I built this in whatever free
time I could scrape together between coursework and my internship, so if it
has a few rough edges in the first week, please be patient with me! And if
you ever want to chat about it (or anything else), I'm always up for coffee.
Just ping me.

Now, the official part:

I'm happy to announce that the BEST Lab Equipment Booking Portal is now LIVE.
No more chasing people on WhatsApp or waiting around to find out if an
instrument is free — it's all online now.

Portal link: https://cal-portal.onrender.com

WHAT IT DOES
------------
Think of it as one shared calendar for every instrument in PURSE, EBT, and
FSM labs, with a simple three-step approval built in:

1. You pick an instrument and a time slot and submit a request.
2. The instrument's Equipment Incharge gets notified automatically and
   approves (or lets you know if something's off).
3. Prof. Sankar Ganesh gives the final sign-off, and you're confirmed.

You'll get an email at every single step — when you submit, when it's
approved, or if it's rejected (with a reason) — so you're never left
wondering what's happening with your request.

A few other things it does:
  - Shows you exactly which time slots are already taken, so there's no
    guessing or double-booking.
  - Handles both short experiments (book an hour or two) and long ones like
    bioreactor runs (book a full date range).
  - Has a "raise a complaint" button if an instrument is faulty or something
    needs attention — goes straight to the right people.
  - A screen can be set up outside the lab showing what's booked today, at a
    glance.

HOW TO USE IT
-------------
1. Go to https://cal-portal.onrender.com
2. Click "Sign in" and log in with your institute Google account
   (your @hyderabad.bits-pilani.ac.in email).
3. Browse instruments, pick a free slot, and submit your request.
4. Check "My bookings" any time to see the status.

If you're one of the Equipment Incharges, you'll also see a "Queue" tab —
that's where booking requests for your instrument(s) show up for you to
approve or reject.

That's really it. If anything is confusing, broken, or just doesn't make
sense, tell me — I'd genuinely rather hear about it than have you struggle
through it silently.

Excited for this to actually make things easier for all of us.

(One more thing — this email was sent automatically through the portal's own
notification pipeline, the same system that'll email you every time a
booking is submitted, approved, or rejected. If you're reading this, it
means the whole thing is working end-to-end. Consider this the first test!)

Cheers,
Shreyas Dubey
f20231386@hyderabad.bits-pilani.ac.in`;

router.get('/broadcast', async (req, res, next) => {
  try {
    const recipients = await db.all(
      `SELECT id, name, email, role FROM users WHERE role IN ('student','technician','faculty') ORDER BY role, name`,
    );
    res.render('admin/broadcast', {
      title: 'Send announcement',
      recipients,
      defaultSubject: DEFAULT_BROADCAST_SUBJECT,
      defaultBody: DEFAULT_BROADCAST_BODY,
      result: null,
    });
  } catch (e) { next(e); }
});

router.post('/broadcast', async (req, res, next) => {
  try {
    const subject = String(req.body.subject || '').trim();
    const body = String(req.body.body || '').trim();
    if (!subject || !body) {
      req.flash('error', 'Subject and message are required.');
      return res.redirect('/admin/broadcast');
    }

    const recipients = await db.all(
      `SELECT id, name, email, role FROM users WHERE role IN ('student','technician','faculty') ORDER BY role, name`,
    );

    const results = [];
    for (const r of recipients) {
      try {
        await mail.sendMail({ to: r.email, subject, text: body });
        results.push({ ...r, ok: true });
      } catch (e) {
        results.push({ ...r, ok: false, error: e.message });
      }
    }

    const sent = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok).length;
    if (failed === 0) {
      req.flash('info', `Broadcast sent to all ${sent} recipients.`);
    } else {
      req.flash('error', `Sent to ${sent}, failed for ${failed}. See details below.`);
    }

    res.render('admin/broadcast', {
      title: 'Send announcement',
      recipients,
      defaultSubject: subject,
      defaultBody: body,
      result: results,
    });
  } catch (e) { next(e); }
});

// ── Clean up seeded demo data ─────────────────────────────────────────────
// Deactivates the 5 demo instruments and removes the demo users — but never
// touches the current admin, the configured default supervisor, or any user/
// instrument that is actually in use (bookings etc. block the delete → kept).
router.post('/cleanup-demo', async (req, res, next) => {
  try {
    const demoCodes = ['GC', 'COD', 'HPLC', 'FTIR', 'UV'];
    const inst = await db.run(
      `UPDATE instruments SET active = 0, technician_id = NULL WHERE code = ANY($1)`,
      [demoCodes],
    );

    const demoEmails = [
      'admin@hyderabad.bits-pilani.ac.in',
      'rganesan@hyderabad.bits-pilani.ac.in',
      'tech.gc@hyderabad.bits-pilani.ac.in',
      'tech.cod@hyderabad.bits-pilani.ac.in',
    ];
    const defaultSup = await settingsRepo.get('default_supervisor_id');
    let removed = 0, kept = 0;

    for (const email of demoEmails) {
      const u = await db.get(`SELECT id FROM users WHERE lower(email) = lower($1)`, [email]);
      if (!u) continue;
      if (u.id === req.user.id) { kept++; continue; }                       // never delete yourself
      if (defaultSup && Number(defaultSup) === u.id) { kept++; continue; }  // never delete the supervisor
      try {
        await db.run(`UPDATE instruments SET technician_id = NULL WHERE technician_id = $1`, [u.id]);
        await db.run(`UPDATE instruments SET created_by = NULL WHERE created_by = $1`, [u.id]);
        await db.run(`UPDATE users SET supervisor_id = NULL WHERE supervisor_id = $1`, [u.id]);
        await db.run(`DELETE FROM users WHERE id = $1`, [u.id]);
        removed++;
      } catch (_) { kept++; }   // referenced by bookings/events → leave it in place
    }

    req.flash('info',
      `Demo cleanup complete: ${inst.rowCount || 0} demo instruments deactivated, ` +
      `${removed} demo user${removed === 1 ? '' : 's'} removed` +
      (kept ? `, ${kept} kept (in use or protected).` : '.'));
    res.redirect('/admin');
  } catch (e) { next(e); }
});

module.exports = router;
