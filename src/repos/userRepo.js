const db = require('../db');

const SELECT = `SELECT id, email, name, phone, role, department, supervisor_id, id_no, created_at FROM users`;

module.exports = {
  async findById(id) {
    return db.get(`${SELECT} WHERE id = $1`, [id]);
  },
  async findByEmail(email) {
    return db.get(`${SELECT} WHERE lower(email) = lower($1)`, [email]);
  },
  async listByRole(role) {
    return db.all(`${SELECT} WHERE role = $1 ORDER BY name`, [role]);
  },
  async listAll() {
    return db.all(`
      SELECT u.*, s.name AS supervisor_name
      FROM users u LEFT JOIN users s ON s.id = u.supervisor_id
      ORDER BY u.role, u.name
    `);
  },
  async create({ email, name, phone = null, role = 'student', department = null, supervisor_id = null }) {
    const row = await db.get(
      `INSERT INTO users (email, name, phone, role, department, supervisor_id)
       VALUES (lower($1), $2, $3, $4, $5, $6) RETURNING id`,
      [email, name, phone, role, department, supervisor_id],
    );
    return this.findById(row.id);
  },
  async update(id, patch) {
    const fields = [];
    const values = [];
    let n = 1;
    for (const k of ['name', 'phone', 'role', 'department', 'supervisor_id']) {
      if (k in patch) { fields.push(`${k} = $${n++}`); values.push(patch[k] ?? null); }
    }
    if (!fields.length) return this.findById(id);
    values.push(id);
    await db.run(`UPDATE users SET ${fields.join(', ')} WHERE id = $${n}`, values);
    return this.findById(id);
  },
  async count() {
    const row = await db.get(`SELECT COUNT(*)::int AS c FROM users`);
    return row.c;
  },
};
