require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('./db');

// One-time (idempotent) import of the real BEST Lab equipment from the parsed
// spreadsheet. Re-runnable: codes are stable, so it upserts rather than duplicates.
//
//   node src/import-equipment.js
//
// Duration rule (from the sheet's "Analysis Duration"):
//   * "N hour(s)"  -> hourly booking, experiment_minutes = N*60
//   * "N day(s)"   -> daily booking,  duration_days = N (uses date-range mode)

const LAB_PREFIX = { 'PURSE Lab': 'PUR', 'EBT Lab': 'EBT', 'FSM Lab': 'FSM' };

async function main() {
  await db.init();

  const raw = fs.readFileSync(path.join(__dirname, 'data-equipment.json'), 'utf-8');
  const items = JSON.parse(raw);

  // Deactivate the old demo instruments so only real equipment shows.
  await db.run(`UPDATE instruments SET active = 0 WHERE code IN ('GC','COD','HPLC','FTIR','UV')`);

  const counters = {};
  let inserted = 0, updated = 0;

  for (const it of items) {
    const prefix = LAB_PREFIX[it.lab] || (it.lab || 'EQ').slice(0, 3).toUpperCase();
    counters[prefix] = (counters[prefix] || 0) + 1;
    const code = `${prefix}-${String(counters[prefix]).padStart(2, '0')}`;

    const hourly = it.mode === 'hourly';
    const experiment_minutes = hourly ? it.dur_val : 60; // nominal for daily
    const duration_days = hourly ? null : it.dur_val;

    const existing = await db.get(`SELECT id FROM instruments WHERE code = $1`, [code]);

    const params = {
      code,
      name: it.name,
      description: it.parameters || null,
      location: it.location || it.lab || null,
      lab: it.lab || null,
      asset_no: it.asset || null,
      make_model: it.make || null,
      parameters: it.parameters || null,
      category: it.category || null,
      status: 'working',
      booking_mode: it.mode,
      experiment_minutes,
      maintenance_minutes: 0,
      duration_days,
      open_hour: 9,
      close_hour: 21,
      active: 1,
    };

    if (existing) {
      await db.run(
        `UPDATE instruments SET
           name=$1, description=$2, location=$3, lab=$4, asset_no=$5, make_model=$6,
           parameters=$7, category=$8, status=$9, booking_mode=$10,
           experiment_minutes=$11, maintenance_minutes=$12, duration_days=$13,
           open_hour=$14, close_hour=$15, active=1, updated_at=${db.ISO_NOW}
         WHERE code=$16`,
        [params.name, params.description, params.location, params.lab, params.asset_no,
         params.make_model, params.parameters, params.category, params.status, params.booking_mode,
         params.experiment_minutes, params.maintenance_minutes, params.duration_days,
         params.open_hour, params.close_hour, code],
      );
      updated++;
    } else {
      await db.run(
        `INSERT INTO instruments
           (code, name, description, location, lab, asset_no, make_model, parameters, category,
            status, booking_mode, experiment_minutes, maintenance_minutes, duration_days,
            open_hour, close_hour, active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,1)`,
        [params.code, params.name, params.description, params.location, params.lab, params.asset_no,
         params.make_model, params.parameters, params.category, params.status, params.booking_mode,
         params.experiment_minutes, params.maintenance_minutes, params.duration_days,
         params.open_hour, params.close_hour],
      );
      inserted++;
    }
  }

  console.log(`Equipment import complete: ${inserted} added, ${updated} updated (of ${items.length}).`);
  console.log('Demo instruments (GC/COD/HPLC/FTIR/UV) deactivated.');
  await db.pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
