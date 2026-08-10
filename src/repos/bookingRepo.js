const db = require('../db');

const DECORATED_SELECT = `
  SELECT b.*,
    i.name AS instrument_name, i.code AS instrument_code, i.technician_id AS instrument_technician_id,
    s.name AS student_name, s.email AS student_email,
    f.name AS faculty_name
  FROM bookings b
  JOIN instruments i ON i.id = b.instrument_id
  JOIN users s ON s.id = b.student_id
  LEFT JOIN users f ON f.id = b.supervisor_id
`;

module.exports = {
  async findById(id) {
    return db.get(`${DECORATED_SELECT} WHERE b.id = $1`, [id]);
  },
  async forStudent(studentId, limit = 50) {
    return db.all(`${DECORATED_SELECT} WHERE b.student_id = $1 ORDER BY b.starts_at DESC LIMIT $2`, [studentId, limit]);
  },
  async pendingForTechnician({ userId, adminOverride = false }) {
    const where = adminOverride ? '' : 'AND i.technician_id = $1';
    const params = adminOverride ? [] : [userId];
    return db.all(`${DECORATED_SELECT} WHERE b.status = 'pending_technician' ${where} ORDER BY b.created_at ASC`, params);
  },
  async historyForTechnician({ userId, adminOverride = false, limit = 20 }) {
    if (adminOverride) {
      return db.all(`${DECORATED_SELECT} WHERE b.status <> 'pending_technician' ORDER BY b.created_at DESC LIMIT $1`, [limit]);
    }
    return db.all(`${DECORATED_SELECT} WHERE b.status <> 'pending_technician' AND i.technician_id = $1 ORDER BY b.created_at DESC LIMIT $2`, [userId, limit]);
  },
  async pendingForFaculty({ userId, adminOverride = false }) {
    const where = adminOverride ? '' : 'AND b.supervisor_id = $1';
    const params = adminOverride ? [] : [userId];
    return db.all(`${DECORATED_SELECT} WHERE b.status = 'pending_faculty' ${where} ORDER BY b.created_at ASC`, params);
  },
  async historyForFaculty({ userId, adminOverride = false, limit = 20 }) {
    if (adminOverride) {
      return db.all(`${DECORATED_SELECT} WHERE b.status IN ('approved','rejected','cancelled','completed') ORDER BY b.created_at DESC LIMIT $1`, [limit]);
    }
    return db.all(`${DECORATED_SELECT} WHERE b.status IN ('approved','rejected','cancelled','completed') AND b.supervisor_id = $1 ORDER BY b.created_at DESC LIMIT $2`, [userId, limit]);
  },
  async hasConflict({ instrumentId, startsAt, endsAt, excludeId = null }) {
    const params = [instrumentId, startsAt, endsAt];
    let sql = `SELECT 1 FROM bookings
      WHERE instrument_id = $1
        AND status IN ('pending_technician','pending_faculty','approved')
        AND NOT (ends_at <= $2 OR starts_at >= $3)`;
    if (excludeId) { sql += ` AND id <> $4`; params.push(excludeId); }
    const row = await db.get(sql, params);
    return !!row;
  },
  async upcomingForInstrument(instrumentId) {
    return db.all(`
      SELECT b.starts_at, b.ends_at, b.status, s.name AS student_name
      FROM bookings b JOIN users s ON s.id = b.student_id
      WHERE b.instrument_id = $1
        AND b.status IN ('pending_technician','pending_faculty','approved')
        AND b.ends_at::timestamptz >= now()
      ORDER BY b.starts_at ASC
    `, [instrumentId]);
  },
  async sameDay({ instrumentId, dateISO }) {
    return db.all(`
      SELECT b.id, b.starts_at, b.ends_at, b.status, b.student_id, s.name AS student_name
      FROM bookings b
      JOIN users s ON s.id = b.student_id
      WHERE b.instrument_id = $1
        AND substr(b.starts_at, 1, 10) = $2
        AND b.status IN ('pending_technician','pending_faculty','approved')
    `, [instrumentId, dateISO]);
  },
  async create({ studentId, instrumentId, supervisorId, startsAt, endsAt, purpose, sampleCount = 1 }) {
    const row = await db.get(
      `INSERT INTO bookings (student_id, instrument_id, supervisor_id, starts_at, ends_at, purpose, sample_count, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending_technician') RETURNING id`,
      [studentId, instrumentId, supervisorId, startsAt, endsAt, purpose, sampleCount],
    );
    return this.findById(row.id);
  },
  async logEvent({ bookingId, actorId, eventType, fromStatus = null, toStatus = null, detail = null }) {
    await db.run(
      `INSERT INTO booking_events (booking_id, actor_id, event_type, from_status, to_status, detail)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [bookingId, actorId, eventType, fromStatus, toStatus, detail],
    );
  },
  async eventsFor(bookingId) {
    return db.all(`
      SELECT e.*, u.name AS actor_name, u.role AS actor_role
      FROM booking_events e LEFT JOIN users u ON u.id = e.actor_id
      WHERE e.booking_id = $1 ORDER BY e.id ASC
    `, [bookingId]);
  },
  async setStatus(id, status, extra = {}) {
    const sets = ['status = $1'];
    const values = [status];
    let n = 2;
    for (const col of ['technician_acted_at', 'faculty_acted_at', 'rejection_reason', 'completed_at', 'closure_requested_at']) {
      if (col in extra) { sets.push(`${col} = $${n++}`); values.push(extra[col]); }
    }
    values.push(id);
    await db.run(`UPDATE bookings SET ${sets.join(', ')} WHERE id = $${n}`, values);
    return this.findById(id);
  },
  async recent(limit = 15) {
    return db.all(`${DECORATED_SELECT} ORDER BY b.created_at DESC LIMIT $1`, [limit]);
  },
  async countByStatus(statuses) {
    const placeholders = statuses.map((_, i) => `$${i + 1}`).join(',');
    const row = await db.get(`SELECT COUNT(*)::int AS c FROM bookings WHERE status IN (${placeholders})`, statuses);
    return row.c;
  },
  async countApprovedFuture() {
    const row = await db.get(`SELECT COUNT(*)::int AS c FROM bookings WHERE status='approved' AND starts_at::timestamptz > now()`);
    return row.c;
  },
  async log({ bookingId, actorId, action, note = null }) {
    await db.run(`INSERT INTO audit_log (booking_id, actor_id, action, note) VALUES ($1,$2,$3,$4)`, [bookingId, actorId, action, note]);
  },
};
