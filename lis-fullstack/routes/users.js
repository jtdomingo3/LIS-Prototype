const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { requireAuth, canManageUsers } = require('../middleware/auth');

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
          licenseNumber: user.licenseNumber || '',
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
    const { name, email, password, confirmPassword, role, status, customRole, licenseNumber } = req.body;

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

    const finalRole = (role === 'Other' && customRole && String(customRole).trim()) ? String(customRole).trim() : (role || 'Receptionist');

    // Build permissions object from checkbox inputs (checkboxes send 'on' when checked)
    const perms = {
      dashboard: !!req.body.perm_dashboard,
      patients: !!req.body.perm_patients,
      reception: !!req.body.perm_reception,
      tests: !!req.body.perm_tests,
      reports: !!req.body.perm_reports,
      worksheet: !!req.body.perm_worksheet,
      templates: !!req.body.perm_templates,
      users: !!req.body.perm_users,
      delete: !!req.body.perm_delete
    };

    const user = new User({
      name,
      email: email.toLowerCase(),
      password,
      role: finalRole,
      status: status || 'Active',
      licenseNumber: licenseNumber || null,
      permissions: perms
    });

    console.log('Creating user:', { name, email: email.toLowerCase(), role: finalRole, licenseNumber: licenseNumber || null });

    await user.save();

    req.flash('success_msg', `User "${name}" created successfully as ${finalRole}!`);
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
      user
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
      user
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
    const { name, email, role, status, password, confirmPassword, customRole, licenseNumber } = req.body;

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

    const finalRole = (role === 'Other' && customRole && String(customRole).trim()) ? String(customRole).trim() : role;

    const updateData = {
      name,
      email: email.toLowerCase(),
      role: finalRole,
      status,
      licenseNumber: licenseNumber || null,
      permissions: {
        dashboard: !!req.body.perm_dashboard,
        patients: !!req.body.perm_patients,
        reception: !!req.body.perm_reception,
        tests: !!req.body.perm_tests,
        reports: !!req.body.perm_reports,
        worksheet: !!req.body.perm_worksheet,
        templates: !!req.body.perm_templates,
        users: !!req.body.perm_users,
        delete: !!req.body.perm_delete
      }
    };

    console.log('Updating user:', { id: req.params.id, name, email: email.toLowerCase(), role: finalRole, licenseNumber: licenseNumber || null });

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

    // If the updated user is the currently logged-in user, refresh their session to include updated permissions
    if (req.session && req.session.user && req.session.user.id === req.params.id) {
      req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role, permissions: user.permissions || {} };
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

    // Enforce delete permission for non-admins
    if (!(req.session.user && req.session.user.role === 'Admin')) {
      const perms = (req.session.user && req.session.user.permissions) || {};
      if (!perms.delete) {
        req.flash('error_msg', 'You do not have permission to delete users');
        return res.redirect('/users');
      }
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

module.exports = router;