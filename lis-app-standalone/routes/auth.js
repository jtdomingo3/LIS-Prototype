const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { requireGuest } = require('../middleware/auth');

// GET / & /login - Login page
router.get(['/', '/login'], requireGuest, (req, res) => {
  // render using the global layout so styles are applied
  res.render('auth/login', {
    title: 'LIS - Login'
  });
});

// POST /login - Process login (always authenticate credentials explicitly)
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      req.flash('error_msg', 'Please enter both email and password');
      return res.redirect('/');
    }

    // Always clear any existing session state when a new login is attempted
    if (req.session) {
      req.session.user = null;
    }

    // Find user locally first
    let user = await User.findOne({ email: email.toLowerCase() });
    let isMatch = user ? await user.comparePassword(password) : false;

    // If local match fails or user not found, verify credentials against live server
    let serverToken = null;
    let serverAuthNotice = null;
    if (!isMatch) {
      const config = req.app.locals.config || {};
      if (config.SERVER_URL) {
        try {
          const { normalizeServerUrl } = require('../lib/serverUrl');
          const norm = normalizeServerUrl(config.SERVER_URL);
          if (!norm.ok || !norm.url) {
            req.flash('error_msg', 'Central server URL is invalid. Please check Settings.');
            return res.redirect('/');
          }
          const base = norm.url;
          const tokenUrl = base + '/api/auth/token';
          const parsed = new URL(tokenUrl);
          const isHttps = parsed.protocol === 'https:';
          const client = isHttps ? require('https') : require('http');
          const postData = JSON.stringify({ email, password });

          const tokenRes = await new Promise((resolve) => {
            const trReq = client.request({
              hostname: parsed.hostname,
              port: parsed.port || (isHttps ? 443 : 80),
              path: parsed.pathname,
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
                'Accept': 'application/json'
              },
              timeout: 6000
            }, (tRes) => {
              let b = '';
              tRes.on('data', chunk => { b += chunk.toString(); });
              tRes.on('end', () => {
                if (tRes.statusCode >= 200 && tRes.statusCode < 300) {
                  try { resolve(JSON.parse(b)); } catch (_) { resolve(null); }
                } else {
                  resolve(null);
                }
              });
            });
            trReq.on('error', (err) => {
              serverAuthNotice = err && err.message ? `Server unreachable (${err.message})` : 'Server unreachable';
              resolve(null);
            });
            trReq.on('timeout', () => {
              trReq.destroy();
              serverAuthNotice = 'Connection to server timed out';
              resolve(null);
            });
            trReq.write(postData);
            trReq.end();
          });

          if (tokenRes && tokenRes.success && tokenRes.token) {
            serverToken = tokenRes.token;
            const sUser = tokenRes.user || {};
            if (!user) {
              user = new User({
                id: sUser.id || sUser.email,
                name: sUser.name || sUser.email,
                email: sUser.email || email.toLowerCase(),
                password: password,
                role: sUser.role || 'User',
                status: sUser.status || 'Active',
                permissions: sUser.permissions || {},
                licenseNumber: sUser.licenseNumber || null,
                signature: sUser.signature || null,
              });
              await user.hashPassword();
              await user.save();
            } else {
              user.password = password;
              await user.hashPassword();
              user.name = sUser.name || user.name;
              user.role = sUser.role || user.role;
              user.permissions = sUser.permissions || user.permissions;
              await user.save();
            }
            isMatch = true;
            console.log('[auth] verified and synchronized user from central server:', email);
          }
        } catch (authErr) {
          console.warn('[auth] server login verification error:', authErr && authErr.message);
          serverAuthNotice = authErr && authErr.message;
        }
      }
    }

    if (!user || !isMatch) {
      if (!user && serverAuthNotice) {
        req.flash('error_msg', `Cannot authenticate offline: ${serverAuthNotice}. Please check server connection.`);
      } else {
        req.flash('error_msg', 'Invalid email or password');
      }
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
    // Retain the hashed password for sync operations to the master server
    sessionUserObj.password = user.password || null;
    req.session.user = sessionUserObj;

    // Bridge user credentials to sync engine for live server synchronization
    if (typeof global.onUserLogin === 'function') {
      try { global.onUserLogin(email, password, user, serverToken); } catch (e) {}
    }

    const { getUserHomeRoute } = require('../middleware/auth');
    const targetRoute = getUserHomeRoute(req.session.user);
    return res.redirect(targetRoute);

  } catch (error) {
    console.error('Login error:', error);
    if (req.flash) req.flash('error_msg', 'An error occurred during login');
    res.redirect('/');
  }
});

// GET & POST /logout - Logout
router.all('/logout', (req, res) => {
  if (typeof global.onUserLogout === 'function') {
    try { global.onUserLogout(); } catch (_) {}
  }
  if (req.app && req.app.locals && typeof req.app.locals.clearAutoLogin === 'function') {
    try { req.app.locals.clearAutoLogin(); } catch (_) {}
  }
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