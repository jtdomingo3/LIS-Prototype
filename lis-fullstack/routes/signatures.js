const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const Test = require('../models/Test');
const Patient = require('../models/Patient');
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

    // load tests and patients
    const allTests = await Test.find();
    const allPatients = await Patient.find();

    // Filter tests where any common signatory field contains the user's name
    const matches = (allTests || []).filter(t => {
      try {
        const fields = [];
        if (t.results) {
          Object.keys(t.results).forEach(k => { if (typeof t.results[k] === 'string') fields.push(t.results[k]); });
        }
        if (t.performedBy && t.performedBy.name) fields.push(t.performedBy.name);
        if (t.requestedBy && t.requestedBy.name) fields.push(t.requestedBy.name);
        if (t.assignedDoctorName) fields.push(t.assignedDoctorName);
        return fields.some(f => f && String(f).toLowerCase().includes(name));
      } catch (e) { return false; }
    });

    // Build available filter options (test types & priorities)
    const availableTestTypes = Array.isArray(matches) ? Array.from(new Set(matches.map(t => (t.testType || t.template || '').toString()).filter(Boolean))).sort() : [];
    const priorities = Array.isArray(matches) ? Array.from(new Set(matches.map(t => t.priority || 'Normal'))).sort() : [];

    // Read query params
    const searchQuery = req.query.search || '';
    const typeFilter = req.query.type || '';
    const priorityFilter = req.query.priority || '';
    const dateFilter = req.query.date || '';

    // Apply server-side filters (search testId, testType, patient name)
    let filtered = matches;
    if (searchQuery) {
      const q = String(searchQuery).toLowerCase();
      filtered = filtered.filter(test => {
        const patient = allPatients.find(p => p.id === test.patient);
        const patientName = patient ? `${patient.firstName || ''} ${patient.lastName || ''}`.toLowerCase() : '';
        return (test.testId || '').toString().toLowerCase().includes(q) ||
               (test.testType || '').toString().toLowerCase().includes(q) ||
               patientName.includes(q);
      });
    }
    if (typeFilter) filtered = filtered.filter(t => ((t.testType || t.template || '') === typeFilter));
    if (priorityFilter) filtered = filtered.filter(t => (t.priority || 'Normal') === priorityFilter);

    // Date filter (match testDate or createdAt YYYY-MM-DD)
    if (dateFilter) {
      const df = String(dateFilter);
      filtered = filtered.filter(t => {
        const dt = t.testDate || t.createdAt || null;
        try { return dt ? new Date(dt).toISOString().slice(0,10) === df : false; } catch (e) { return false; }
      });
    }

    // Attach lightweight patient info and sort by date desc
    const tests = (filtered || []).sort((a,b) => new Date(b.testDate || b.createdAt) - new Date(a.testDate || a.createdAt))
      .map(test => {
        const patient = allPatients.find(p => p.id === test.patient);
        return Object.assign({}, test, {
          patient: patient ? { firstName: patient.firstName, lastName: patient.lastName, patientId: patient.patientId } : null
        });
      });

    // --- pagination for signatures list ---
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = 10;
    const total = (tests || []).length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const currentPage = Math.min(page, totalPages);
    const startIdx = (currentPage - 1) * limit;
    const pagedTests = (tests || []).slice(startIdx, startIdx + limit);

    res.render('signatures/index', { 
      title: 'Signatures', 
      tests: pagedTests, 
      currentUser, 
      availableTestTypes, 
      priorities, 
      searchQuery, 
      typeFilter, 
      priorityFilter,
      dateFilter,
      // pagination vars
      currentPage,
      totalPages,
      hasPrevPage: currentPage > 1,
      hasNextPage: currentPage < totalPages,
      prevPage: Math.max(1, currentPage - 1),
      nextPage: Math.min(totalPages, currentPage + 1)
    });
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
