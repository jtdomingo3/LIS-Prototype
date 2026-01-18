const express = require('express');
const router = express.Router();
const { canManageUsers, requireAuth } = require('../middleware/auth');

// Only allow authenticated users; editing flags restricted to Admins
router.get('/', requireAuth, (req, res) => {
  res.render('settings', { title: 'Settings' });
});

router.post('/', requireAuth, canManageUsers, (req, res) => {
  try {
    // Checkboxes send 'on' when checked; ensure boolean flags
    const flags = req.body || {};
    req.app.locals.featureFlags.tests = !!flags.tests;
    req.app.locals.featureFlags.reports = !!flags.reports;
    req.app.locals.featureFlags.templates = !!flags.templates;
    req.app.locals.featureFlags.users = !!flags.users;

    req.flash('success_msg', 'Settings updated');
    return res.redirect('/settings');
  } catch (e) {
    req.flash('error_msg', 'Failed to update settings');
    return res.redirect('/settings');
  }
});

module.exports = router;
