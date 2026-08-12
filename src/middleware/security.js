const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { doubleCsrf } = require('csrf-csrf');

function buildHelmet() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // Tailwind/Alpine via CDN. tighten in prod by self-hosting.
        scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://cdn.jsdelivr.net"],
        // Allow inline event handlers (onchange/onsubmit) — the date picker,
        // inventory status dropdown, and confirm dialogs rely on them. Helmet
        // defaults script-src-attr to 'none', which was blocking these.
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc:  ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc:   ["'self'", "https://fonts.gstatic.com"],
        imgSrc:    ["'self'", "data:"],
        connectSrc:["'self'"],
        formAction:["'self'", "https://accounts.google.com"],
      },
    },
    crossOriginEmbedderPolicy: false,
  });
}

const isProd = process.env.NODE_ENV === 'production';

const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: isProd ? 30 : 1000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: 'Too many login attempts. Please wait a few minutes.',
});

// Apply only to POST and other write methods — GETs render pages and would
// chew the limit during normal browsing.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: isProd ? 240 : 5000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: (req) => req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS',
});

// csrf-csrf uses double-submit cookie pattern. Token is stored on res.locals for views.
// Session identifier ties the token to a stable id across requests. We use the
// express-session ID (rotates per visitor). Need session to be initialised, which
// happens because the flash middleware writes to the session on every request.
const csrf = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET || process.env.SESSION_SECRET || 'dev-csrf-secret',
  getSessionIdentifier: (req) => {
    if (!req.session) return req.ip || 'anon';
    if (!req.session.csrfAnchor) req.session.csrfAnchor = require('crypto').randomBytes(16).toString('hex');
    return req.session.csrfAnchor;
  },
  cookieName: 'cal.csrf',
  cookieOptions: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' },
  size: 32,
  getTokenFromRequest: (req) => (req.body && req.body._csrf) || req.headers['x-csrf-token'],
});

function exposeCsrf(req, res, next) {
  try {
    // overwrite=false: reuse the existing valid token across multiple GETs in the
    // same session (otherwise every incidental request — e.g. the browser's
    // favicon fetch — silently rotates the cookie and invalidates whatever form
    // was already rendered). validateOnReuse=false: if the existing cookie no
    // longer matches the session anchor (e.g. passport regenerated the session
    // on login), generate a fresh token instead of throwing.
    res.locals.csrfToken = csrf.generateToken(req, res, false, false);
  } catch {
    res.locals.csrfToken = '';
  }
  next();
}

module.exports = {
  buildHelmet,
  loginLimiter,
  apiLimiter,
  csrfProtect: csrf.doubleCsrfProtection,
  exposeCsrf,
};
