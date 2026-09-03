const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const User = require('../models/User');
const { requireAuth, canManageUsers } = require('../middleware/auth');

// Allow users to manage their own profile
const { requireGuest } = require('../middleware/auth');

// GET /users - List all users
router.get('/', requireAuth, canManageUsers, async (req, res) => {
  try {
    const users = await User.find({});
    
    // Sort by createdAt descending and remove passwords
    const usersWithoutPasswords = users
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map(user => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin
      }));

    res.render('users/index', {
      title: 'User Management',
      users: usersWithoutPasswords
    });

  } catch (error) {
    console.error('Users list error:', error);
    req.flash('error_msg', 'Error loading users');
    res.render('users/index', {
      title: 'User Management',
      users: []
    });
  }
});

// GET /users/new - New user form
router.get('/new', requireAuth, canManageUsers, (req, res) => {
  res.render('users/new', {
    title: 'Add New User',
    user: {}
  });
});

// POST /users - Create new user
router.post('/', requireAuth, canManageUsers, async (req, res) => {
  try {
    const { name, email, password, confirmPassword, role, status, licenseNumber } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      req.flash('error_msg', 'Please fill all required fields');
      return res.render('users/new', {
        title: 'Add New User',
        user: req.body
      });
    }

    // Check password confirmation
    if (password !== confirmPassword) {
      req.flash('error_msg', 'Passwords do not match');
      return res.render('users/new', {
        title: 'Add New User',
        user: req.body
      });
    }

    // Check password length
    if (password.length < 6) {
      req.flash('error_msg', 'Password must be at least 6 characters long');
      return res.render('users/new', {
        title: 'Add New User',
        user: req.body
      });
    }

    // Check if user exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      req.flash('error_msg', 'User with this email already exists');
      return res.render('users/new', {
        title: 'Add New User',
        user: req.body
      });
    }

    // Build permissions object from nested or flattened form inputs
    const permissionsRaw = req.body.permissions || {};
    const permissions = {};
    ['dashboard','patients','reception','tests','reports','worksheet','templates','inventory','users','delete'].forEach(k => {
      const val = (permissionsRaw && permissionsRaw[k] !== undefined) ? permissionsRaw[k] : (req.body[`permissions[${k}]`] !== undefined ? req.body[`permissions[${k}]`] : req.body[`permissions.${k}`]);
      permissions[k] = !!(val === '1' || val === 1 || val === true || val === 'on' || val === 'true');
    });

    const user = new User({
      name,
      email: email.toLowerCase(),
      password,
      role: role || 'Receptionist',
      status: status || 'Active',
      licenseNumber: licenseNumber || null,
      permissions
    });

    await user.save();

    req.flash('success_msg', `User "${name}" created successfully as ${role}!`);
    res.redirect('/users');

  } catch (error) {
    console.error('Create user error:', error);
    req.flash('error_msg', 'Error creating user');
    res.render('users/new', {
      title: 'Add New User',
      user: req.body
    });
  }
});

// GET /users/:id - Show user details
// GET /profile - view current user's profile
router.get('/profile', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.user.id);
    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/');
    }
    res.render('users/profile', { title: 'My Profile', user: user.toJSON() });
  } catch (error) {
    console.error('Profile view error:', error);
    req.flash('error_msg', 'Error loading profile');
    res.redirect('/');
  }
});

// PUT /profile - update current user's profile (name, email, password)
// Configure multer storage for signatures
const sigDir = path.join(__dirname, '..', 'assets', 'signature');
function ensureSigDir() {
  try { fs.mkdirSync(sigDir, { recursive: true }); } catch (e) {}
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    ensureSigDir();
    cb(null, sigDir);
  },
  filename: function (req, file, cb) {
    // Use email (from form or session) to build safe filename
    const emailRaw = (req.body && req.body.email) ? req.body.email : (req.session && req.session.user && req.session.user.email ? req.session.user.email : 'user');
    const safe = String(emailRaw).toLowerCase().replace(/[^a-z0-9]/g, '_');
    cb(null, `${safe}_signature.png`);
  }
});

const upload = multer({ storage });

router.put('/profile', requireAuth, upload.single('signature'), async (req, res) => {
  try {
    const { name, email, password, confirmPassword, licenseNumber, autoSignatureOption } = req.body;
    if (!name || !email) {
      req.flash('error_msg', 'Please fill all required fields');
      return res.redirect('/users/profile');
    }

    // Check if email is taken by another user
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing && existing.id !== req.session.user.id) {
      req.flash('error_msg', 'Email is already taken by another user');
      return res.redirect('/users/profile');
    }

    const update = { name, email: email.toLowerCase(), licenseNumber: licenseNumber || null };
    if (password) {
      if (password !== confirmPassword) {
        req.flash('error_msg', 'Passwords do not match');
        return res.redirect('/users/profile');
      }
      if (password.length < 6) {
        req.flash('error_msg', 'Password must be at least 6 characters long');
        return res.redirect('/users/profile');
      }
      update.password = password;
    }

    // If a signature file was uploaded, include its filename in the update
    if (req.file && req.file.filename) {
      update.signature = req.file.filename;
    }

    // Handle autoSignatureOption: 'off', '1day', '1week', '1month', 'permanent'
    try {
      let autoSignature = { enabled: false, until: null };
      if (autoSignatureOption && autoSignatureOption !== 'off') {
        autoSignature.enabled = true;
        const now = Date.now();
        if (autoSignatureOption === '1day') autoSignature.until = new Date(now + 1*24*3600*1000).toISOString();
        else if (autoSignatureOption === '1week') autoSignature.until = new Date(now + 7*24*3600*1000).toISOString();
        else if (autoSignatureOption === '1month') autoSignature.until = new Date(now + 30*24*3600*1000).toISOString();
        else if (autoSignatureOption === 'permanent') autoSignature.until = null;
      }
      update.autoSignature = autoSignature;
    } catch (e) {}

    const updated = await User.findByIdAndUpdate(req.session.user.id, update, { new: true });
    if (!updated) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/');
    }

    // Update session info
    req.session.user.name = updated.name;
    req.session.user.email = updated.email;
    req.session.user.licenseNumber = updated.licenseNumber || null;
    req.session.user.signature = updated.signature || null;
    req.session.user.autoSignature = updated.autoSignature || { enabled:false, until:null };

    req.flash('success_msg', 'Profile updated successfully');
    res.redirect('/users/profile');
  } catch (error) {
    console.error('Profile update error:', error);
    req.flash('error_msg', 'Error updating profile');
    res.redirect('/users/profile');
  }
});

// GET /users/:id - Show user details
router.get('/:id', requireAuth, canManageUsers, async (req, res) => {
  try {
    let user = await User.findById(req.params.id);
    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/users');
    }

    // remove password before rendering
    user = user.toJSON();

    res.render('users/show', {
      title: 'User Details',
      user,
      currentUser: req.session.user
    });

  } catch (error) {
    console.error('User details error:', error);
    req.flash('error_msg', 'Error loading user details');
    res.redirect('/users');
  }
});

// GET /users/:id/edit - Edit user form
router.get('/:id/edit', requireAuth, canManageUsers, async (req, res) => {
  try {
    let user = await User.findById(req.params.id);
    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/users');
    }

    user = user.toJSON();

    res.render('users/edit', {
      title: 'Edit User',
      user,
      currentUser: req.session.user
    });

  } catch (error) {
    console.error('Edit user error:', error);
    req.flash('error_msg', 'Error loading user');
    res.redirect('/users');
  }
});

// PUT /users/:id - Update user
router.put('/:id', requireAuth, canManageUsers, async (req, res) => {
  try {
    const { name, email, role, status, password, confirmPassword, licenseNumber } = req.body;

    // Validate required fields
    if (!name || !email) {
      req.flash('error_msg', 'Please fill all required fields');
      return res.redirect(`/users/${req.params.id}/edit`);
    }

    // Check if email is already taken by another user (file DB)
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser && existingUser.id !== req.params.id) {
      req.flash('error_msg', 'Email is already taken by another user');
      return res.redirect(`/users/${req.params.id}/edit`);
    }

    // Build permissions object from nested or flattened form inputs
    const permissionsRaw = req.body.permissions || {};
    const permissions = {};
    ['dashboard','patients','reception','tests','reports','worksheet','templates','inventory','users','delete'].forEach(k => {
      const val = (permissionsRaw && permissionsRaw[k] !== undefined) ? permissionsRaw[k] : (req.body[`permissions[${k}]`] !== undefined ? req.body[`permissions[${k}]`] : req.body[`permissions.${k}`]);
      permissions[k] = !!(val === '1' || val === 1 || val === true || val === 'on' || val === 'true');
    });

    const updateData = {
      name,
      email: email.toLowerCase(),
      role,
      status,
      licenseNumber: licenseNumber || null,
      permissions
    };

    // Update password if provided
    if (password) {
      if (password !== confirmPassword) {
        req.flash('error_msg', 'Passwords do not match');
        return res.redirect(`/users/${req.params.id}/edit`);
      }
      if (password.length < 6) {
        req.flash('error_msg', 'Password must be at least 6 characters long');
        return res.redirect(`/users/${req.params.id}/edit`);
      }
      updateData.password = password;
    }

    const user = await User.findByIdAndUpdate(req.params.id, updateData, { new: true });

    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/users');
    }

    req.flash('success_msg', `User "${name}" updated successfully!`);
    res.redirect(`/users/${req.params.id}`);

  } catch (error) {
    console.error('Update user error:', error);
    req.flash('error_msg', 'Error updating user');
    res.redirect(`/users/${req.params.id}/edit`);
  }
});

// DELETE /users/:id - Delete user
router.delete('/:id', requireAuth, canManageUsers, async (req, res) => {
  try {
    // Prevent deleting self
    if (req.params.id === req.session.user.id) {
      req.flash('error_msg', 'You cannot delete your own account');
      return res.redirect('/users');
    }

    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/users');
    }

    req.flash('success_msg', 'User deleted successfully');
    res.redirect('/users');

  } catch (error) {
    console.error('Delete user error:', error);
    req.flash('error_msg', 'Error deleting user');
    res.redirect('/users');
  }
});

// POST /users/:id/reset-password - Admin resets a user's password to default 'gezyne'
router.post('/:id/reset-password', requireAuth, canManageUsers, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/users');
    }

    // Reset password to default 'gezyne'
    const updated = await User.findByIdAndUpdate(req.params.id, { password: 'gezyne' }, { new: true });
    req.flash('success_msg', `Password for ${updated.email} has been reset to the default.`);
    res.redirect(`/users/${req.params.id}`);
  } catch (error) {
    console.error('Reset password error:', error);
    req.flash('error_msg', 'Error resetting password');
    res.redirect('/users');
  }
});

// GET /profile - view current user's profile
router.get('/profile', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.user.id);
    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/');
    }
    res.render('users/profile', { title: 'My Profile', user: user.toJSON() });
  } catch (error) {
    console.error('Profile view error:', error);
    req.flash('error_msg', 'Error loading profile');
    res.redirect('/');
  }
});

// PUT /profile - update current user's profile (name, email, password)
router.put('/profile', requireAuth, async (req, res) => {
  try {
    const { name, email, password, confirmPassword, autoSignatureOption } = req.body;
    if (!name || !email) {
      req.flash('error_msg', 'Please fill all required fields');
      return res.redirect('/profile');
    }

    // Check if email is taken by another user
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing && existing.id !== req.session.user.id) {
      req.flash('error_msg', 'Email is already taken by another user');
      return res.redirect('/profile');
    }

    const update = { name, email: email.toLowerCase() };
    if (password) {
      if (password !== confirmPassword) {
        req.flash('error_msg', 'Passwords do not match');
        return res.redirect('/profile');
      }
      if (password.length < 6) {
        req.flash('error_msg', 'Password must be at least 6 characters long');
        return res.redirect('/profile');
      }
      update.password = password;
    }

    // handle autoSignatureOption
    try {
      let autoSignature = { enabled: false, until: null };
      if (autoSignatureOption && autoSignatureOption !== 'off') {
        autoSignature.enabled = true;
        const now = Date.now();
        if (autoSignatureOption === '1day') autoSignature.until = new Date(now + 1*24*3600*1000).toISOString();
        else if (autoSignatureOption === '1week') autoSignature.until = new Date(now + 7*24*3600*1000).toISOString();
        else if (autoSignatureOption === '1month') autoSignature.until = new Date(now + 30*24*3600*1000).toISOString();
        else if (autoSignatureOption === 'permanent') autoSignature.until = null;
      }
      update.autoSignature = autoSignature;
    } catch (e) {}

    const updated = await User.findByIdAndUpdate(req.session.user.id, update, { new: true });
    if (!updated) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/');
    }

    // Update session info
    req.session.user.name = updated.name;
    req.session.user.email = updated.email;
    req.session.user.autoSignature = updated.autoSignature || { enabled:false, until:null };

    req.flash('success_msg', 'Profile updated successfully');
    res.redirect('/profile');
  } catch (error) {
    console.error('Profile update error:', error);
    req.flash('error_msg', 'Error updating profile');
    res.redirect('/profile');
  }
});

module.exports = router;
