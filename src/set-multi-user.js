// One-time sync: mark "Multiple User" (shared) equipment from the
// "Equipment Allocation List.xlsx" the professor provided. Shared instruments
// allow several people to book the same time slot (fridges, cold rooms, ovens,
// incubators, etc.). Run once after the DB is up:  node src/set-multi-user.js
//
// Idempotent + authoritative: the codes below are set multi_user=1 and every
// other instrument is set multi_user=0, so re-running always matches the sheet.

require('dotenv').config();
const db = require('./db');

// From "Equipment Allocation List.xlsx" — rows flagged "Multiple User".
const MULTI_USER_CODES = [
  'EBT-06', // Shaking Incubator
  'EBT-19', // Hot Air Oven
  'EBT-28', // Cold Room
  'EBT-29', // Deep Freezer
  'EBT-31', // Refrigerator
  'EBT-32', // Refrigerator
  'FSM-07', // Static Incubator
  'FSM-15', // Refrigerator
  'PUR-12', // Shaking Incubator
  'PUR-18', // Refrigerator
];

async function main() {
  await db.init(); // ensures the multi_user column exists

  // Reset all, then flag the listed ones — keeps the DB an exact mirror of the sheet.
  await db.run(`UPDATE instruments SET multi_user = 0`);
  const res = await db.run(
    `UPDATE instruments SET multi_user = 1 WHERE code = ANY($1)`,
    [MULTI_USER_CODES],
  );

  const rows = await db.all(
    `SELECT code, name, multi_user FROM instruments WHERE code = ANY($1) ORDER BY code`,
    [MULTI_USER_CODES],
  );
  const foundCodes = new Set(rows.map((r) => r.code));
  const missing = MULTI_USER_CODES.filter((c) => !foundCodes.has(c));

  console.log(`Marked ${rows.length} instrument(s) as Multiple User (shared):`);
  for (const r of rows) console.log(`  ${r.code}  ${r.name}`);
  if (missing.length) {
    console.log(`\n⚠ These codes from the sheet were NOT found in the DB:`);
    for (const c of missing) console.log(`  ${c}`);
  }
  console.log('\nDone.');
  process.exit(0);
}

main().catch((e) => { console.error('Failed:', e.message); process.exit(1); });
