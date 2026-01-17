const express = require('express');
const router = express.Router();
const Test = require('../models/Test');
const Patient = require('../models/Patient');
const User = require('../models/User');
const { requireAuth, canAccessPatient } = require('../middleware/auth');
const fs = require('fs');
const path = require('path');


// GET /tests - List all tests
router.get('/', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const searchQuery = req.query.search || '';

  // Get all tests and patients
  let allTests = await Test.find({});
  const allPatients = await Patient.find({});

    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      allTests = allTests.filter(test => {
        const patient = allPatients.find(p => p.id === test.patient);
        const patientName = patient ? `${patient.firstName} ${patient.lastName}`.toLowerCase() : '';
        return test.testId.toLowerCase().includes(searchLower) ||
               test.testType.toLowerCase().includes(searchLower) ||
               patientName.includes(searchLower);
      });
    }

    // Sort by creation date (newest first)
    allTests.sort((a, b) => new Date(b.createdAt || b.testDate) - new Date(a.createdAt || a.testDate));

    const totalTests = allTests.length;
    const totalPages = Math.ceil(totalTests / limit);

    // Paginate
    const tests = allTests.slice(skip, skip + limit);

    // Add patient info to each test
    const testsWithPatientInfo = tests.map(test => {
      const patient = allPatients.find(p => p.id === test.patient);
      return {
        ...test,
        patient: patient ? {
          firstName: patient.firstName,
          lastName: patient.lastName,
          patientId: patient.patientId
        } : null
      };
    });

    res.render('tests/index', {
      title: 'Test & Results Management',
      tests: testsWithPatientInfo,
      currentPage: page,
      totalPages,
      hasPrevPage: page > 1,
      hasNextPage: page < totalPages,
      prevPage: page - 1,
      nextPage: page + 1,
      searchQuery
    });
  } catch (error) {
    console.error('Tests list error:', error);
    req.flash('error_msg', 'Error loading tests');
    res.redirect('/dashboard');
  }
});

// GET /tests/new - New test form
router.get('/new', requireAuth, canAccessPatient, async (req, res) => {
  try {
  let patients = await Patient.find({});
  // debug: ensure we have an array
  console.log('GET /tests/new - patients type:', typeof patients, 'isArray:', Array.isArray(patients));
  // sort patients by lastName ascending
  if (Array.isArray(patients)) patients.sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));
  // load templates for test types
  const Template = require('../models/Template');
  let templates = await Template.find({ isActive: true });
  // append static result templates (views/reports/results)
  try {
    const resultsDir = path.join(__dirname, '..', 'views', 'reports', 'results');
    const allowed = [
      'fecalysis.ejs',
      'urinalysis.ejs',
      'blood-chemistry.ejs',
      'xray.ejs',
      'hematology.ejs',
      'serology.ejs',
      'ultrasound.ejs'
    ];
    const files = fs.readdirSync(resultsDir).filter(f => allowed.includes(f));
    const staticTemplates = files.map(f => {
      const name = f.replace('.ejs', '').replace(/-/g, ' ');
      return { name: name.charAt(0).toUpperCase() + name.slice(1), testType: name };
    });
    templates = templates.concat(staticTemplates);
  } catch (e) {
    // ignore static templates on error
  }

    res.render('tests/new', {
      title: 'Create New Test',
      test: {},
      patients,
      templates
    });
  } catch (error) {
    console.error('New test error:', error);
    req.flash('error_msg', 'Error loading form');
    res.redirect('/tests');
  }
});

// POST /tests - Create new test
router.post('/', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const { patient, testType, testDate, status, results, notes, priority } = req.body;

    // Validate required fields
    if (!patient || !testType || !testDate) {
      req.flash('error_msg', 'Please fill all required fields');
      let patients = await Patient.find({});
      if (Array.isArray(patients)) patients.sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));
      const Template = require('../models/Template');
      let templates = await Template.find({ isActive: true });
      return res.render('tests/new', {
        title: 'Create New Test',
        test: req.body,
        patients,
        templates
      });
    }

    // Generate test ID (file DB compatible)
    const allTestsForId = await Test.find({});
    let testId = 'T001';
    if (allTestsForId && allTestsForId.length) {
      const maxNum = allTestsForId.reduce((max, t) => {
        const n = parseInt((t.testId || 'T0').substring(1)) || 0;
        return Math.max(max, n);
      }, 0);
      testId = 'T' + String(maxNum + 1).padStart(3, '0');
    }

    // Ensure uniqueness if collision
    while ((await Test.findOne({ testId })) !== null) {
      const id = parseInt(testId.substring(1)) + 1;
      testId = 'T' + String(id).padStart(3, '0');
    }

    const test = new Test({
      testId,
      patient,
      testType,
      testDate,
      status: status || 'Pending',
      results,
      notes,
      priority: priority || 'Normal',
      requestedBy: req.session.user.id
    });

    await test.save();

    req.flash('success_msg', `${testType} test created successfully!`);
    res.redirect('/tests');

    } catch (error) {
    console.error('Create test error:', error);
    req.flash('error_msg', 'Error creating test');
  let patients = await Patient.find({});
  console.log('GET /tests/:id/edit - patients type:', typeof patients, 'isArray:', Array.isArray(patients));
  if (Array.isArray(patients)) patients.sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));
  const Template = require('../models/Template');
  let templates = await Template.find({ isActive: true });
    res.render('tests/new', {
      title: 'Create New Test',
      test: req.body,
      patients,
      templates
    });
  }
});

// GET /tests/:id - Show test details
router.get('/:id', requireAuth, canAccessPatient, async (req, res) => {
  try {
    // Fetch test and manually populate relations for file-based DB
    const test = await Test.findById(req.params.id);
    if (!test) {
      req.flash('error_msg', 'Test not found');
      return res.redirect('/tests');
    }

    const requestedByUser = test.requestedBy ? await User.findById(test.requestedBy) : null;
    const performedByUser = test.performedBy ? await User.findById(test.performedBy) : null;
    const patient = test.patient ? await Patient.findById(test.patient) : null;

    const populatedTest = {
      ...test,
      requestedBy: requestedByUser ? { name: requestedByUser.name } : null,
      performedBy: performedByUser ? { name: performedByUser.name } : null,
      patient: patient ? patient.toJSON() : null
    };

    res.render('tests/show', {
      title: 'Test Details',
      test: populatedTest
    });

  } catch (error) {
    console.error('Test details error:', error);
    req.flash('error_msg', 'Error loading test details');
    res.redirect('/tests');
  }
});

// GET /tests/:id/results - Results entry form (supports fecalysis for now)
router.get('/:id/results', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) {
      req.flash('error_msg', 'Test not found');
      return res.redirect('/tests');
    }

    // Only render form for fecalysis or urinalysis (case-insensitive match)
    if (!test.testType || (!/fecalysis/i.test(test.testType) && !/urinalysis/i.test(test.testType))) {
      req.flash('error_msg', 'Results entry form is only available for Fecalysis or Urinalysis tests');
      return res.redirect(`/tests/${req.params.id}`);
    }

    // populate patient and performedBy user list
    const patient = test.patient ? await Patient.findById(test.patient) : null;
    const testForView = { ...test, patient: patient ? patient.toJSON() : null };
    const users = await User.find({});

    // choose the appropriate entry form
    const view = /urinalysis/i.test(test.testType) ? 'tests/results_entry_urinalysis' : 'tests/results_entry_fecalysis';
    res.render(view, {
      title: `Enter ${test.testType} Results`,
      test: testForView,
      users
    });

  } catch (err) {
    console.error('Results entry form error:', err);
    req.flash('error_msg', 'Error loading results form');
    res.redirect(`/tests/${req.params.id}`);
  }
});

// POST /tests/:id/results - Save results for fecalysis
router.post('/:id/results', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) {
      req.flash('error_msg', 'Test not found');
      return res.redirect('/tests');
    }


    if (!test.testType || (!/fecalysis/i.test(test.testType) && !/urinalysis/i.test(test.testType))) {
      req.flash('error_msg', 'Invalid test type for this results form');
      return res.redirect(`/tests/${req.params.id}`);
    }

    // Extract common performer fields
    const { performedBy, mtName, mtLicense, pathName, pathLicense } = req.body;

    let resultsObj = {};

    if (/fecalysis/i.test(test.testType)) {
      const { color, consistency, pusCell, rbc, parasites, others, cocci, bacilli } = req.body;
      resultsObj = {
        color: (color || '').trim(),
        consistency: (consistency || '').trim(),
        pusCell: (pusCell || '').trim(),
        rbc: (rbc || '').trim(),
        parasites: (parasites || '').trim(),
        others: (others || '').trim(),
        cocci: (cocci || '').trim(),
        bacilli: (bacilli || '').trim()
      };
    } else if (/urinalysis/i.test(test.testType)) {
      const { color, appearance, specificGravity, ph, protein, glucose, ketones, blood, nitrite, leukocyte,
        rbc, wbc, epithelial, mucus, amorphous, bacteria, casts, others } = req.body;
      resultsObj = {
        color: (color || '').trim(),
        appearance: (appearance || '').trim(),
        specificGravity: (specificGravity || '').trim(),
        ph: (ph || '').trim(),
        protein: (protein || '').trim(),
        glucose: (glucose || '').trim(),
        ketones: (ketones || '').trim(),
        blood: (blood || '').trim(),
        nitrite: (nitrite || '').trim(),
        leukocyte: (leukocyte || '').trim(),
        rbc: (rbc || '').trim(),
        wbc: (wbc || '').trim(),
        epithelial: (epithelial || '').trim(),
        mucus: (mucus || '').trim(),
        amorphous: (amorphous || '').trim(),
        bacteria: (bacteria || '').trim(),
        casts: (casts || '').trim(),
        others: (others || '').trim()
      };
    }

    // allow storing performer name/license directly on results for printing
    resultsObj.performedByName = (mtName || '').trim();
    resultsObj.performedByLicense = (mtLicense || '').trim();
    resultsObj.requestedByName = (pathName || '').trim();
    resultsObj.requestedByLicense = (pathLicense || '').trim();

    const updateData = {
      results: resultsObj,
      status: 'Completed',
      completedAt: new Date()
    };

    // set performedBy only if explicitly provided (performer management is handled separately)
    if (performedBy) {
      updateData.performedBy = performedBy;
    }

    await Test.findByIdAndUpdate(req.params.id, updateData, { new: true });

    req.flash('success_msg', 'Results saved successfully');
    res.redirect(`/tests/${req.params.id}`);
  } catch (err) {
    console.error('Save results error:', err);
    req.flash('error_msg', 'Error saving results');
    res.redirect(`/tests/${req.params.id}`);
  }
});

// GET /tests/:id/edit - Edit test form
router.get('/:id/edit', requireAuth, canAccessPatient, async (req, res) => {
  try {
  const test = await Test.findById(req.params.id);
  let patients = await Patient.find({});
  if (Array.isArray(patients)) patients.sort((a,b) => (a.lastName || '').localeCompare(b.lastName || ''));

  // load templates for test types (file DB)
  const Template = require('../models/Template');
  let templates = await Template.find({ isActive: true });
  // append static result templates
  try {
    const resultsDir = path.join(__dirname, '..', 'views', 'reports', 'results');
    const allowed = [
      'fecalysis.ejs',
      'urinalysis.ejs',
      'blood-chemistry.ejs',
      'xray.ejs',
      'hematology.ejs',
      'serology.ejs',
      'ultrasound.ejs'
    ];
    const files = fs.readdirSync(resultsDir).filter(f => allowed.includes(f));
    const staticTemplates = files.map(f => {
      const name = f.replace('.ejs', '').replace(/-/g, ' ');
      return { name: name.charAt(0).toUpperCase() + name.slice(1), testType: name };
    });
    templates = templates.concat(staticTemplates);
  } catch (e) {
    // ignore
  }

    if (!test) {
      req.flash('error_msg', 'Test not found');
      return res.redirect('/tests');
    }

    // add patient object for edit view
    const patient = test.patient ? await Patient.findById(test.patient) : null;
    const testForView = { ...test, patient: patient ? patient.toJSON() : null };

    res.render('tests/edit', {
      title: 'Edit Test',
      test: testForView,
      patients,
      templates
    });

  } catch (error) {
    console.error('Edit test error:', error);
    req.flash('error_msg', 'Error loading test');
    res.redirect('/tests');
  }
});

// PUT /tests/:id - Update test
// Note: status is now controlled by server logic (results -> Completed). Do not accept manual status overrides from the form.
router.put('/:id', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const { patient, testType, testDate, results, notes, priority, performedBy } = req.body;

    // Validate required fields
    if (!patient || !testType || !testDate) {
      req.flash('error_msg', 'Please fill all required fields');
      return res.redirect(`/tests/${req.params.id}/edit`);
    }

    const updateData = {
      patient,
      testType,
      testDate,
      results,
      notes,
      priority
    };

    // Only allow certain roles to update performedBy
    if (req.session.user.role === 'Admin' || req.session.user.role === 'Doctor') {
      if (performedBy) {
        updateData.performedBy = performedBy;
      }
    }

    // If results were provided, mark status as Completed (server-controlled). For non-doctor/registration tests, set completedAt
    if (results && String(results).trim()) {
      updateData.status = 'Completed';
      if (testType !== "Doctor's Check-up" && testType !== 'Registration') {
        updateData.completedAt = updateData.completedAt || new Date();
      }
    }

    const test = await Test.findByIdAndUpdate(req.params.id, updateData, { new: true });

    if (!test) {
      req.flash('error_msg', 'Test not found');
      return res.redirect('/tests');
    }

    req.flash('success_msg', `Test ${test.testId} updated successfully!`);
    res.redirect(`/tests/${req.params.id}`);

  } catch (error) {
    console.error('Update test error:', error);
    req.flash('error_msg', 'Error updating test');
    res.redirect(`/tests/${req.params.id}/edit`);
  }
});

// DELETE /tests/:id - Delete test
router.delete('/:id', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const test = await Test.findByIdAndDelete(req.params.id);
    if (!test) {
      req.flash('error_msg', 'Test not found');
      return res.redirect('/tests');
    }

    req.flash('success_msg', 'Test deleted successfully');
    res.redirect('/tests');

  } catch (error) {
    console.error('Delete test error:', error);
    req.flash('error_msg', 'Error deleting test');
    res.redirect('/tests');
  }
});

module.exports = router;