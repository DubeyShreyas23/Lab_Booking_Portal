const bookingRepo = require('../repos/bookingRepo');
const instrumentRepo = require('../repos/instrumentRepo');
const userRepo = require('../repos/userRepo');
const holidayRepo = require('../repos/holidayRepo');
const settingsRepo = require('../repos/settingsRepo');
const mail = require('../lib/email');
const { dayjs, decorateBooking } = require('../lib/helpers');
const { NotFoundError, ConflictError, ForbiddenError, ValidationError } = require('../errors');

function initialsOf(name) {
  return (name || '?')
    .split(/\s+/).filter(Boolean).slice(0, 3)
    .map((p) => p[0].toUpperCase()).join('');
}

// Build a day grid of fixed-width cells (e.g. 30 min each).
// Each cell carries enough state that the view never shows a cell as "free/clickable"
// unless a full booking can actually START there. This prevents the confusing case
// where a student clicks a slot that looks free but the server then rejects it
// (past time, too late in the day, or the run would overlap a later booking).
async function buildDayGrid({ instrument, dateISO, now = dayjs() }) {
  const step  = instrument.slot_step_minutes || 30;
  const total = instrument.experiment_minutes + instrument.maintenance_minutes;
  const cellsNeeded = Math.ceil(total / step);

  const dayStart = dayjs(`${dateISO}T${String(instrument.open_hour).padStart(2,'0')}:00:00`);
  const dayEnd   = dayjs(`${dateISO}T${String(instrument.close_hour).padStart(2,'0')}:00:00`);

  const existing = await bookingRepo.sameDay({ instrumentId: instrument.id, dateISO });
  const closedAllDay = await holidayRepo.isClosedOn({ dateISO, instrumentId: instrument.id });

  // First pass: build raw cells with taken/past flags.
  const cells = [];
  for (let t = dayStart.clone(); t.isBefore(dayEnd); t = t.add(step, 'minute')) {
    const cellStart = t;
    const cellEnd   = t.add(step, 'minute');

    const booking = existing.find((b) => {
      const bStart = dayjs(b.starts_at);
      const bEnd   = dayjs(b.ends_at);
      return cellStart.isBefore(bEnd) && cellEnd.isAfter(bStart);
    });

    const past = cellStart.isBefore(now);

    cells.push({
      iso:        cellStart.toISOString(),
      time:       cellStart.format('HH:mm'),
      endTime:    cellEnd.format('HH:mm'),
      taken:      !!booking,
      past,
      blocked:    !!booking || past || closedAllDay,   // can't be part of any new booking
      selectable: false,                               // computed in 2nd pass
      bookingId:  booking ? booking.id : null,
      bookedBy:   booking ? booking.student_name || '' : null,
      initials:   booking ? initialsOf(booking.student_name) : null,
      status:     booking ? booking.status : null,
    });
  }

  // Second pass: a cell is selectable (a valid START) only if the next `cellsNeeded`
  // cells all exist and are unblocked (i.e. the full run fits with no overlap, in hours,
  // not in the past, lab open).
  for (let i = 0; i < cells.length; i++) {
    if (cells[i].blocked) continue;
    if (i + cellsNeeded > cells.length) continue;      // would run past close
    let ok = true;
    for (let j = 0; j < cellsNeeded; j++) {
      if (cells[i + j].blocked) { ok = false; break; }
    }
    cells[i].selectable = ok;
  }

  const anySelectable = cells.some((c) => c.selectable);
  return { cells, cellsNeeded, totalMinutes: total, stepMinutes: step, closedAllDay, anySelectable };
}

// Back-compat shim (older view); returns flat list of valid start times
async function buildSlots({ instrument, dateISO }) {
  const { cells, cellsNeeded, totalMinutes } = await buildDayGrid({ instrument, dateISO });
  const slots = cells.map((c, i) => {
    const range = cells.slice(i, i + cellsNeeded);
    const taken = range.length < cellsNeeded || range.some((r) => r.taken);
    const endIso = range.length
      ? (range[range.length - 1] ? dayjs(range[range.length - 1].iso).add(instrument.slot_step_minutes || 30, 'minute').toISOString() : c.iso)
      : c.iso;
    return {
      startIso: c.iso,
      endIso,
      label: `${c.time} – ${dayjs(c.iso).add(totalMinutes, 'minute').format('HH:mm')}`,
      taken,
    };
  });
  return { slots, totalMinutes };
}

const db = require('../db');

async function createBooking({ student, instrumentId, payload }) {
  const instrument = await instrumentRepo.findActiveById(instrumentId);
  if (!instrument) throw new NotFoundError('Instrument');

  if (!payload.starts_at) {
    throw new ValidationError('Please pick a start time on the timeline first.');
  }

  const total = instrument.experiment_minutes + instrument.maintenance_minutes;
  const start = dayjs(payload.starts_at);
  if (!start.isValid()) throw new ValidationError('Invalid start time.');
  const startsAt = start.toISOString();
  const endsAt = start.add(total, 'minute').toISOString();

  // Don't allow past slots (give a 5-min grace so a click right on the hour boundary still works)
  if (start.isBefore(dayjs().subtract(5, 'minute'))) {
    throw new ValidationError('Cannot book a slot in the past. Pick a later time.');
  }

  // Holiday / lab-closed check
  const dateISO = start.format('YYYY-MM-DD');
  if (await holidayRepo.isClosedOn({ dateISO, instrumentId: instrument.id })) {
    throw new ConflictError('The lab is closed on that date. Please pick another day.');
  }

  // Lab-hours check using minutes-since-midnight, not just hour (so 21:30 with close_hour=21 is rejected).
  const startMins = start.hour() * 60 + start.minute();
  const endMins   = startMins + total;
  const openMins  = instrument.open_hour * 60;
  const closeMins = instrument.close_hour * 60;
  if (startMins < openMins) {
    throw new ValidationError(`Booking starts before lab opens (${pad(instrument.open_hour)}:00).`);
  }
  if (endMins > closeMins) {
    throw new ValidationError(`Booking would run past lab close (${pad(instrument.close_hour)}:00). Pick an earlier start.`);
  }

  // Supervisor is a single configured default (admin Settings), not student-chosen.
  const supervisor = await resolveDefaultSupervisor();
  if (!supervisor) {
    throw new ValidationError('No faculty supervisor is configured yet. Please contact the lab admin.');
  }

  // Atomically: re-check conflict & "you already booked this" inside a transaction
  // so two rapid submissions can't both succeed on the same slot. All three queries
  // run on the SAME connection (client) so BEGIN/COMMIT actually isolates them.
  const newId = await db.tx(async (client) => {
    const mine = (await client.query(
      `SELECT id FROM bookings
       WHERE student_id = $1 AND instrument_id = $2
         AND status IN ('pending_technician','pending_faculty','approved')
         AND NOT (ends_at <= $3 OR starts_at >= $4)
       LIMIT 1`,
      [student.id, instrument.id, startsAt, endsAt],
    )).rows[0];
    if (mine) {
      throw new ConflictError('You already have a booking that overlaps this slot for this instrument.');
    }

    const clash = (await client.query(
      `SELECT 1 FROM bookings
       WHERE instrument_id = $1
         AND status IN ('pending_technician','pending_faculty','approved')
         AND NOT (ends_at <= $2 OR starts_at >= $3)
       LIMIT 1`,
      [instrument.id, startsAt, endsAt],
    )).rows[0];
    if (clash) {
      throw new ConflictError('That slot is no longer free — someone else just booked it. Please pick another.');
    }

    const inserted = (await client.query(
      `INSERT INTO bookings (student_id, instrument_id, supervisor_id, starts_at, ends_at, purpose, sample_count, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending_technician') RETURNING id`,
      [student.id, instrument.id, supervisor.id, startsAt, endsAt, payload.purpose || null, payload.sample_count || 1],
    )).rows[0];
    return inserted.id;
  });

  const booking = await bookingRepo.findById(newId);

  await bookingRepo.log({ bookingId: booking.id, actorId: student.id, action: 'submitted' });
  await bookingRepo.logEvent({ bookingId: booking.id, actorId: student.id, eventType: 'submitted', toStatus: 'pending_technician' });

  // Fire-and-forget email to technician
  if (instrument.technician_id) {
    const tech = await userRepo.findById(instrument.technician_id);
    if (tech) {
      const decorated = decorateBooking({
        ...booking,
        instrument_name: instrument.name,
        student_name: student.name,
      });
      mail.pendingTechnicianMail(tech, decorated).catch((e) => console.error('mail fail', e));
    }
  }

  return booking;
}

function pad(n) { return String(n).padStart(2, '0'); }

// The single default supervisor all bookings route to. Configured in admin
// Settings (default_supervisor_id); falls back to the first faculty on file.
async function resolveDefaultSupervisor() {
  const id = await settingsRepo.get('default_supervisor_id');
  if (id) {
    const u = await userRepo.findById(Number(id));
    if (u && u.role === 'faculty') return u;
  }
  const facs = await userRepo.listByRole('faculty');
  return facs[0] || null;
}

// ── Multi-day (date-range) booking, for daily-mode equipment ──────────────
// The instrument's duration_days is fixed; the student picks a START date and
// the booking spans that many days (e.g. a 30-day bioreactor run).
async function createDailyBooking({ student, instrumentId, payload }) {
  const instrument = await instrumentRepo.findActiveById(instrumentId);
  if (!instrument) throw new NotFoundError('Instrument');

  const durationDays = instrument.duration_days || 1;
  const dateStr = String(payload.date || '').slice(0, 10);
  const start = dayjs(`${dateStr}T${pad(instrument.open_hour)}:00:00`);
  if (!dateStr || !start.isValid()) throw new ValidationError('Please pick a valid start date.');

  const startsAt = start.toISOString();
  const endsAt = start.add(durationDays, 'day').toISOString();

  if (start.isBefore(dayjs().startOf('day'))) {
    throw new ValidationError('Cannot book a start date in the past.');
  }
  if (await holidayRepo.isClosedOn({ dateISO: dateStr, instrumentId: instrument.id })) {
    throw new ConflictError('The lab is closed on that start date. Please pick another.');
  }

  const supervisor = await resolveDefaultSupervisor();
  if (!supervisor) throw new ValidationError('No faculty supervisor is configured yet. Please contact the lab admin.');

  const newId = await db.tx(async (client) => {
    const mine = (await client.query(
      `SELECT id FROM bookings WHERE student_id=$1 AND instrument_id=$2
        AND status IN ('pending_technician','pending_faculty','approved')
        AND NOT (ends_at <= $3 OR starts_at >= $4) LIMIT 1`,
      [student.id, instrument.id, startsAt, endsAt])).rows[0];
    if (mine) throw new ConflictError('You already have a booking overlapping these dates for this instrument.');

    const clash = (await client.query(
      `SELECT 1 FROM bookings WHERE instrument_id=$1
        AND status IN ('pending_technician','pending_faculty','approved')
        AND NOT (ends_at <= $2 OR starts_at >= $3) LIMIT 1`,
      [instrument.id, startsAt, endsAt])).rows[0];
    if (clash) throw new ConflictError('Those dates overlap an existing booking. Please pick another start date.');

    const inserted = (await client.query(
      `INSERT INTO bookings (student_id, instrument_id, supervisor_id, starts_at, ends_at, purpose, sample_count, booking_mode, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'daily','pending_technician') RETURNING id`,
      [student.id, instrument.id, supervisor.id, startsAt, endsAt, payload.purpose || null, payload.sample_count || 1])).rows[0];
    return inserted.id;
  });

  const booking = await bookingRepo.findById(newId);
  await bookingRepo.log({ bookingId: booking.id, actorId: student.id, action: 'submitted' });
  await bookingRepo.logEvent({ bookingId: booking.id, actorId: student.id, eventType: 'submitted', toStatus: 'pending_technician' });

  if (instrument.technician_id) {
    const tech = await userRepo.findById(instrument.technician_id);
    if (tech) {
      const decorated = decorateBooking({ ...booking, instrument_name: instrument.name, student_name: student.name });
      mail.pendingTechnicianMail(tech, decorated).catch((e) => console.error('mail fail', e));
    }
  }
  return booking;
}

async function technicianApprove({ actor, bookingId }) {
  const b = await bookingRepo.findById(bookingId);
  if (!b) throw new NotFoundError('Booking');
  if (b.status !== 'pending_technician') throw new ConflictError('Booking is no longer pending technician approval.');
  if (actor.role !== 'admin' && b.instrument_technician_id !== actor.id) throw new ForbiddenError('Not your instrument.');

  await bookingRepo.setStatus(b.id, 'pending_faculty', { technician_acted_at: dayjs().toISOString() });
  await bookingRepo.log({ bookingId: b.id, actorId: actor.id, action: 'technician_approved' });
  await bookingRepo.logEvent({ bookingId: b.id, actorId: actor.id, eventType: 'technician_approved', fromStatus: 'pending_technician', toStatus: 'pending_faculty' });

  const faculty = b.supervisor_id ? await userRepo.findById(b.supervisor_id) : null;
  if (faculty) mail.pendingFacultyMail(faculty, decorateBooking(b)).catch((e) => console.error('mail fail', e));
  return bookingRepo.findById(b.id);
}

async function facultyApprove({ actor, bookingId }) {
  const b = await bookingRepo.findById(bookingId);
  if (!b) throw new NotFoundError('Booking');
  if (b.status !== 'pending_faculty') throw new ConflictError('Booking is no longer pending faculty approval.');
  if (actor.role !== 'admin' && b.supervisor_id !== actor.id) throw new ForbiddenError('Not your supervisee.');

  await bookingRepo.setStatus(b.id, 'approved', { faculty_acted_at: dayjs().toISOString() });
  await bookingRepo.log({ bookingId: b.id, actorId: actor.id, action: 'faculty_approved' });
  await bookingRepo.logEvent({ bookingId: b.id, actorId: actor.id, eventType: 'faculty_approved', fromStatus: 'pending_faculty', toStatus: 'approved' });

  const student = await userRepo.findById(b.student_id);
  if (student) mail.approvedMail(student, decorateBooking(b)).catch((e) => console.error('mail fail', e));
  return bookingRepo.findById(b.id);
}

async function reject({ actor, bookingId, stage, reason }) {
  const b = await bookingRepo.findById(bookingId);
  if (!b) throw new NotFoundError('Booking');
  const expectedStatus = stage === 'technician' ? 'pending_technician' : 'pending_faculty';
  if (b.status !== expectedStatus) throw new ConflictError('Booking is no longer actionable.');
  if (actor.role !== 'admin') {
    if (stage === 'technician' && b.instrument_technician_id !== actor.id) throw new ForbiddenError('Not your instrument.');
    if (stage === 'faculty'    && b.supervisor_id !== actor.id) throw new ForbiddenError('Not your supervisee.');
  }

  const fromStatus = b.status;
  await bookingRepo.setStatus(b.id, 'rejected', { rejection_reason: reason });
  await bookingRepo.log({ bookingId: b.id, actorId: actor.id, action: stage + '_rejected', note: reason });
  await bookingRepo.logEvent({ bookingId: b.id, actorId: actor.id, eventType: stage + '_rejected', fromStatus, toStatus: 'rejected', detail: reason });

  const student = await userRepo.findById(b.student_id);
  if (student) mail.rejectedMail(student, decorateBooking(b), reason).catch((e) => console.error('mail fail', e));
  return bookingRepo.findById(b.id);
}

async function cancelByStudent({ student, bookingId }) {
  const b = await bookingRepo.findById(bookingId);
  if (!b) throw new NotFoundError('Booking');
  if (b.student_id !== student.id) throw new ForbiddenError('Not your booking.');
  if (!['pending_technician','pending_faculty','approved'].includes(b.status)) {
    throw new ConflictError('Booking cannot be cancelled in its current state.');
  }
  const fromStatus = b.status;
  bookingRepo.setStatus(b.id, 'cancelled');
  bookingRepo.log({ bookingId: b.id, actorId: student.id, action: 'cancelled' });
  bookingRepo.logEvent({ bookingId: b.id, actorId: student.id, eventType: 'cancelled', fromStatus, toStatus: 'cancelled' });
}

module.exports = {
  buildSlots,
  buildDayGrid,
  resolveDefaultSupervisor,
  createBooking,
  createDailyBooking,
  technicianApprove,
  facultyApprove,
  reject,
  cancelByStudent,
};
