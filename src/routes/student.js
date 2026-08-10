const express = require('express');
const bookingRepo = require('../repos/bookingRepo');
const instrumentService = require('../services/instrumentService');
const userService = require('../services/userService');
const bookingService = require('../services/bookingService');
const { decorateBooking, dayjs } = require('../lib/helpers');
const { parseOrThrow } = require('../validators/parse');
const { createBooking } = require('../validators/schemas');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// Bounce staff/admin to their own dashboards. Booking is a STUDENT action only.
router.use((req, res, next) => {
  const path = req.path;
  const role = req.user.role;
  if (role !== 'student') {
    if (path === '/') {
      if (role === 'admin')      return res.redirect('/admin');
      if (role === 'technician') return res.redirect('/technician');
      if (role === 'faculty')    return res.redirect('/faculty');
    }
    if (path === '/instruments' || path.startsWith('/book/') || path.startsWith('/bookings/')) {
      if (req.method === 'GET' && (path === '/instruments' || path.startsWith('/book/'))) {
        // staff may *view* the instruments list and the booking page (read-only) — but
        // we still block POSTs below. This is friendly for technicians who want to see
        // what's coming up for an instrument they own.
        return next();
      }
      return res.status(403).render('error', {
        title: 'Forbidden',
        message: 'Only students can submit or cancel bookings. Staff use the approval queues.',
      });
    }
  }
  next();
});

router.get('/', requireRole('student'), async (req, res, next) => {
  try {
    const bookings = (await bookingRepo.forStudent(req.user.id)).map(decorateBooking);
    res.render('student/dashboard', { title: 'My bookings', bookings });
  } catch (e) { next(e); }
});

router.get('/instruments', async (req, res, next) => {
  try {
    res.render('student/instruments', {
      title: 'Available instruments',
      instruments: await instrumentService.listActive(),
      canBook: req.user.role === 'student',
    });
  } catch (e) { next(e); }
});

router.get('/book/:id', async (req, res, next) => {
  try {
    const instrument = await instrumentService.findActive(Number(req.params.id));
    const today = dayjs().format('YYYY-MM-DD');
    const date = req.query.date || today;
    const grid = await bookingService.buildDayGrid({ instrument, dateISO: date });
    const supervisor = await bookingService.resolveDefaultSupervisor();

    // Stale state is the #1 cause of "slot taken" errors. Prevent the back/forward
    // cache from showing an out-of-date grid.
    res.set('Cache-Control', 'no-store, must-revalidate');

    res.render('student/book', {
      title: `Book ${instrument.name}`,
      instrument,
      date,
      today,                       // local YYYY-MM-DD, used for the date input min
      cells: grid.cells,
      cellsNeeded: grid.cellsNeeded,
      totalMinutes: grid.totalMinutes,
      stepMinutes: grid.stepMinutes,
      closedAllDay: grid.closedAllDay,
      anySelectable: grid.anySelectable,
      supervisor,                  // fixed default supervisor (not student-chosen)
      canBook: req.user.role === 'student',
    });
  } catch (e) { next(e); }
});

router.post('/book/:id', requireRole('student'), async (req, res, next) => {
  try {
    const payload = parseOrThrow(createBooking, req.body);
    await bookingService.createBooking({
      student: req.user,
      instrumentId: Number(req.params.id),
      payload,
    });
    req.flash('info', 'Booking submitted. You will receive an email once the technician reviews it.');
    res.redirect('/');
  } catch (e) {
    if (e.code === 'CONFLICT' || e.code === 'VALIDATION') {
      req.flash('error', e.message);
      return res.redirect(`/book/${req.params.id}?date=${(req.body.starts_at || '').slice(0,10) || dayjs().format('YYYY-MM-DD')}`);
    }
    next(e);
  }
});

router.post('/bookings/:id/cancel', requireRole('student'), async (req, res, next) => {
  try {
    await bookingService.cancelByStudent({ student: req.user, bookingId: Number(req.params.id) });
    req.flash('info', 'Booking cancelled.');
    res.redirect('/');
  } catch (e) {
    if (e.code) { req.flash('error', e.message); return res.redirect('/'); }
    next(e);
  }
});

module.exports = router;
