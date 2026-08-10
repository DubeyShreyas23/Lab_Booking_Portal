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
    const supervisor = await bookingService.resolveDefaultSupervisor();
    res.set('Cache-Control', 'no-store, must-revalidate');

    // Multi-day equipment uses a date-range picker instead of the hourly timeline.
    if (instrument.booking_mode === 'daily') {
      const upcoming = (await bookingRepo.upcomingForInstrument(instrument.id)).map(decorateBooking);
      return res.render('student/book-daily', {
        title: `Book ${instrument.name}`,
        instrument, today, supervisor, upcoming,
        durationDays: instrument.duration_days || 1,
        canBook: req.user.role === 'student',
      });
    }

    const date = req.query.date || today;
    const grid = await bookingService.buildDayGrid({ instrument, dateISO: date });

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
  const instrumentId = Number(req.params.id);
  try {
    const instrument = await instrumentService.findActive(instrumentId);
    if (instrument.booking_mode === 'daily') {
      await bookingService.createDailyBooking({
        student: req.user,
        instrumentId,
        payload: { date: req.body.date, purpose: req.body.purpose, sample_count: req.body.sample_count },
      });
    } else {
      const payload = parseOrThrow(createBooking, req.body);
      await bookingService.createBooking({ student: req.user, instrumentId, payload });
    }
    req.flash('info', 'Booking submitted. You will receive an email once the technician reviews it.');
    res.redirect('/');
  } catch (e) {
    if (e.code === 'CONFLICT' || e.code === 'VALIDATION') {
      req.flash('error', e.message);
      return res.redirect(`/book/${instrumentId}`);
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
