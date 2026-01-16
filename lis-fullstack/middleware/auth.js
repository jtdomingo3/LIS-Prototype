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