const db = require('../db');

module.exports = {
  async get(key, fallback = null) {
    const row = await db.get(`SELECT value FROM system_settings WHERE key = $1`, [key]);
    return row ? row.value : fallback;
  },
  async getMany(keys) {
    const rows = await db.all(
      `SELECT key, value FROM system_settings WHERE key = ANY($1)`,
      [keys],
    );
    const out = {};
    for (const r of rows) out[r.key] = r.value;
    return out;
  },
  async set(key, value, updatedBy = null) {
    await db.run(
      `INSERT INTO system_settings (key, value, updated_by, updated_at)
       VALUES ($1, $2, $3, ${db.ISO_NOW})
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = ${db.ISO_NOW}`,
      [key, value == null ? null : String(value), updatedBy],
    );
  },
};
