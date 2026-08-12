const express = require('express');
const router = express.Router();

// Public informational pages (no login required).
router.get('/contact', (req, res) => {
  res.render('contact', { title: 'Contact us' });
});

module.exports = router;
