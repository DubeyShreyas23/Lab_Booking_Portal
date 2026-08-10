const express = require('express');
const complaintRepo = require('../repos/complaintRepo');
const complaintService = require('../services/complaintService');
const instrumentService = require('../services/instrumentService');
const userService = require('../services/userService');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const isStaff = (u) => ['technician', 'faculty', 'admin'].includes(u.role);

// List — students see their own; staff see all.
router.get('/complaints', async (req, res, next) => {
  try {
    if (isStaff(req.user)) {
      const status = req.query.status || '';
      const complaints = await complaintRepo.listAll({ status });
      return res.render('complaints/index', { title: 'Complaints', complaints, staff: true, status });
    }
    const complaints = await complaintRepo.forUser(req.user.id);
    res.render('complaints/index', { title: 'My complaints', complaints, staff: false, status: '' });
  } catch (e) { next(e); }
});

// Raise form
router.get('/complaints/new', async (req, res, next) => {
  try {
    res.render('complaints/new', {
      title: 'Raise a complaint',
      instruments: await instrumentService.listActive(),
      priorities: complaintService.PRIORITIES,
    });
  } catch (e) { next(e); }
});

router.post('/complaints', async (req, res, next) => {
  try {
    await complaintService.raise({ user: req.user, data: req.body });
    req.flash('info', 'Complaint submitted. The lab team has been notified.');
    res.redirect('/complaints');
  } catch (e) {
    if (e.code === 'VALIDATION') { req.flash('error', e.message); return res.redirect('/complaints/new'); }
    next(e);
  }
});

// Detail
router.get('/complaints/:id', async (req, res, next) => {
  try {
    const complaint = await complaintRepo.findById(Number(req.params.id));
    if (!complaint) return res.status(404).render('error', { title: 'Not found', message: 'Complaint not found.' });
    if (!isStaff(req.user) && complaint.raised_by !== req.user.id) {
      return res.status(403).render('error', { title: 'Forbidden', message: 'You cannot view this complaint.' });
    }
    const [events, assignees] = await Promise.all([
      complaintRepo.eventsFor(complaint.id),
      isStaff(req.user) ? userService.listTechnicians() : Promise.resolve([]),
    ]);
    res.render('complaints/detail', {
      title: `Complaint #${complaint.id}`,
      complaint, events, assignees,
      staff: isStaff(req.user),
      statuses: complaintService.STATUSES,
      priorities: complaintService.PRIORITIES,
    });
  } catch (e) { next(e); }
});

router.post('/complaints/:id/update', async (req, res, next) => {
  try {
    if (!isStaff(req.user)) return res.status(403).render('error', { title: 'Forbidden', message: 'Staff only.' });
    await complaintService.updateByStaff({ actor: req.user, id: Number(req.params.id), body: req.body });
    req.flash('info', 'Complaint updated.');
    res.redirect(`/complaints/${req.params.id}`);
  } catch (e) {
    if (e.code) { req.flash('error', e.message); return res.redirect(`/complaints/${req.params.id}`); }
    next(e);
  }
});

module.exports = router;
