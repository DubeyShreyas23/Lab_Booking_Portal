const { Pool } = require('pg');

// ── Connection ─────────────────────────────────────────────────────────────
// DATABASE_URL comes from Supabase → Project Settings → Database → Connection
// string (use the "Session pooler" / port 5432 URI for a long-running server).
if (!process.env.DATABASE_URL) {
  console.warn('WARNING: DATABASE_URL is not set. The app cannot reach the database.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Supabase requires TLS. rejectUnauthorized:false accepts their cert chain.
  ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false },
  max: Number(process.env.PG_POOL_MAX || 5),
});

pool.on('error', (err) => console.error('Unexpected PG pool error', err));

// ── Query helpers (async) ──────────────────────────────────────────────────
async function all(text, params = []) {
  const r = await pool.query(text, params);
  return r.rows;
}
async function get(text, params = []) {
  const r = await pool.query(text, params);
  return r.rows[0] || null;
}
async function run(text, params = []) {
  return pool.query(text, params);
}
// Run fn inside a transaction; fn receives a dedicated client with .query().
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ISO-text timestamp default so columns read back as strings the app already
// treats as ISO (e.g. "2026-07-27T05:30:00.123Z"). Mirrors the old SQLite shape.
const ISO_NOW = `to_char((now() at time zone 'utc'), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;

// ── Schema (idempotent) ────────────────────────────────────────────────────
async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE,
      name          TEXT NOT NULL,
      phone         TEXT,
      role          TEXT NOT NULL DEFAULT 'student'
                    CHECK (role IN ('student','technician','faculty','admin')),
      department    TEXT,
      supervisor_id INTEGER REFERENCES users(id),
      id_no         TEXT,
      created_at    TEXT NOT NULL DEFAULT ${ISO_NOW}
    );
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

    CREATE TABLE IF NOT EXISTS instruments (
      id                  SERIAL PRIMARY KEY,
      code                TEXT NOT NULL UNIQUE,
      name                TEXT NOT NULL,
      description         TEXT,
      location            TEXT,
      make_model          TEXT,
      experiment_minutes  INTEGER NOT NULL DEFAULT 60,
      maintenance_minutes INTEGER NOT NULL DEFAULT 0,
      open_hour           INTEGER NOT NULL DEFAULT 9,
      close_hour          INTEGER NOT NULL DEFAULT 21,
      slot_step_minutes   INTEGER NOT NULL DEFAULT 30,
      technician_id       INTEGER REFERENCES users(id),
      active              INTEGER NOT NULL DEFAULT 1,
      notes               TEXT,
      created_by          INTEGER REFERENCES users(id),
      created_at          TEXT NOT NULL DEFAULT ${ISO_NOW},
      updated_at          TEXT NOT NULL DEFAULT ${ISO_NOW}
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id                  SERIAL PRIMARY KEY,
      student_id          INTEGER NOT NULL REFERENCES users(id),
      instrument_id       INTEGER NOT NULL REFERENCES instruments(id),
      supervisor_id       INTEGER REFERENCES users(id),
      starts_at           TEXT NOT NULL,
      ends_at             TEXT NOT NULL,
      status              TEXT NOT NULL DEFAULT 'pending_technician'
                          CHECK (status IN ('pending_technician','pending_faculty','approved','rejected','cancelled','completed','no_show')),
      purpose             TEXT,
      sample_count        INTEGER DEFAULT 1,
      rejection_reason    TEXT,
      rejected_by_role    TEXT,
      technician_id       INTEGER REFERENCES users(id),
      technician_acted_at TEXT,
      technician_notes    TEXT,
      faculty_acted_at    TEXT,
      completed_at        TEXT,
      actual_start_at     TEXT,
      actual_end_at       TEXT,
      closure_requested_at TEXT,
      student_remarks     TEXT,
      created_at          TEXT NOT NULL DEFAULT ${ISO_NOW}
    );
    CREATE INDEX IF NOT EXISTS idx_bookings_instrument_time ON bookings(instrument_id, starts_at, ends_at);
    CREATE INDEX IF NOT EXISTS idx_bookings_student ON bookings(student_id);
    CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
    CREATE INDEX IF NOT EXISTS idx_bookings_supervisor ON bookings(supervisor_id);

    CREATE TABLE IF NOT EXISTS audit_log (
      id          SERIAL PRIMARY KEY,
      booking_id  INTEGER REFERENCES bookings(id),
      actor_id    INTEGER REFERENCES users(id),
      action      TEXT NOT NULL,
      note        TEXT,
      created_at  TEXT NOT NULL DEFAULT ${ISO_NOW}
    );

    CREATE TABLE IF NOT EXISTS booking_events (
      id          SERIAL PRIMARY KEY,
      booking_id  INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      actor_id    INTEGER REFERENCES users(id),
      event_type  TEXT NOT NULL,
      from_status TEXT,
      to_status   TEXT,
      detail      TEXT,
      created_at  TEXT NOT NULL DEFAULT ${ISO_NOW}
    );
    CREATE INDEX IF NOT EXISTS idx_booking_events_bid ON booking_events(booking_id);

    CREATE TABLE IF NOT EXISTS notifications (
      id          SERIAL PRIMARY KEY,
      booking_id  INTEGER REFERENCES bookings(id),
      to_user_id  INTEGER REFERENCES users(id),
      to_email    TEXT,
      channel     TEXT NOT NULL DEFAULT 'email',
      subject     TEXT,
      body        TEXT,
      template    TEXT,
      status      TEXT NOT NULL DEFAULT 'pending',
      error       TEXT,
      sent_at     TEXT,
      created_at  TEXT NOT NULL DEFAULT ${ISO_NOW}
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_booking ON notifications(booking_id);

    CREATE TABLE IF NOT EXISTS holidays (
      id            SERIAL PRIMARY KEY,
      date          TEXT NOT NULL,
      label         TEXT NOT NULL,
      instrument_id INTEGER REFERENCES instruments(id),
      created_by    INTEGER REFERENCES users(id),
      created_at    TEXT NOT NULL DEFAULT ${ISO_NOW}
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_holidays_date_inst
      ON holidays(date, COALESCE(instrument_id, 0));

    CREATE TABLE IF NOT EXISTS instrument_files (
      id            SERIAL PRIMARY KEY,
      instrument_id INTEGER NOT NULL REFERENCES instruments(id) ON DELETE CASCADE,
      label         TEXT NOT NULL,
      url           TEXT NOT NULL,
      file_type     TEXT,
      uploaded_by   INTEGER REFERENCES users(id),
      created_at    TEXT NOT NULL DEFAULT ${ISO_NOW}
    );
    CREATE INDEX IF NOT EXISTS idx_inst_files_iid ON instrument_files(instrument_id);

    CREATE TABLE IF NOT EXISTS system_settings (
      key        TEXT PRIMARY KEY,
      value      TEXT,
      updated_by INTEGER REFERENCES users(id),
      updated_at TEXT NOT NULL DEFAULT ${ISO_NOW}
    );

    CREATE TABLE IF NOT EXISTS complaints (
      id            SERIAL PRIMARY KEY,
      raised_by     INTEGER NOT NULL REFERENCES users(id),
      instrument_id INTEGER REFERENCES instruments(id),
      booking_id    INTEGER REFERENCES bookings(id),
      category      TEXT,
      subject       TEXT NOT NULL,
      description   TEXT,
      priority      TEXT NOT NULL DEFAULT 'medium',   -- low / medium / high
      status        TEXT NOT NULL DEFAULT 'open',      -- open / assigned / in_progress / resolved / closed
      assigned_to   INTEGER REFERENCES users(id),
      attachment_url TEXT,
      resolution    TEXT,
      resolved_at   TEXT,
      created_at    TEXT NOT NULL DEFAULT ${ISO_NOW}
    );
    CREATE INDEX IF NOT EXISTS idx_complaints_status ON complaints(status);
    CREATE INDEX IF NOT EXISTS idx_complaints_raised ON complaints(raised_by);

    CREATE TABLE IF NOT EXISTS complaint_events (
      id           SERIAL PRIMARY KEY,
      complaint_id INTEGER NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
      actor_id     INTEGER REFERENCES users(id),
      event_type   TEXT NOT NULL,
      detail       TEXT,
      created_at   TEXT NOT NULL DEFAULT ${ISO_NOW}
    );
    CREATE INDEX IF NOT EXISTS idx_complaint_events_cid ON complaint_events(complaint_id);
  `);

  // Forward-safe column adds (no-op if they already exist)
  const addCol = async (table, col, def) => {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${col} ${def}`);
  };
  await addCol('users', 'id_no', 'TEXT');
  await addCol('instruments', 'make_model', 'TEXT');
  await addCol('instruments', 'slot_step_minutes', 'INTEGER NOT NULL DEFAULT 30');
  await addCol('instruments', 'lab', 'TEXT');                          // PURSE / EBT / FSM
  await addCol('instruments', 'asset_no', 'TEXT');
  await addCol('instruments', 'parameters', 'TEXT');                   // what it analyzes
  await addCol('instruments', 'category', 'TEXT');                     // Major / Minor
  await addCol('instruments', 'status', "TEXT NOT NULL DEFAULT 'working'"); // working / repair / retired
  await addCol('instruments', 'booking_mode', "TEXT NOT NULL DEFAULT 'hourly'"); // hourly / daily
  await addCol('instruments', 'duration_days', 'INTEGER');             // for daily-mode equipment
  await addCol('bookings', 'sample_count', 'INTEGER DEFAULT 1');
  await addCol('bookings', 'closure_requested_at', 'TEXT');
  await addCol('bookings', 'booking_mode', "TEXT NOT NULL DEFAULT 'hourly'");

  const defaults = {
    lab_name: 'BEST Lab',
    lab_address: 'BITS Pilani Hyderabad Campus',
    contact_person: 'Dr Ramakrishnan Ganesan',
  };
  for (const [k, v] of Object.entries(defaults)) {
    await pool.query(
      `INSERT INTO system_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
      [k, v],
    );
  }
}

module.exports = { pool, all, get, run, tx, init, ISO_NOW };
