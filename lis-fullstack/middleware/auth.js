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
    return res.redirect('/dashboard');
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
  // Allow access for Admin, Doctor, Technician
  // Admin should have full access
  if (req.session.user && req.session.user.role === 'Admin') return next();

  const allowedRoles = ['Admin', 'Doctor', 'Technician'];
  if (!allowedRoles.includes(req.session.user.role)) {
    req.flash('error_msg', 'You do not have permission to access patient data');
    return res.redirect('/dashboard');
  }
  next();
};

// Middleware to check if user can manage users
const canManageUsers = (req, res, next) => {
  // Admin has full access
  if (req.session.user && req.session.user.role === 'Admin') return next();

  const perms = (req.session.user && req.session.user.permissions) || {};
  if (perms.users) return next();

  req.flash('error_msg', 'Only administrators or users with Users permission can manage users');
  return res.redirect('/dashboard');
};

// Generic permission checker for feature keys (e.g., 'patients', 'reports', 'templates')
const requirePermission = (feature) => (req, res, next) => {
  try {
    const user = req.session && req.session.user;
    if (!user) {
      req.flash('error_msg', 'Please log in to access this page');
      return res.redirect('/');
    }
    if (user.role === 'Admin') return next();
    const perms = user.permissions || {};
    if (perms[feature]) return next();
    req.flash('error_msg', 'You do not have permission to access this page');
    return res.redirect('/dashboard');
  } catch (e) {
    console.error('Permission check failed:', e);
    req.flash('error_msg', 'Permission check failed');
    return res.redirect('/dashboard');
  }
};

module.exports = {
  requireAuth,
  requireGuest,
  requireRole,
  canAccessPatient,
  canManageUsers
  ,requirePermission
};
