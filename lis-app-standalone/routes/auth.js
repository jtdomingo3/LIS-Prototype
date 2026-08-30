const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { requireGuest } = require('../middleware/auth');

// GET / - Login page
router.get('/', requireGuest, (req, res) => {
  // render using the global layout so styles are applied
  res.render('auth/login', {
    title: 'LIS - Login'
  });
});

// POST /login - Process login
router.post('/login', requireGuest, async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      req.flash('error_msg', 'Please enter both email and password');
      return res.redirect('/');
    }

    // If there are no users in the system yet, allow the first login
    // attempt to seed an admin account using the supplied credentials. This
    // helps recover from a wiped database or first-run after install.
    const totalUsers = await User.countDocuments();
    if (totalUsers === 0) {
      console.log('[auth] no users found, creating initial admin', email);
      const admin = new User({
        name: 'Admin User',
        email: email.toLowerCase(),
        password,
        role: 'Admin',
        status: 'Active'
      });
      await admin.save();
      // continue with this newly created user
      req.flash('success_msg', 'Initial administrator account created.');
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      req.flash('error_msg', 'Invalid email or password');
      return res.redirect('/');
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      req.flash('error_msg', 'Invalid email or password');
      return res.redirect('/');
    }

    // Check if user is active
    if (user.status !== 'Active') {
      req.flash('error_msg', 'Your account is inactive. Please contact administrator.');
      return res.redirect('/');
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Create session (use the application's `id` field) and include permissions
    // Use the full user object (via toJSON) so profile fields like `signature` persist
    // while relying on User.toJSON to omit sensitive fields like password.
    const sessionUserObj = (typeof user.toJSON === 'function') ? user.toJSON() : {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    };
    sessionUserObj.permissions = user.permissions || {};
    // Ensure signature key exists so views can rely on it
    sessionUserObj.signature = sessionUserObj.signature || null;
    req.session.user = sessionUserObj;

    req.flash('success_msg', `Welcome back, ${user.name}!`);

    // Redirect user to the first page they have permission to access.
    const sessionUser = req.session.user;
    const perms = sessionUser.permissions || {};
    const allowedDashboardRoles = new Set(['Admin', 'Manager', 'Owner']);

    // If user role is allowed for dashboard, send them there.
    if (allowedDashboardRoles.has(sessionUser.role)) {
      // explicit fullscreen query removed so login no longer auto‑maximises
      return res.redirect('/dashboard');
    }

    // Ordered destination preferences for non-dashboard users
    const routes = [
      { path: '/reception', perm: 'reception' },
      { path: '/patients', perm: 'patients' },
      { path: '/tests', perm: 'tests' },
      { path: '/reports', perm: 'reports' },
      { path: '/templates', perm: 'templates' },
      { path: '/users', perm: 'users' }
    ];

    for (const r of routes) {
      if (perms[r.perm]) return res.redirect(r.path);
    }

    // Fallback to dashboard only if role allows; otherwise redirect to login with message
    req.flash('error_msg', 'You do not have access to the dashboard. Please contact administrator for access.');
    return res.redirect('/');

  } catch (error) {
    console.error('Login error:', error);
    req.flash('error_msg', 'An error occurred during login');
    res.redirect('/');
  }
});

// POST /logout - Logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
    }
    res.redirect('/');
  });
});

// GET /register - Register page (only for development/testing)
if (process.env.NODE_ENV === 'development') {
  router.get('/register', requireGuest, (req, res) => {
    res.render('auth/register', {
      title: 'LIS - Register'
    });
  });

  router.post('/register', requireGuest, async (req, res) => {
    try {
      const { name, email, password, confirmPassword, role } = req.body;

      // Validate input
      if (!name || !email || !password) {
        req.flash('error_msg', 'Please fill all required fields');
        return res.redirect('/register');
      }

      if (password !== confirmPassword) {
        req.flash('error_msg', 'Passwords do not match');
        return res.redirect('/register');
      }

      if (password.length < 6) {
        req.flash('error_msg', 'Password must be at least 6 characters long');
        return res.redirect('/register');
      }

      // Check if user exists
      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        req.flash('error_msg', 'User with this email already exists');
        return res.redirect('/register');
      }

      // Create user
      const user = new User({
        name,
        email: email.toLowerCase(),
        password,
        role: role || 'Receptionist'
      });

      await user.save();

      req.flash('success_msg', 'Registration successful! Please login.');
      res.redirect('/');

    } catch (error) {
      console.error('Registration error:', error);
      req.flash('error_msg', 'An error occurred during registration');
      res.redirect('/register');
    }
  });
}

module.exports = router;