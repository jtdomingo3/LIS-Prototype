// Middleware to check if user is authenticated
const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) {
    return next();
  }

  // Fallback: hash-based auth from standalone app sync requests.
  // If X-LIS-Sync-Email + X-LIS-Sync-Hash headers are present, verify
  // the bcrypt hash matches the stored user password and create a session.
  try {
    const syncEmail = req.headers['x-lis-sync-email'];
    const syncHash  = req.headers['x-lis-sync-hash'];
    if (syncEmail && syncHash && global.db) {
      const allUsers = typeof global.db.getUsers === 'function' ? global.db.getUsers() : [];
      const matchUser = allUsers.find(u => u.email && u.email.toLowerCase() === syncEmail.toLowerCase());
      if (matchUser && matchUser.password && matchUser.password === syncHash) {
        // Create a session for this user so subsequent middleware works
        req.session.user = {
          id: matchUser.id || matchUser.email,
          name: matchUser.name || matchUser.email,
          email: matchUser.email,
          role: matchUser.role || 'User',
          permissions: matchUser.permissions || {},
          signature: matchUser.signature || null,
          licenseNumber: matchUser.licenseNumber || '',
        };
        console.log(`[auth] requireAuth accepted hash-based auth for ${syncEmail}`);
        return next();
      }
    }
  } catch (e) { /* ignore hash auth errors */ }

  try {
    console.warn(`[auth] requireAuth blocked - no session user for ${req.method} ${req.originalUrl}`);
  } catch (e) {}
  req.flash('error_msg', 'Please log in to access this page');
  return res.redirect('/');
};

// Middleware to check if user is not authenticated (for login page)
const requireGuest = (req, res, next) => {
  if (req.session && req.session.user) {
    const user = req.session.user;
    const allowedDashboardRoles = new Set(['Admin', 'Manager', 'Owner']);
    if (allowedDashboardRoles.has(user.role)) {
      console.debug(`[auth] requireGuest redirecting ${user.email} (${user.role}) -> /dashboard`);
      return res.redirect('/dashboard');
    }

    const perms = user.permissions || {};
    // Order of preferred landing pages for non-dashboard users
    if (perms.reception) return res.redirect('/reception');
    if (perms.patients) return res.redirect('/patients');
    if (perms.tests) return res.redirect('/tests');
    if (perms.reports) return res.redirect('/reports');
    if (perms.templates) return res.redirect('/templates');
    if (perms.users) return res.redirect('/users');

    // If the user has no permitted landing pages, destroy session and ask them to contact admin
    try { console.warn(`[auth] requireGuest - user ${user.email} has no permitted landing pages; destroying session`); } catch (e) {}
    req.session.destroy(() => {});
    req.flash('error_msg', 'Your account has no permitted pages. Please contact the administrator.');
    return res.redirect('/');
  } else {
    return next();
  }
};

// Middleware to check role-based access
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.session.user) {
      try { console.warn(`[auth] requireRole blocked - no session user for ${req.method} ${req.originalUrl}`); } catch (e) {}
      req.flash('error_msg', 'Please log in to access this page');
      return res.redirect('/');
    }

    // Admin should have full access for now
    if (req.session.user.role === 'Admin') {
      console.debug(`[auth] requireRole allowing Admin ${req.session.user.email}`);
      return next();
    }

    if (!roles.includes(req.session.user.role)) {
      try { console.warn(`[auth] requireRole - user ${req.session.user.email} role ${req.session.user.role} not in ${roles}`); } catch (e) {}
      req.flash('error_msg', 'You do not have permission to access this page');
      return res.redirect('/dashboard');
    }

    next();
  };
};

// Middleware to check if user can access patient data
const canAccessPatient = (req, res, next) => {
  // Allow access for Admin, Doctor, Technician or users with patients permission
  if (!req.session || !req.session.user) {
    try { console.warn(`[auth] canAccessPatient blocked - no session user for ${req.method} ${req.originalUrl}`); } catch (e) {}
    req.flash('error_msg', 'Please log in to access this page');
    return res.redirect('/');
  }

  const user = req.session.user;
  // Admin has full access
  if (user.role === 'Admin') return next();

  // Permission flag overrides role-based check
  const perms = user.permissions || {};
  if (perms.patients || perms.tests) {
    console.debug(`[auth] canAccessPatient allowing ${user.email} via permissions`);
    return next();
  }

  const allowedRoles = ['Doctor', 'Technician'];
  if (allowedRoles.includes(user.role)) return next();

  try { console.warn(`[auth] canAccessPatient - denied for ${user.email} role=${user.role} perms=${JSON.stringify(perms)}`); } catch (e) {}
  req.flash('error_msg', 'You do not have permission to access patient data');
  return res.redirect('/dashboard');
};

// Middleware to check if user can manage users
const canManageUsers = (req, res, next) => {
  // Admin has full access
  if (req.session.user && req.session.user.role === 'Admin') {
    console.debug(`[auth] canManageUsers allowing admin ${req.session.user.email}`);
    return next();
  }

  try { console.warn(`[auth] canManageUsers - denied for ${req.session && req.session.user ? req.session.user.email : 'unknown'}`); } catch (e) {}
  if (req.session && req.session.user) req.flash('error_msg', 'Only administrators can manage users');
  return res.redirect('/dashboard');
};

module.exports = {
  requireAuth,
  requireGuest,
  requireRole,
  canAccessPatient,
  canManageUsers
};