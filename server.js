// Run in India Standard Time regardless of the host's timezone (Render is UTC).
// This must be set before any Date/dayjs usage, so it's the very first line.
process.env.TZ = process.env.TZ || 'Asia/Kolkata';

require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const pgSession = require('connect-pg-simple')(session);

const authService = require('./src/services/authService');
const { buildHelmet, loginLimiter, apiLimiter, csrfProtect, exposeCsrf } = require('./src/middleware/security');
const { notFound, handle: errorHandler } = require('./src/middleware/errorHandler');

const authRoutes = require('./src/routes/auth');
const studentRoutes = require('./src/routes/student');
const approvalRoutes = require('./src/routes/approvals');
const adminRoutes = require('./src/routes/admin');
const bookingDetailRoutes = require('./src/routes/bookings');
const complaintRoutes = require('./src/routes/complaints');
const reportRoutes = require('./src/routes/reports');
const kioskRoutes = require('./src/routes/kiosk');
const pageRoutes = require('./src/routes/pages');
const db = require('./src/db');
const appConfig = require('./src/lib/appConfig');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const PROD = process.env.NODE_ENV === 'production';

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('trust proxy', 1);

// ── Core middleware ──────────────────────────────────────────────────────
app.use(morgan(PROD ? 'combined' : 'dev'));
app.use(buildHelmet());
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser(process.env.SESSION_SECRET || 'dev-secret-change-me'));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: PROD ? '1d' : 0 }));

// Sessions persisted in Postgres so logins survive restarts/redeploys.
app.use(session({
  name: 'cal.sid',
  store: new pgSession({ pool: db.pool, tableName: 'user_sessions', createTableIfMissing: true }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: PROD,
    maxAge: 1000 * 60 * 60 * 12,
  },
}));
app.use(flash());

// Passport
app.use(authService.passport.initialize());
app.use(authService.passport.session());

// Globals for views
app.use((req, res, next) => {
  res.locals.user = req.user || null;
  res.locals.flashInfo = req.flash('info');
  res.locals.flashError = req.flash('error');
  res.locals.appName = appConfig.getName();
  res.locals.roleLabel = require('./src/lib/helpers').roleLabel;
  res.locals.csrfToken = null; // overridden by exposeCsrf below for GETs that render
  next();
});

// Rate limit + CSRF guard on state-changing routes.
app.use(apiLimiter);
app.use((req, res, next) => {
  if (req.method === 'POST') {
    if (req.path === '/login' || req.path.startsWith('/auth/dev-login') || req.path.startsWith('/auth/google')) {
      return loginLimiter(req, res, () => csrfProtect(req, res, next));
    }
    return csrfProtect(req, res, next);
  }
  next();
});
app.use(exposeCsrf);

// ── Routes ───────────────────────────────────────────────────────────────
app.get('/healthz', (_req, res) => res.json({ ok: true })); // before auth-guarded routers
app.use('/', kioskRoutes);          // public — no auth
app.use('/', pageRoutes);           // public — /contact
app.use('/', authRoutes);
app.use('/', bookingDetailRoutes);
app.use('/', complaintRoutes);
app.use('/', studentRoutes);
app.use('/', approvalRoutes);
app.use('/reports', reportRoutes);
app.use('/admin', adminRoutes);

app.use(notFound);
app.use(errorHandler);

// ── Startup ────────────────────────────────────────────────────────────────
async function start() {
  await db.init();
  await appConfig.refresh();

  // Auto-seed first admin if configured and none exists yet.
  if (process.env.SEED_ADMIN_EMAIL) {
    const existing = await db.get(`SELECT 1 FROM users WHERE role = 'admin' LIMIT 1`);
    if (!existing) {
      await db.run(
        `INSERT INTO users (email, name, role) VALUES (lower($1), $2, 'admin')
         ON CONFLICT (email) DO UPDATE SET role = 'admin'`,
        [process.env.SEED_ADMIN_EMAIL, process.env.SEED_ADMIN_NAME || 'Lab Administrator'],
      );
      console.log('Seeded first admin:', process.env.SEED_ADMIN_EMAIL);
    }
  }

  app.listen(PORT, () => {
    console.log(`BEST Lab portal running at http://localhost:${PORT}`);
    console.log(`OAuth: ${authService.isOAuthConfigured() ? 'Google configured' : 'NOT configured — dev login enabled'}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
