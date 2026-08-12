// Passport sets req.user via deserializeUser. This module exposes route guards.
const { roleLabel } = require('../lib/helpers');

function loadUser(req, _res, next) {
  // Passport already populated req.user; nothing to do here.
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) {
    if (req.session) req.session.returnTo = req.originalUrl;
    return res.redirect('/login');
  }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.redirect('/login');
    if (!roles.includes(req.user.role)) {
      return res.status(403).render('error', {
        title: 'Forbidden',
        message: `Your role (${roleLabel(req.user.role)}) is not permitted to access this page.`,
      });
    }
    next();
  };
}

module.exports = { loadUser, requireAuth, requireRole };
