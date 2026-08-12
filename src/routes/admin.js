const express = require('express');
const db = require('../db');
const bookingRepo = require('../repos/bookingRepo');
const instrumentRepo = require('../repos/instrumentRepo');
const userRepo = require('../repos/userRepo');
const holidayRepo = require('../repos/holidayRepo');
const settingsRepo = require('../repos/settingsRepo');
const instrumentService = require('../services/instrumentService');
const userService = require('../services/userService');
const { parseOrThrow } = require('../validators/parse');
const { upsertInstrument, createUser, updateUser } = require('../validators/schemas');
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
      recent,
    });
  } catch (e) { next(e); }
});

// ── Equipment Inventory (counts + status) ────────────────────────────────
router.get('/inventory', async (req, res, next) => {
  try {
    const labFilter = req.query.lab || '';
    const [all, bookedIds] = await Promise.all([
      instrumentService.list(),
      instrumentRepo.currentlyBookedIds(),
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
    res.render('admin/inventory', { title: 'Equipment Inventory', counts, items, labs, labFilter });
  } catch (e) { next(e); }
});

router.post('/inventory/:id/status', async (req, res, next) => {
  try {
    const status = ['working', 'repair', 'retired'].includes(req.body.status) ? req.body.status : 'working';
    await instrumentRepo.setStatus(Number(req.params.id), status);
    req.flash('info', 'Status updated.');
    res.redirect('back');
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
    req.flash('info', 'Settings saved.');
    res.redirect('/admin/settings');
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
