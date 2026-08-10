const db = require('../db');

const SELECT = `
  SELECT c.*,
    r.name AS raiser_name, r.email AS raiser_email,
    i.name AS instrument_name, i.code AS instrument_code,
    a.name AS assignee_name
  FROM complaints c
  JOIN users r ON r.id = c.raised_by
  LEFT JOIN instruments i ON i.id = c.instrument_id
  LEFT JOIN users a ON a.id = c.assigned_to
`;

module.exports = {
  async findById(id) {
    return db.get(`${SELECT} WHERE c.id = $1`, [id]);
  },
  async forUser(userId) {
    return db.all(`${SELECT} WHERE c.raised_by = $1 ORDER BY c.created_at DESC`, [userId]);
  },
  async listAll({ status = '' } = {}) {
    if (status) return db.all(`${SELECT} WHERE c.status = $1 ORDER BY c.created_at DESC`, [status]);
    return db.all(`${SELECT} ORDER BY
      CASE c.status WHEN 'open' THEN 0 WHEN 'assigned' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'resolved' THEN 3 ELSE 4 END,
      CASE c.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
      c.created_at DESC`);
  },
  async create({ raisedBy, instrumentId = null, bookingId = null, category = null, subject, description = null, priority = 'medium', attachmentUrl = null }) {
    const row = await db.get(
      `INSERT INTO complaints (raised_by, instrument_id, booking_id, category, subject, description, priority, attachment_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [raisedBy, instrumentId, bookingId, category, subject, description, priority, attachmentUrl],
    );
    return this.findById(row.id);
  },
  async update(id, patch) {
    const cols = [];
    const vals = [];
    let n = 1;
    for (const k of ['status', 'priority', 'assigned_to', 'resolution', 'resolved_at']) {
      if (k in patch) { cols.push(`${k} = $${n++}`); vals.push(patch[k] ?? null); }
    }
    if (!cols.length) return this.findById(id);
    vals.push(id);
    await db.run(`UPDATE complaints SET ${cols.join(', ')} WHERE id = $${n}`, vals);
    return this.findById(id);
  },
  async addEvent({ complaintId, actorId, eventType, detail = null }) {
    await db.run(
      `INSERT INTO complaint_events (complaint_id, actor_id, event_type, detail) VALUES ($1,$2,$3,$4)`,
      [complaintId, actorId, eventType, detail],
    );
  },
  async eventsFor(complaintId) {
    return db.all(`
      SELECT e.*, u.name AS actor_name, u.role AS actor_role
      FROM complaint_events e LEFT JOIN users u ON u.id = e.actor_id
      WHERE e.complaint_id = $1 ORDER BY e.id ASC
    `, [complaintId]);
  },
  async countOpen() {
    const row = await db.get(`SELECT COUNT(*)::int AS c FROM complaints WHERE status NOT IN ('resolved','closed')`);
    return row.c;
  },
};
