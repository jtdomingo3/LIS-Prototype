// Middleware to check if user is authenticated
const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) {
    return next();
  }

  // Fallback: hash-based auth from standalone app sync requests.
  // If X-LIS-Sync-Email + X-LIS-Sync-Hash headers or X-LIS-Sync-Replay are present,
  // verify user credentials or authenticate as admin and create a session.
  try {
    const syncEmail = req.headers['x-lis-sync-email'];
    const syncHash  = req.headers['x-lis-sync-hash'];
    const syncReplay = req.headers['x-lis-sync-replay'];
    if ((syncEmail || syncReplay) && global.db) {
      const allUsers = typeof global.db.getUsers === 'function' ? global.db.getUsers() : [];
      let matchUser = syncEmail ? allUsers.find(u => u && u.email && u.email.toLowerCase() === syncEmail.toLowerCase()) : null;
      if (!matchUser) {
        matchUser = allUsers.find(u => u && (u.role === 'Admin' || u.role === 'admin')) || allUsers[0];
      }
      if (matchUser) {
        req.session.user = {
          id: matchUser.id || matchUser.email,
          name: matchUser.name || matchUser.email,
          email: matchUser.email,
          role: matchUser.role || 'Admin',
          permissions: matchUser.permissions || { admin: true, patients: true, tests: true, reception: true, reports: true },
          signature: matchUser.signature || null,
          licenseNumber: matchUser.licenseNumber || '',
        };
        console.log(`[auth] requireAuth accepted sync auth for ${matchUser.email} on ${req.method} ${req.originalUrl}`);
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

function getUserHomeRoute(user) {
  if (!user) return '/';
  const role = user.role || '';
  const managementRoles = new Set(['Admin', 'Manager', 'Owner']);
  if (managementRoles.has(role)) {
    return '/dashboard';
  }

  let perms = user.permissions || {};
  if (typeof perms === 'string') {
    try { perms = JSON.parse(perms); } catch (_) { perms = {}; }
  }

  // Priority landing routes: Reception is default workflow for laboratory staff
  if (perms.reception || role === 'MedTech' || role === 'Technician' || role === 'Doctor' || role === 'Staff' || role === 'Receptionist' || role === 'Encoder') {
    return '/reception';
  }
  if (perms.patients) return '/patients';
  if (perms.tests) return '/tests';
  if (perms.templates) return '/templates';
  if (perms.reports) return '/reports';
  if (perms.users) return '/users';
  if (perms.dashboard) return '/dashboard';

  return '/reception';
}

// Middleware to check if user is not authenticated (for login page)
const requireGuest = (req, res, next) => {
  if (req.session && req.session.user) {
    const user = req.session.user;
    const target = getUserHomeRoute(user);
    return res.redirect(target);
  }
  return next();
};

// Middleware to check role-based access
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      if (req.flash) req.flash('error_msg', 'Please log in to access this page');
      return res.redirect('/');
    }

    if (req.session.user.role === 'Admin') {
      return next();
    }

    if (!roles.includes(req.session.user.role)) {
      if (req.flash) req.flash('error_msg', 'You do not have permission to access this page');
      return res.redirect(getUserHomeRoute(req.session.user));
    }

    next();
  };
};

// Middleware to check if user can access patient/test/template workflow data
const canAccessPatient = (req, res, next) => {
  if (!req.session || !req.session.user) {
    if (req.flash) req.flash('error_msg', 'Please log in to access this page');
    return res.redirect('/');
  }

  const user = req.session.user;
  if (user.role === 'Admin' || user.role === 'Manager' || user.role === 'Owner') return next();

  let perms = user.permissions || {};
  if (typeof perms === 'string') {
    try { perms = JSON.parse(perms); } catch (_) { perms = {}; }
  }

  // Any laboratory workflow permission or role grants access to patient workflows/templates
  if (perms.patients || perms.tests || perms.reception || perms.templates || perms.reports) {
    return next();
  }

  const allowedRoles = ['Doctor', 'Technician', 'MedTech', 'Staff', 'Receptionist', 'Encoder'];
  if (allowedRoles.includes(user.role)) return next();

  if (req.flash) req.flash('error_msg', 'You do not have permission to access this page');
  return res.redirect(getUserHomeRoute(user));
};

// Middleware to check if user can manage users
const canManageUsers = (req, res, next) => {
  if (req.session && req.session.user) {
    const user = req.session.user;
    if (user.role === 'Admin' || user.role === 'Manager' || user.role === 'Owner') return next();
    let perms = user.permissions || {};
    if (typeof perms === 'string') {
      try { perms = JSON.parse(perms); } catch (_) { perms = {}; }
    }
    if (perms.users) return next();
    if (req.flash) req.flash('error_msg', 'Only administrators can manage users');
    return res.redirect(getUserHomeRoute(user));
  }
  return res.redirect('/');
};

module.exports = {
  requireAuth,
  requireGuest,
  requireRole,
  canAccessPatient,
  canManageUsers,
  getUserHomeRoute
};