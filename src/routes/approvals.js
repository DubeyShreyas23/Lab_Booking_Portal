const express = require('express');
const bookingRepo = require('../repos/bookingRepo');
const bookingService = require('../services/bookingService');
const { decorateBooking } = require('../lib/helpers');
const { parseOrThrow } = require('../validators/parse');
const { rejection } = require('../validators/schemas');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function isAdmin(user) { return user.role === 'admin'; }

// ── Technician queue ─────────────────────────────────────────────────────
router.get('/technician', requireRole('technician','admin','faculty'), async (req, res, next) => {
  try {
    const opts = { userId: req.user.id, adminOverride: isAdmin(req.user) };
    const [pending, history] = await Promise.all([
      bookingRepo.pendingForTechnician(opts),
      bookingRepo.historyForTechnician(opts),
    ]);
    res.render('queue', {
      title: 'Technician queue',
      stage: 'technician',
      pending: pending.map(decorateBooking),
      history: history.map(decorateBooking),
    });
  } catch (e) { next(e); }
});

router.post('/technician/:id/approve', requireRole('technician','admin','faculty'), async (req, res, next) => {
  try {
    await bookingService.technicianApprove({ actor: req.user, bookingId: Number(req.params.id) });
    req.flash('info', 'Forwarded to faculty for approval.');
    res.redirect('/technician');
  } catch (e) { handle(e, req, res, next, '/technician'); }
});

router.post('/technician/:id/reject', requireRole('technician','admin','faculty'), async (req, res, next) => {
  try {
    const { reason } = parseOrThrow(rejection, req.body);
    await bookingService.reject({ actor: req.user, bookingId: Number(req.params.id), stage: 'technician', reason });
    req.flash('info', 'Booking rejected.');
    res.redirect('/technician');
  } catch (e) { handle(e, req, res, next, '/technician'); }
});

// ── Faculty queue ────────────────────────────────────────────────────────
router.get('/faculty', requireRole('faculty','admin'), async (req, res, next) => {
  try {
    const opts = { userId: req.user.id, adminOverride: isAdmin(req.user) };
    const [pending, history] = await Promise.all([
      bookingRepo.pendingForFaculty(opts),
      bookingRepo.historyForFaculty(opts),
    ]);
    res.render('queue', {
      title: 'Faculty queue',
      stage: 'faculty',
      pending: pending.map(decorateBooking),
      history: history.map(decorateBooking),
    });
  } catch (e) { next(e); }
});

router.post('/faculty/:id/approve', requireRole('faculty','admin'), async (req, res, next) => {
  try {
    await bookingService.facultyApprove({ actor: req.user, bookingId: Number(req.params.id) });
    req.flash('info', 'Booking approved. Student has been notified.');
    res.redirect('/faculty');
  } catch (e) { handle(e, req, res, next, '/faculty'); }
});

router.post('/faculty/:id/reject', requireRole('faculty','admin'), async (req, res, next) => {
  try {
    const { reason } = parseOrThrow(rejection, req.body);
    await bookingService.reject({ actor: req.user, bookingId: Number(req.params.id), stage: 'faculty', reason });
    req.flash('info', 'Booking rejected.');
    res.redirect('/faculty');
  } catch (e) { handle(e, req, res, next, '/faculty'); }
});

function handle(e, req, res, next, fallback) {
  if (e.code === 'VALIDATION' || e.code === 'CONFLICT' || e.code === 'FORBIDDEN' || e.code === 'NOT_FOUND') {
    req.flash('error', e.message);
    return res.redirect(fallback);
  }
  next(e);
}

module.exports = router;
