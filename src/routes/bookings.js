const express = require('express');
const bookingRepo = require('../repos/bookingRepo');
const userRepo = require('../repos/userRepo');
const { decorateBooking } = require('../lib/helpers');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// Booking detail — visible to:
//   - the student who owns it
//   - the technician of the instrument
//   - the supervising faculty
//   - any admin / faculty (admin powers)
router.get('/bookings/:id', async (req, res, next) => {
  try {
    const b = await bookingRepo.findById(Number(req.params.id));
    if (!b) return res.status(404).render('error', { title: 'Not found', message: 'Booking not found.' });

    const u = req.user;
    const allowed =
      u.role === 'admin' ||
      u.role === 'faculty' ||
      (u.role === 'technician' && b.instrument_technician_id === u.id) ||
      (u.id === b.student_id);
    if (!allowed) return res.status(403).render('error', { title: 'Forbidden', message: 'You cannot view this booking.' });

    const events = await bookingRepo.eventsFor(b.id);
    const student = await userRepo.findById(b.student_id);
    const supervisor = b.supervisor_id ? await userRepo.findById(b.supervisor_id) : null;

    res.render('bookings/detail', {
      title: `Booking #${b.id}`,
      booking: decorateBooking(b),
      events,
      student,
      supervisor,
    });
  } catch (e) { next(e); }
});

module.exports = router;
