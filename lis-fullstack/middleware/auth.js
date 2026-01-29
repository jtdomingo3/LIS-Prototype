// Middleware to check if user is authenticated
const requireAuth = (req, res, next) => {
  if (req.session && req.session.user) {
    return next();
  } else {
    req.flash('error_msg', 'Please log in to access this page');
    return res.redirect('/');
  }
};

// Middleware to check if user is not authenticated (for login page)
const requireGuest = (req, res, next) => {
  if (req.session && req.session.user) {
    const user = req.session.user;
    const allowedDashboardRoles = new Set(['Admin', 'Manager', 'Owner']);
    if (allowedDashboardRoles.has(user.role)) return res.redirect('/dashboard');

    const perms = user.permissions || {};
    // Order of preferred landing pages for non-dashboard users
    if (perms.reception) return res.redirect('/reception');
    if (perms.patients) return res.redirect('/patients');
    if (perms.tests) return res.redirect('/tests');
    if (perms.reports) return res.redirect('/reports');
    if (perms.templates) return res.redirect('/templates');
    if (perms.users) return res.redirect('/users');

    // If the user has no permitted landing pages, destroy session and ask them to contact admin
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
      req.flash('error_msg', 'Please log in to access this page');
      return res.redirect('/');
    }

    // Admin should have full access for now
    if (req.session.user.role === 'Admin') return next();

    if (!roles.includes(req.session.user.role)) {
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
    req.flash('error_msg', 'Please log in to access this page');
    return res.redirect('/');
  }

  const user = req.session.user;
  // Admin has full access
  if (user.role === 'Admin') return next();

  // Permission flag overrides role-based check
  const perms = user.permissions || {};
  if (perms.patients || perms.tests) return next();

  const allowedRoles = ['Doctor', 'Technician'];
  if (allowedRoles.includes(user.role)) return next();

  req.flash('error_msg', 'You do not have permission to access patient data');
  return res.redirect('/dashboard');
};

// Middleware to check if user can manage users
const canManageUsers = (req, res, next) => {
  // Admin has full access
  if (req.session.user && req.session.user.role === 'Admin') return next();

  if (req.session.user.role !== 'Admin') {
    req.flash('error_msg', 'Only administrators can manage users');
    return res.redirect('/dashboard');
  }
  next();
};

module.exports = {
  requireAuth,
  requireGuest,
  requireRole,
  canAccessPatient,
  canManageUsers
};