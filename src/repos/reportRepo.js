const db = require('../db');

// Flexible filtered query. All filters optional.
async function queryBookings({ from, to, instrumentId, status, supervisorId, technicianId, studentId, limit = 1000 } = {}) {
  const where = [];
  const params = [];
  const add = (clause, val) => { params.push(val); where.push(clause.replace('$$', `$${params.length}`)); };

  if (from)         add(`substr(b.starts_at,1,10) >= $$`, from);
  if (to)           add(`substr(b.starts_at,1,10) <= $$`, to);
  if (instrumentId) add(`b.instrument_id = $$`, instrumentId);
  if (status)       add(`b.status = $$`, status);
  if (supervisorId) add(`b.supervisor_id = $$`, supervisorId);
  if (technicianId) add(`i.technician_id = $$`, technicianId);
  if (studentId)    add(`b.student_id = $$`, studentId);

  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(limit);
  return db.all(`
    SELECT b.*,
      i.name AS instrument_name, i.code AS instrument_code,
      s.name AS student_name, s.email AS student_email, s.department AS student_department,
      f.name AS supervisor_name, f.email AS supervisor_email,
      t.name AS technician_name
    FROM bookings b
    JOIN instruments i ON i.id = b.instrument_id
    JOIN users s ON s.id = b.student_id
    LEFT JOIN users f ON f.id = b.supervisor_id
    LEFT JOIN users t ON t.id = i.technician_id
    ${w}
    ORDER BY b.starts_at DESC LIMIT $${params.length}
  `, params);
}

function summarize(rows) {
  const total = rows.length;
  const byStatus = {};
  const byInstrument = {};
  let totalMinutes = 0;
  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    byInstrument[r.instrument_name] = (byInstrument[r.instrument_name] || 0) + 1;
    const mins = Math.round((new Date(r.ends_at) - new Date(r.starts_at)) / 60000);
    if (r.status === 'approved' || r.status === 'completed') totalMinutes += mins;
  }
  return { total, byStatus, byInstrument, totalHours: Math.round(totalMinutes / 60 * 10) / 10 };
}

module.exports = { queryBookings, summarize };
