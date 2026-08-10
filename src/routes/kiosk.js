const express = require('express');
const db = require('../db');
const { dayjs } = require('../lib/helpers');

const router = express.Router();

// Public — no auth. Meant to run on a lab-door display.
router.get('/kiosk', async (req, res, next) => {
  try {
    const today = dayjs().format('YYYY-MM-DD');
    const instruments = await db.all(`SELECT * FROM instruments WHERE active = 1 ORDER BY name`);
    const todayBookings = await db.all(`
      SELECT b.*, i.id AS iid, s.name AS student_name
      FROM bookings b
      JOIN instruments i ON i.id = b.instrument_id
      JOIN users s ON s.id = b.student_id
      WHERE substr(b.starts_at, 1, 10) = $1
        AND b.status IN ('approved','completed','pending_technician','pending_faculty')
      ORDER BY b.starts_at ASC
    `, [today]);

    const byInstrument = {};
    for (const inst of instruments) byInstrument[inst.id] = [];
    for (const b of todayBookings) {
      if (byInstrument[b.iid]) byInstrument[b.iid].push(b);
    }

    res.render('kiosk', {
      title: 'Today at BEST Lab',
      today,
      instruments,
      byInstrument,
      now: dayjs().format('HH:mm'),
    });
  } catch (e) { next(e); }
});

module.exports = router;
