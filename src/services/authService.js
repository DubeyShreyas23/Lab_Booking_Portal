const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const userRepo = require('../repos/userRepo');
const { isInstituteEmail, inferRoleFromEmail } = require('../lib/helpers');
const { AuthError } = require('../errors');

function isOAuthConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function isDevMagicAllowed() {
  // Magic login only when OAuth not configured AND we're not in production.
  return !isOAuthConfigured() && (process.env.NODE_ENV || 'development') !== 'production';
}

function callbackURL() {
  return process.env.GOOGLE_CALLBACK_URL || `http://localhost:${process.env.PORT || 3000}/auth/google/callback`;
}

// Passport session — serialize the id only; rehydrate from DB on every request.
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try { done(null, (await userRepo.findById(id)) || null); }
  catch (e) { done(e); }
});

if (isOAuthConfigured()) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: callbackURL(),
    scope: ['profile','email'],
  }, async (_accessToken, _refreshToken, profile, done) => {
    try {
      const email = (profile.emails && profile.emails[0] && profile.emails[0].value || '').toLowerCase();
      const name  = profile.displayName || email.split('@')[0];
      if (!email) return done(new AuthError('Google account has no email.'));
      if (!isInstituteEmail(email)) {
        return done(null, false, { message: 'Only institute email addresses are allowed.' });
      }
      // Upsert: create with inferred role on first login (auto-grant student / let admin promote later).
      let user = await userRepo.findByEmail(email);
      if (!user) {
        const role = inferRoleFromEmail(email) || 'student';
        user = await userRepo.create({ email, name, role });
        user._isNew = true;
      } else if (!user.name || user.name.trim().length < 2) {
        user = await userRepo.update(user.id, { name });
      }
      done(null, user);
    } catch (err) {
      done(err);
    }
  }));
}

module.exports = {
  passport,
  isOAuthConfigured,
  isDevMagicAllowed,
  callbackURL,

  // Dev-only path: log in directly by institute email (no OAuth).
  async devMagicLogin(email) {
    if (!isDevMagicAllowed()) throw new AuthError('Dev login is disabled');
    if (!isInstituteEmail(email)) throw new AuthError('Must be an institute email');
    let user = await userRepo.findByEmail(email);
    if (!user) {
      const role = inferRoleFromEmail(email) || 'student';
      user = await userRepo.create({ email, name: email.split('@')[0], role });
      user._isNew = true;
    }
    return user;
  },
};
