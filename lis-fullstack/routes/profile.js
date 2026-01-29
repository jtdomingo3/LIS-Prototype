const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');

// GET /profile - show profile edit form
router.get('/', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.user.id);
    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/dashboard');
    }
    res.render('users/profile', { title: 'My Profile', user: user.toJSON() });
  } catch (e) {
    console.error('Profile GET error:', e);
    req.flash('error_msg', 'Could not load profile');
    res.redirect('/dashboard');
  }
});

// POST /profile - update profile
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, email, currentPassword, newPassword, confirmPassword } = req.body || {};
    if (!name || !email) {
      req.flash('error_msg', 'Name and email are required');
      return res.redirect('/profile');
    }

    // Check email uniqueness
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing && existing.id !== req.session.user.id) {
      req.flash('error_msg', 'Email is already in use by another account');
      return res.redirect('/profile');
    }

    const updateData = { name, email: email.toLowerCase() };

    // If user wants to change password
    if (newPassword && newPassword.length) {
      if (newPassword !== confirmPassword) {
        req.flash('error_msg', 'New passwords do not match');
        return res.redirect('/profile');
      }
      if (newPassword.length < 6) {
        req.flash('error_msg', 'Password must be at least 6 characters long');
        return res.redirect('/profile');
      }
      // verify current password
      const user = await User.findById(req.session.user.id);
      const ok = await user.comparePassword(currentPassword || '');
      if (!ok) {
        req.flash('error_msg', 'Current password is incorrect');
        return res.redirect('/profile');
      }
      updateData.password = newPassword;
    }

    const updated = await User.findByIdAndUpdate(req.session.user.id, updateData, { new: true });
    if (!updated) {
      req.flash('error_msg', 'Failed to update profile');
      return res.redirect('/profile');
    }

    // Refresh session user info (preserve permissions)
    req.session.user = { id: updated.id, name: updated.name, email: updated.email, role: updated.role, permissions: updated.permissions || {} };
    req.flash('success_msg', 'Profile updated successfully');
    return res.redirect('/profile');
  } catch (e) {
    console.error('Profile POST error:', e);
    req.flash('error_msg', 'Failed to update profile');
    return res.redirect('/profile');
  }
});

module.exports = router;
