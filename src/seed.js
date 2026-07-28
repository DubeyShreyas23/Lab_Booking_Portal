require('dotenv').config();
const db = require('./db');

// Idempotent demo seed — safe to run multiple times. Requires DATABASE_URL.
const seedUsers = [
  { email: 'admin@hyderabad.bits-pilani.ac.in',     name: 'Lab Administrator',       phone: '+91 9000000000', role: 'admin' },
  { email: 'sangan@hyderabad.bits-pilani.ac.in',    name: 'Prof. P. Sankar Ganesh',  phone: '+91 9000000001', role: 'faculty', department: 'Biological Sciences' },
  { email: 'rganesan@hyderabad.bits-pilani.ac.in',  name: 'Dr Ramakrishnan Ganesan', phone: '+91 9000000002', role: 'faculty', department: 'Chemistry' },
  { email: 'tech.gc@hyderabad.bits-pilani.ac.in',   name: 'GC Technician',           phone: '+91 9000000003', role: 'technician' },
  { email: 'tech.cod@hyderabad.bits-pilani.ac.in',  name: 'COD Technician',          phone: '+91 9000000004', role: 'technician' },
  { email: 'p20250086@hyderabad.bits-pilani.ac.in', name: 'Balamanikandan R',        phone: '+91 6380963983', role: 'student', department: 'Biological Sciences' },
  { email: 'f20231386@hyderabad.bits-pilani.ac.in', name: 'Demo Student',            phone: '+91 9000000010', role: 'student' },
];

const seedInstruments = [
  { code: 'GC',   name: 'Gas Chromatograph',        description: 'Analyses volatile compounds in gas phase.', location: 'CAL Room 204', experiment_minutes: 420, maintenance_minutes: 60, tech: 'tech.gc@hyderabad.bits-pilani.ac.in' },
  { code: 'COD',  name: 'COD Digester',             description: 'Chemical Oxygen Demand for water samples.', location: 'CAL Room 207', experiment_minutes: 180, maintenance_minutes: 60, tech: 'tech.cod@hyderabad.bits-pilani.ac.in' },
  { code: 'HPLC', name: 'HPLC',                     description: 'High Performance Liquid Chromatography.',   location: 'CAL Room 205', experiment_minutes: 240, maintenance_minutes: 30, tech: 'tech.gc@hyderabad.bits-pilani.ac.in' },
  { code: 'FTIR', name: 'FTIR Spectrometer',        description: 'Fourier-transform infrared spectroscopy.',  location: 'CAL Room 203', experiment_minutes: 60,  maintenance_minutes: 15, tech: 'tech.cod@hyderabad.bits-pilani.ac.in' },
  { code: 'UV',   name: 'UV-Vis Spectrophotometer', description: 'Quantitative absorbance measurement.',      location: 'CAL Room 203', experiment_minutes: 45,  maintenance_minutes: 15, tech: 'tech.cod@hyderabad.bits-pilani.ac.in' },
];

async function main() {
  await db.init();

  const userIds = {};
  for (const u of seedUsers) {
    const row = await db.get(
      `INSERT INTO users (email, name, phone, role, department)
       VALUES (lower($1), $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET
         name = EXCLUDED.name, role = EXCLUDED.role,
         phone = COALESCE(EXCLUDED.phone, users.phone),
         department = COALESCE(EXCLUDED.department, users.department)
       RETURNING id`,
      [u.email, u.name, u.phone, u.role, u.department || null],
    );
    userIds[u.email] = row.id;
  }

  await db.run(`UPDATE users SET supervisor_id = $1 WHERE email = $2`,
    [userIds['sangan@hyderabad.bits-pilani.ac.in'], 'p20250086@hyderabad.bits-pilani.ac.in']);
  await db.run(`UPDATE users SET supervisor_id = $1 WHERE email = $2`,
    [userIds['rganesan@hyderabad.bits-pilani.ac.in'], 'f20231386@hyderabad.bits-pilani.ac.in']);

  for (const i of seedInstruments) {
    await db.run(
      `INSERT INTO instruments (code, name, description, location, experiment_minutes, maintenance_minutes, open_hour, close_hour, technician_id, active)
       VALUES ($1,$2,$3,$4,$5,$6,9,21,$7,1)
       ON CONFLICT (code) DO UPDATE SET
         name=EXCLUDED.name, description=EXCLUDED.description, location=EXCLUDED.location,
         experiment_minutes=EXCLUDED.experiment_minutes, maintenance_minutes=EXCLUDED.maintenance_minutes,
         technician_id=EXCLUDED.technician_id, active=1`,
      [i.code, i.name, i.description, i.location, i.experiment_minutes, i.maintenance_minutes, userIds[i.tech]],
    );
  }

  console.log('Seeded:', seedUsers.length, 'users,', seedInstruments.length, 'instruments');
  console.log('\nDemo accounts (sign in via Google, or dev-login if OAuth not set):');
  console.log('  admin@hyderabad.bits-pilani.ac.in       (admin)');
  console.log('  sangan@hyderabad.bits-pilani.ac.in      (faculty)');
  console.log('  tech.cod@hyderabad.bits-pilani.ac.in    (technician)');
  console.log('  f20231386@hyderabad.bits-pilani.ac.in   (student)');
  await db.pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
