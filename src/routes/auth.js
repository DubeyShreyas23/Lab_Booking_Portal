const express = require('express');
const authService = require('../services/authService');
const userService = require('../services/userService');
const { parseOrThrow } = require('../validators/parse');
const { profileCompletion, instituteEmail } = require('../validators/schemas');
const { allowedDomains } = require('../lib/helpers');
const { loginLimiter } = require('../middleware/security');

const router = express.Router();
const { passport } = authService;

// ── Login page ───────────────────────────────────────────────────────────
router.get('/login', (req, res) => {
  if (req.user) return res.redirect(dashboardFor(req.user.role));
  res.render('auth/login', {
    title: 'Sign in',
    domains: allowedDomains(),
    oauthConfigured: authService.isOAuthConfigured(),
    devMagicAllowed: authService.isDevMagicAllowed(),
  });
});

// ── Real Google OAuth flow ───────────────────────────────────────────────
router.get('/auth/google', loginLimiter, (req, res, next) => {
  if (!authService.isOAuthConfigured()) {
    req.flash('error', 'Google login is not configured yet. Use the dev login below.');
    return res.redirect('/login');
  }
  passport.authenticate('google', { scope: ['profile','email'] })(req, res, next);
});

router.get('/auth/google/callback',
  (req, res, next) => {
    if (!authService.isOAuthConfigured()) return res.redirect('/login');
    passport.authenticate('google', (err, user, info) => {
      if (err) return next(err);
      if (!user) {
        req.flash('error', info?.message || 'Sign-in failed.');
        return res.redirect('/login');
      }
      req.login(user, (loginErr) => {
        if (loginErr) return next(loginErr);
        const to = needsProfileCompletion(user) ? '/signup' : (req.session.returnTo || dashboardFor(user.role));
        delete req.session.returnTo;
        res.redirect(to);
      });
    })(req, res, next);
  });

// ── Dev-mode magic login (no OAuth credentials yet) ──────────────────────
router.post('/auth/dev-login', loginLimiter, async (req, res, next) => {
  if (!authService.isDevMagicAllowed()) {
    return res.status(403).render('error', { title: 'Disabled', message: 'Dev login is disabled.' });
  }
  try {
    const email = parseOrThrow(instituteEmail, String(req.body.email || ''));
    const user = await authService.devMagicLogin(email);
    req.login(user, (err) => {
      if (err) return next(err);
      const to = needsProfileCompletion(user) ? '/signup' : dashboardFor(user.role);
      res.redirect(to);
    });
  } catch (e) {
    req.flash('error', e.message);
    res.redirect('/login');
  }
});

// ── First-time profile completion ────────────────────────────────────────
router.get('/signup', (req, res) => {
  if (!req.user) return res.redirect('/login');
  res.render('auth/signup', { title: 'Complete your profile', user: req.user });
});

router.post('/signup', async (req, res, next) => {
  if (!req.user) return res.redirect('/login');
  try {
    const data = parseOrThrow(profileCompletion, req.body);
    await userService.updateProfile(req.user.id, {
      name: data.name,
      phone: data.phone,
      department: data.department || null,
    });
    res.redirect(dashboardFor(req.user.role));
  } catch (e) { next(e); }
});

// ── Logout ───────────────────────────────────────────────────────────────
router.post('/logout', (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => res.redirect('/login'));
  });
});

function needsProfileCompletion(user) {
  return !user.phone || user.phone.length < 7;
}

function dashboardFor(role) {
  switch (role) {
    case 'admin':      return '/admin';
    case 'technician': return '/technician';
    case 'faculty':    return '/faculty';
    default:           return '/';
  }
}

router.dashboardFor = dashboardFor;
module.exports = router;
