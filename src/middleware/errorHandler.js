const { AppError } = require('../errors');

function notFound(req, res, _next) {
  res.status(404).render('error', { title: '404', message: 'Page not found.' });
}

function handle(err, req, res, _next) {
  // CSRF double-submit token failure
  if (err && err.code === 'EBADCSRFTOKEN') {
    return res.status(403).render('error', {
      title: 'Session expired',
      message: 'Your session has expired or the form is no longer valid. Please reload and try again.',
    });
  }

  if (err instanceof AppError) {
    if (err.code === 'VALIDATION' && req.method === 'POST') {
      // flash and bounce back
      req.flash && req.flash('error', err.message);
      return res.redirect('back');
    }
    return res.status(err.status).render('error', { title: err.code, message: err.message });
  }

  console.error(err);
  res.status(500).render('error', {
    title: 'Server error',
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong.' : (err.message || String(err)),
  });
}

module.exports = { notFound, handle };
