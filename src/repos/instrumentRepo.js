const db = require('../db');

module.exports = {
  async findById(id) {
    return db.get(`SELECT * FROM instruments WHERE id = $1`, [id]);
  },
  async findActiveById(id) {
    return db.get(`SELECT * FROM instruments WHERE id = $1 AND active = 1`, [id]);
  },
  async listActive() {
    return db.all(`
      SELECT i.*, u.name AS technician_name
      FROM instruments i LEFT JOIN users u ON u.id = i.technician_id
      WHERE i.active = 1 ORDER BY i.name
    `);
  },
  async listAll() {
    return db.all(`
      SELECT i.*, u.name AS technician_name
      FROM instruments i LEFT JOIN users u ON u.id = i.technician_id
      ORDER BY i.active DESC, i.name
    `);
  },
  async create(p) {
    const row = await db.get(
      `INSERT INTO instruments
        (code, name, description, location, experiment_minutes, maintenance_minutes, open_hour, close_hour, technician_id, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [p.code, p.name, p.description, p.location, p.experiment_minutes, p.maintenance_minutes,
       p.open_hour, p.close_hour, p.technician_id, p.active],
    );
    return this.findById(row.id);
  },
  async update(id, p) {
    await db.run(
      `UPDATE instruments SET
         code=$1, name=$2, description=$3, location=$4,
         experiment_minutes=$5, maintenance_minutes=$6,
         open_hour=$7, close_hour=$8, technician_id=$9, active=$10,
         updated_at=${db.ISO_NOW}
       WHERE id=$11`,
      [p.code, p.name, p.description, p.location, p.experiment_minutes, p.maintenance_minutes,
       p.open_hour, p.close_hour, p.technician_id, p.active, id],
    );
    return this.findById(id);
  },
  async deactivate(id) {
    await db.run(`UPDATE instruments SET active = 0 WHERE id = $1`, [id]);
  },
  async countActive() {
    const row = await db.get(`SELECT COUNT(*)::int AS c FROM instruments WHERE active = 1`);
    return row.c;
  },
};
