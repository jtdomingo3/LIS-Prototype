const express = require('express');
const router = express.Router();
const Patient = require('../models/Patient');
const User = require('../models/User');
const { requireAuth, canAccessPatient } = require('../middleware/auth');

// GET /patients - List all patients
router.get('/', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const searchQuery = req.query.search || '';

    // Get all patients and filter/search
    let allPatients = await Patient.find({});

    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      allPatients = allPatients.filter(patient =>
        patient.firstName.toLowerCase().includes(searchLower) ||
        patient.lastName.toLowerCase().includes(searchLower) ||
        patient.patientId.toLowerCase().includes(searchLower)
      );
    }

    // Sort by creation date (newest first)
    if (Array.isArray(allPatients)) {
      allPatients.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    const totalPatients = allPatients.length;
    const totalPages = Math.ceil(totalPatients / limit);

    // Paginate
    const patients = allPatients.slice(skip, skip + limit);

    // Calculate age for each patient (prefer DOB computed age, fallback to manual age)
    patients.forEach(patient => {
      if (patient.dateOfBirth) {
        const today = new Date();
        const birthDate = new Date(patient.dateOfBirth);
        if (!isNaN(birthDate.getTime())) {
          let age = today.getFullYear() - birthDate.getFullYear();
          const monthDiff = today.getMonth() - birthDate.getMonth();
          if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age--;
          }
          patient.age = age;
          return;
        }
      }

      // fallback to manual age if provided
      if (patient.ageManual) {
        patient.age = patient.ageManual;
      } else {
        patient.age = 'N/A';
      }
    });

    res.render('patients/index', {
      title: 'Patient Management',
      patients,
      currentPage: page,
      totalPages,
      hasPrevPage: page > 1,
      hasNextPage: page < totalPages,
      prevPage: page - 1,
      nextPage: page + 1,
      searchQuery
    });
  } catch (error) {
    console.error('Patients list error:', error);
    req.flash('error_msg', 'Error loading patients');
    res.redirect('/dashboard');
  }
});

// GET /patients/new - New patient form
// GET /patients/new - New patient form (load test templates so we can select tests)
router.get('/new', requireAuth, canAccessPatient, (req, res) => {
  try {
    const Template = require('../models/Template');
    (async () => {
      let templates = [];
      try {
        templates = await Template.find({ isActive: true });
        // also try to include static result templates similar to /tests/new
        const fs = require('fs');
        const path = require('path');
        const resultsDir = path.join(__dirname, '..', 'views', 'reports', 'results');
        const allowed = [
          'fecalysis.ejs','esr.ejs','fecal-occult-blood.ejs','urinalysis.ejs','ct-bt.ejs','blood-typing.ejs','pregnancy-test.ejs','dengue-duo.ejs','thyroid-panel.ejs','blood-chemistry.ejs','blood-chemistry-sgpt-sgot.ejs','blood-chemistry-bun-crea.ejs','blood-chemistry-lipid-profile.ejs','blood-chemistry-electrolytes.ejs','blood-chemistry-hba1c.ejs','blood-chemistry-albumin.ejs','blood-chemistry-blood-sugar.ejs','pt-aptt.ejs','xray.ejs','ecg.ejs','hematology.ejs','serology.ejs','ultrasound-abd-kubp-hbt.ejs','echocardiography-2d.ejs','ultrasound-transvaginal.ejs','ultrasound-biophysical.ejs','ultrasound-1st-trimester-obstetrics.ejs','ultrasound-pelvic.ejs','drugtest.ejs'
        ];
        try {
          const files = fs.readdirSync(resultsDir).filter(f => allowed.includes(f));
          const staticTemplates = files.map(f => {
            if (f === 'drugtest.ejs') return { name: 'Drug Test', testType: 'drugtest' };
            if (f === 'blood-chemistry-bun-crea.ejs') return { name: 'Blood Chemistry - BUN/Crea', testType: 'BUN/Creat' };
            if (f === 'blood-chemistry-sgpt-sgot.ejs') return { name: 'Blood Chemistry - SGPT/SGOT', testType: 'Blood Chemistry - SGPT/SGOT' };
            if (f === 'ultrasound-abd-kubp-hbt.ejs') return { name: 'Ultrasound - ABD / KUBP / HBT', testType: 'ultrasound-abd-kubp-hbt' };
            if (f === 'echocardiography-2d.ejs') return { name: 'Echocardiography - 2D', testType: 'echocardiography-2d' };
            if (f === 'ultrasound-transvaginal.ejs') return { name: 'Ultrasound - Transvaginal', testType: 'ultrasound-transvaginal' };
            if (f === 'ultrasound-biophysical.ejs') return { name: 'Ultrasound - Biophysical', testType: 'ultrasound-biophysical' };
            if (f === 'ultrasound-pelvic.ejs') return { name: 'Ultrasound - Pelvic Ultrasound', testType: 'ultrasound-pelvic' };
            const name = f.replace('.ejs', '').replace(/-/g, ' ');
            return { name: name.charAt(0).toUpperCase() + name.slice(1), testType: f.replace('.ejs','') };
          });
          templates = templates.concat(staticTemplates);
        } catch (e) {}
      } catch (e) {
        templates = [];
      }

      res.render('patients/new', {
        title: 'Add New Patient',
        patient: {},
        templates
      });
    })();
  } catch (e) {
    res.render('patients/new', {
      title: 'Add New Patient',
      patient: {}
    });
  }
});

// POST /patients - Create new patient
router.post('/', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const { firstName, lastName, dateOfBirth, gender, phone, email, address, physician } = req.body;
    // encoder may provide age instead of DOB -> accept either
    const ageManual = req.body.ageManual || req.body.age || null;
    // normalize doctor's checkup selection (checkboxes)
    const doctorSelections = Array.isArray(req.body.requiredAreas)
      ? req.body.requiredAreas
      : req.body.requiredAreas ? [req.body.requiredAreas] : [];
    // normalize selected tests from the form
    const selectedTests = Array.isArray(req.body.selectedTests)
      ? req.body.selectedTests
      : req.body.selectedTests ? [req.body.selectedTests] : [];

    // Validate required fields - accept either dateOfBirth or manual age
    if (!firstName || !lastName || !gender || (!dateOfBirth && !ageManual)) {
      req.flash('error_msg', 'Please fill all required fields (either Date of Birth or Age is required)');
      return res.render('patients/new', {
        title: 'Add New Patient',
        patient: req.body
      });
    }

    // Generate patient ID (file DB compatible)
    const allPatientsForId = await Patient.find({});
    let patientId = 'P001';
    if (allPatientsForId && allPatientsForId.length) {
      // extract numeric part and find max
      const maxNum = allPatientsForId.reduce((max, p) => {
        const n = parseInt((p.patientId || 'P0').substring(1)) || 0;
        return Math.max(max, n);
      }, 0);
      patientId = 'P' + String(maxNum + 1).padStart(3, '0');
    }

    // Check if patient ID already exists
    while (await Patient.findOne({ patientId })) {
      const id = parseInt(patientId.substring(1)) + 1;
      patientId = 'P' + String(id).padStart(3, '0');
    }

    // Generate patient code: GCL-YYYY-MM-00000 where the number is the count of patients created today + 1
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dayStr = String(today.getDate()).padStart(2, '0');
    // Count patients created on same day (YYYY-MM-DD) to generate sequence
    const patientsToday = (allPatientsForId || []).filter(p => {
      try {
        const created = p.createdAt ? new Date(p.createdAt) : null;
        if (!created) return false;
        return created.getFullYear() === yyyy && (created.getMonth() + 1) === parseInt(mm) && created.getDate() === parseInt(dayStr);
      } catch (e) {
        return false;
      }
    });
    const seq = (patientsToday.length || 0) + 1;
    const patientCode = `GCL-${yyyy}-${mm}-${String(seq).padStart(5, '0')}`;

    // Determine area mapping from selected tests using an explicit map
    function mapTestToArea(testLabel) {
      const s = String(testLabel || '').toLowerCase();
      if (!s) return null;
      // None / awaiting-only tests
      if (s.includes('fecal') || s.includes('fecal occult') || s.includes('fecal-occult') || s.includes('pregnancy') || s.includes('urinalysis')) return null;
      // Echocardiography / 2D
      if (s.includes('echocardiography') || s.includes('2d echo') || s.includes('2d')) return '2D Echo';
      // Drug test
      if (s.includes('drugtest') || s.includes('drug test') || s === 'drugtest') return 'Drug Test';
      // ECG
      if (s === 'ecg' || s.includes('ecg')) return 'ECG';
      // Ultrasound variants
      if (s.includes('ultrasound')) return 'Ultrasound';
      // X-Ray
      if (s.includes('xray') || s.includes('x-ray') || s.includes('x ray')) return 'X-ray';
      // Extraction-related (blood chemistry, hematology, serology, etc.)
      if (s.includes('blood') || s.includes('chemistry') || s.includes('bun') || s.includes('crea') || s.includes('hematology') || s.includes('esr') || s.includes('pt') || s.includes('aptt') || s.includes('serology') || s.includes('typing') || s.includes('ct') || s.includes('dengue') || s.includes('thyroid')) return 'Extraction Area';
      return null;
    }

    const mappedAreas = new Set();
    // Build requestedTests array with amounts and lab tagging
    const requestedTestsDetailed = [];
    for (const t of selectedTests) {
      const a = mapTestToArea(t);
      if (a) mappedAreas.add(a);
      const slug = String(t).toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
      const rawAmt = req.body['amount_' + slug];
      const amt = rawAmt ? parseFloat(String(rawAmt).replace(/,/g,'')) : 0;
      const lab = (a === 'X-ray') ? 'xray' : 'clinical';
      requestedTestsDetailed.push({ key: t, label: t, amount: isNaN(amt) ? 0 : amt, lab });
    }

    // If none of the selected tests map to a reception area, treat as awaiting-only
    const awaitingOnly = (selectedTests.length > 0) && mappedAreas.size === 0;

    // Build final requiredAreas: collect all unique mapped areas in the same
    // order reception expects so that downstream queuing/forwarding logic
    // will process them in the intended order.
    const AREA_ORDER = ['Extraction Area', 'Drug Test', 'Ultrasound', '2D Echo', 'X-ray', 'ECG'];
    let finalRequiredAreas = [];
    if (!awaitingOnly && mappedAreas.size > 0) {
      finalRequiredAreas = AREA_ORDER.filter(a => mappedAreas.has(a));
      const others = Array.from(mappedAreas).filter(a => !AREA_ORDER.includes(a));
      finalRequiredAreas = finalRequiredAreas.concat(others);
    } else if (!selectedTests.length) {
      // no tests selected - preserve doctor's selection(s)
      finalRequiredAreas = doctorSelections.slice();
    }

    const patient = new Patient({
      patientId,
      patientCode,
      firstName,
      lastName,
      dateOfBirth,
      ageManual,
      physician,
      gender,
      phone,
      email,
      address,
      requiredAreas: finalRequiredAreas,
      // preserve selected tests for extraction/medtech visibility (detailed objects)
      requestedTests: requestedTestsDetailed,
      createdBy: req.session.user.id
    });

    await patient.save();

    // After encoding a new patient, automatically create a Test assigned to Payment Area
    try {
      const Test = require('../models/Test');
      // Do not create if patient already has an active test (avoid duplicates)
      const existing = await Test.find({ patient: patient.id });
      console.log('Auto-create test: found existing tests for patient', { patientId: patient.id, existingCount: Array.isArray(existing) ? existing.length : 0 });
      const active = Array.isArray(existing) && existing.find(t => t && t.status && t.status !== 'Completed' && t.status !== 'Releasing of Result');
      if (!active) {
        // Generate a unique testId
        const allTestsForId = await Test.find({});
        let testId = 'T001';
        if (allTestsForId && allTestsForId.length) {
          const maxNum = allTestsForId.reduce((max, t) => {
            const n = parseInt((t.testId || 'T0').substring(1)) || 0;
            return Math.max(max, n);
          }, 0);
          testId = 'T' + String(maxNum + 1).padStart(3, '0');
        }
        while ((await Test.findOne({ testId })) !== null) {
          const id = parseInt(testId.substring(1)) + 1;
          testId = 'T' + String(id).padStart(3, '0');
        }

        // If patient ONLY requires a Doctor's Check-up (A or B), place test directly to that specific doctor room
        let initialTestType = 'Registration';
        let initialStatus = 'Payment Area';
        if (Array.isArray(finalRequiredAreas) && finalRequiredAreas.length === 1) {
          const only = String(finalRequiredAreas[0] || '');
          if (only.toLowerCase().startsWith("doctor's check-up")) {
            // use the specific area name (e.g. "Doctor's Check-up - A")
            initialTestType = "Doctor's Check-up";
            initialStatus = only;
          }
        }

        const newTest = new Test({
          testId,
          patient: patient.id,
          testType: initialTestType,
          // Store full ISO timestamp so the time-of-encoding is preserved
          testDate: (new Date()).toISOString(),
          status: initialStatus,
          requestedBy: req.session.user.id,
          // Ensure createdAt also contains the exact encode time
          createdAt: (new Date()).toISOString(),
          specimenNumbers: {}
          ,
          // preserve selected tests so medtechs know what to extract
          requestedTests: requestedTestsDetailed,
          // mark if this patient's selected tests are 'awaiting-only' so downstream logic
          // can decide not to route after payment
          awaitingOnly: awaitingOnly
        });

        await newTest.save();
        console.log('Auto-create test: saved new test', { testId: newTest.testId, testDbId: newTest.id, patientId: patient.id });
        // Notify kiosk clients immediately that a new test was assigned to Payment Area
        try {
          // Use shared SSE emitter to notify kiosks immediately
          const sse = require('../lib/sseEmitter');
          if (sse && typeof sse.emit === 'function') {
            const payload = {
              action: 'assign',
              testId: newTest.testId,
              area: initialStatus,
              time: (new Date()).toISOString(),
              patientCode: patient.patientCode,
              patientName: `${patient.firstName} ${patient.lastName}`
            };
            console.log('Auto-create SSE emit', payload);
            sse.emit('update', payload);
          }
        } catch (emitErr) {
          console.warn('Auto-create SSE emit failed', emitErr);
        }
        req.flash('success_msg', `Patient ${firstName} ${lastName} added and assigned to Payment Area`);
      } else {
        console.log('Auto-create test: active test exists, skipping auto-create', { activeTestId: active.testId, status: active.status });
        req.flash('success_msg', `Patient ${firstName} ${lastName} added successfully!`);
      }
    } catch (err) {
      console.error('Auto-create test error:', err);
      // still continue, patient was created
      req.flash('success_msg', `Patient ${firstName} ${lastName} added successfully!`);
    }

    res.redirect('/patients');

  } catch (error) {
    console.error('Create patient error:', error);
    req.flash('error_msg', 'Error creating patient');
    res.render('patients/new', {
      title: 'Add New Patient',
      patient: req.body
    });
  }
});

// GET /patients/:id - Show patient details
router.get('/:id', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) {
      req.flash('error_msg', 'Patient not found');
      return res.redirect('/patients');
    }

    // Get patient's tests
    const Test = require('../models/Test');
    // Fetch tests for this patient and manually populate user refs
    let tests = await Test.find({ patient: req.params.id });
  // sort by testDate desc
  if (Array.isArray(tests)) tests.sort((a, b) => new Date(b.testDate) - new Date(a.testDate));

    const testsWithUsers = await Promise.all(tests.map(async (t) => {
      const requestedByUser = t.requestedBy ? await User.findById(t.requestedBy) : null;
      const performedByUser = t.performedBy ? await User.findById(t.performedBy) : null;
      return {
        ...t,
        requestedBy: requestedByUser ? { name: requestedByUser.name } : null,
        performedBy: performedByUser ? { name: performedByUser.name } : null
      };
    }));

    res.render('patients/show', {
      title: 'Patient Details',
      patient,
      tests: testsWithUsers
    });

  } catch (error) {
    console.error('Patient details error:', error);
    req.flash('error_msg', 'Error loading patient details');
    res.redirect('/patients');
  }
});

// GET /patients/:id/edit - Edit patient form
router.get('/:id/edit', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) {
      req.flash('error_msg', 'Patient not found');
      return res.redirect('/patients');
    }

    res.render('patients/edit', {
      title: 'Edit Patient',
      patient
    });

  } catch (error) {
    console.error('Edit patient error:', error);
    req.flash('error_msg', 'Error loading patient');
    res.redirect('/patients');
  }
});

    // PUT /patients/:id - Update patient
router.put('/:id', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const { firstName, lastName, dateOfBirth, gender, phone, email, address, physician } = req.body;
    const ageManual = req.body.ageManual || req.body.age || null;
    const requiredAreas = Array.isArray(req.body.requiredAreas)
      ? req.body.requiredAreas
      : req.body.requiredAreas ? [req.body.requiredAreas] : [];

    // Validate required fields - accept either dateOfBirth or manual age
    if (!firstName || !lastName || !gender || (!dateOfBirth && !ageManual)) {
      req.flash('error_msg', 'Please fill all required fields (either Date of Birth or Age is required)');
      return res.redirect(`/patients/${req.params.id}/edit`);
    }

    const patient = await Patient.findByIdAndUpdate(
      req.params.id,
      {
        firstName,
        lastName,
        dateOfBirth,
        ageManual,
        physician,
        gender,
        phone,
        email,
        address,
        requiredAreas
      },
      { new: true }
    );

    if (!patient) {
      req.flash('error_msg', 'Patient not found');
      return res.redirect('/patients');
    }

    req.flash('success_msg', `Patient ${firstName} ${lastName} updated successfully!`);
    res.redirect(`/patients/${req.params.id}`);

  } catch (error) {
    console.error('Update patient error:', error);
    req.flash('error_msg', 'Error updating patient');
    res.redirect(`/patients/${req.params.id}/edit`);
  }
});

// DELETE /patients/:id - Delete patient
router.delete('/:id', requireAuth, canAccessPatient, async (req, res) => {
  try {
    // Check if patient has any tests
    const Test = require('../models/Test');
    const testCount = await Test.countDocuments({ patient: req.params.id });

    if (testCount > 0) {
      req.flash('error_msg', 'Cannot delete patient with existing test records');
      return res.redirect('/patients');
    }

    const patient = await Patient.findByIdAndDelete(req.params.id);
    if (!patient) {
      req.flash('error_msg', 'Patient not found');
      return res.redirect('/patients');
    }

    req.flash('success_msg', 'Patient deleted successfully');
    res.redirect('/patients');

  } catch (error) {
    console.error('Delete patient error:', error);
    req.flash('error_msg', 'Error deleting patient');
    res.redirect('/patients');
  }
});

module.exports = router;