const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const Test = require('../models/Test');
const { requireAuth } = require('../middleware/auth');

const sigDir = path.join(__dirname, '..', 'assets', 'signature');
try { fs.mkdirSync(sigDir, { recursive: true }); } catch (e) {}

function safeName(email) {
  return String(email || 'user').toLowerCase().replace(/[^a-z0-9]/g, '_');
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, sigDir);
  },
  filename(req, file, cb) {
    const emailRaw = (req.session && req.session.user && req.session.user.email) ? req.session.user.email : 'user';
    const fname = `${safeName(emailRaw)}_signature.png`;
    cb(null, fname);
  }
});

const upload = multer({ storage });

// List documents where current user's name appears
router.get('/', requireAuth, async (req, res) => {
  try {
    const currentUser = req.session.user;
    const name = currentUser && currentUser.name ? String(currentUser.name).toLowerCase() : '';
    if (!name) return res.render('signatures/index', { title: 'Signatures', tests: [], currentUser });

    const all = await Test.find();
    // Filter tests where any common signatory field contains the user's name
    const matches = all.filter(t => {
      try {
        const fields = [];
        if (t.results) {
          // common fields inside results
          Object.keys(t.results).forEach(k => { if (typeof t.results[k] === 'string') fields.push(t.results[k]); });
        }
        if (t.performedBy && t.performedBy.name) fields.push(t.performedBy.name);
        if (t.requestedBy && t.requestedBy.name) fields.push(t.requestedBy.name);
        if (t.assignedDoctorName) fields.push(t.assignedDoctorName);
        // flatten and check
        return fields.some(f => f && String(f).toLowerCase().includes(name));
      } catch (e) { return false; }
    });

    res.render('signatures/index', { title: 'Signatures', tests: matches, currentUser });
  } catch (err) {
    console.error('Signatures list error:', err);
    req.flash('error_msg', 'Error loading signable documents');
    res.render('signatures/index', { title: 'Signatures', tests: [], currentUser: req.session.user });
  }
});

// Apply profile signature for a given test (user must be present in signatory fields)
router.post('/:id/sign', requireAuth, async (req, res) => {
  try {
    const currentUser = req.session.user;
    const name = currentUser && currentUser.name ? String(currentUser.name).toLowerCase() : '';
    const test = await Test.findById(req.params.id);
    if (!test) {
      req.flash('error_msg', 'Document not found');
      return res.redirect('/signatures');
    }

    // verify user is listed in common fields
    const fieldsToCheck = [];
    if (test.results) Object.keys(test.results).forEach(k => { if (typeof test.results[k] === 'string') fieldsToCheck.push(test.results[k]); });
    if (test.performedBy && test.performedBy.name) fieldsToCheck.push(test.performedBy.name);
    if (test.requestedBy && test.requestedBy.name) fieldsToCheck.push(test.requestedBy.name);
    if (test.assignedDoctorName) fieldsToCheck.push(test.assignedDoctorName);

    const allowed = fieldsToCheck.some(f => f && String(f).toLowerCase().includes(name));
    if (!allowed) {
      req.flash('error_msg', 'You are not listed in this document and cannot sign it');
      return res.redirect('/signatures');
    }

    // Use the profile signature only
    if (!currentUser || !currentUser.signature) {
      req.flash('error_msg', 'No profile signature found. Upload one at /users/profile');
      return res.redirect('/signatures');
    }
    const filename = currentUser.signature;

    // parse placement controls (optional)
    const placement = {
      x: (req.body && req.body.x) ? parseFloat(req.body.x) : 0,
      y: (req.body && req.body.y) ? parseFloat(req.body.y) : -56,
      scale: (req.body && req.body.scale) ? parseFloat(req.body.scale) : 1
    };

    // store filename and placement in test.results.signatures by user id
    test.results = test.results || {};
    test.results.signatures = test.results.signatures || {};
    const uid = currentUser.id || currentUser._id || currentUser.email || safeName(currentUser.email);
    test.results.signatures[uid] = { filename, name: currentUser.name, uploadedAt: new Date().toISOString(), placement };
    await test.save();

    req.flash('success_msg', 'Signature uploaded');
    res.redirect('/signatures');
  } catch (err) {
    console.error('Signature upload error:', err);
    req.flash('error_msg', 'Error saving signature');
    res.redirect('/signatures');
  }
});

module.exports = router;
