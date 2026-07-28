const db = require('../db');

module.exports = {
  async listAll() {
    return db.all(`
      SELECT h.*, i.name AS instrument_name, u.name AS creator_name
      FROM holidays h
      LEFT JOIN instruments i ON i.id = h.instrument_id
      LEFT JOIN users u ON u.id = h.created_by
      ORDER BY h.date DESC LIMIT 200
    `);
  },
  async upcoming() {
    return db.all(`SELECT * FROM holidays WHERE date >= to_char(now(),'YYYY-MM-DD') ORDER BY date ASC`);
  },
  async isClosedOn({ dateISO, instrumentId = null }) {
    const row = await db.get(
      `SELECT 1 FROM holidays
       WHERE date = $1 AND (instrument_id IS NULL OR instrument_id = $2)
       LIMIT 1`,
      [dateISO, instrumentId],
    );
    return !!row;
  },
  async add({ date, label, instrumentId = null, createdBy }) {
    const row = await db.get(
      `INSERT INTO holidays (date, label, instrument_id, created_by) VALUES ($1,$2,$3,$4) RETURNING id`,
      [date, label, instrumentId, createdBy],
    );
    return db.get(`SELECT * FROM holidays WHERE id = $1`, [row.id]);
  },
  async remove(id) {
    await db.run(`DELETE FROM holidays WHERE id = $1`, [id]);
  },
};
