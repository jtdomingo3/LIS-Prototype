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
router.get('/new', requireAuth, canAccessPatient, (req, res) => {
  res.render('patients/new', {
    title: 'Add New Patient',
    patient: {}
  });
});

// POST /patients - Create new patient
router.post('/', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const { firstName, lastName, dateOfBirth, gender, phone, email, address, physician } = req.body;
    // encoder may provide age instead of DOB -> accept either
    const ageManual = req.body.ageManual || req.body.age || null;
    // normalize requiredAreas (checkboxes)
    const requiredAreas = Array.isArray(req.body.requiredAreas)
      ? req.body.requiredAreas
      : req.body.requiredAreas ? [req.body.requiredAreas] : [];

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
      requiredAreas,
      createdBy: req.session.user.id
    });

    await patient.save();

    // After encoding a new patient, automatically create Tests for each selected test
    try {
      const Test = require('../models/Test');
      // Fetch existing tests for this patient to avoid creating duplicates
      const existing = await Test.find({ patient: patient.id }) || [];
      console.log('Auto-create test: found existing tests for patient', { patientId: patient.id, existingCount: Array.isArray(existing) ? existing.length : 0 });

      // Normalize selected tests (stored in requiredAreas) to array of strings
      const selected = Array.isArray(requiredAreas) ? requiredAreas : (requiredAreas ? [requiredAreas] : []);

      // Mapping of test -> area used for initial status routing
      const TEST_TO_AREA = {
        'blood-chemistry-albumin': 'Extraction Area',
        'blood-chemistry-blood-sugar': 'Extraction Area',
        'blood-chemistry-bun-crea': 'Extraction Area',
        'blood-chemistry-electrolytes': 'Extraction Area',
        'blood-chemistry-hba1c': 'Extraction Area',
        'blood-chemistry-lipid-profile': 'Extraction Area',
        'blood-chemistry-sgpt-sgot': 'Extraction Area',
        'blood-typing': 'Extraction Area',
        'ct-bt': 'Extraction Area',
        'dengue-duo': 'Extraction Area',
        'drugtest': 'Drug Test',
        'ecg': 'ECG',
        'echocardiography-2d': '2D Echo',
        'esr': 'Extraction Area',
        'fecal-occult-blood': 'Extraction Area',
        'fecalysis': 'Extraction Area',
        'hematology': 'Extraction Area',
        'pregnancy-test': 'Extraction Area',
        'pt-aptt': 'Extraction Area',
        'serology': 'Extraction Area',
        'thyroid-panel': 'Extraction Area',
        'ultrasound-1st-trimester-obstetrics': 'Ultrasound',
        'ultrasound-abd-kubp-hbt': 'Ultrasound',
        'ultrasound-biophysical': 'Ultrasound',
        'ultrasound-pelvic': 'Ultrasound',
        'ultrasound-transvaginal': 'Ultrasound',
        'urinalysis': 'Extraction Area',
        'xray': 'X-ray'
      };

      // Determine blood-chemistry group count; if two or more variants selected, also add overall 'blood-chemistry'
      const bloodVariants = selected.filter(s => String(s || '').toLowerCase().startsWith('blood-chemistry-') && String(s || '').toLowerCase() !== 'blood-chemistry');
      const makeOverallBloodChem = (bloodVariants.length >= 2 && !selected.includes('blood-chemistry'));

      // Build a deduped list of tests to create
      const toCreateSet = new Set(selected.map(s => String(s || '').trim()).filter(s => s));
      if (makeOverallBloodChem) toCreateSet.add('blood-chemistry');

      // Build set of required area names for this patient based on selected tests
      const requiredAreaNames = new Set();
      for (const t of Array.from(toCreateSet)) {
        const tt = String(t || '').trim();
        if (!tt) continue;
        const ar = TEST_TO_AREA[tt] || 'Extraction Area';
        // Normalize 'X-Ray' spelling used in AREAS
        if (String(ar).toLowerCase().includes('xray') || String(ar).toLowerCase().includes('x-ray')) requiredAreaNames.add('X-ray');
        else if (String(ar).toLowerCase().includes('drug')) requiredAreaNames.add('Drug Test');
        else if (String(ar).toLowerCase().includes('ultrasound')) requiredAreaNames.add('Ultrasound');
        else requiredAreaNames.add(ar);
      }

      // Prepare uniqueness helpers
      const allTestsForId = await Test.find({});
      let maxNum = 0;
      if (allTestsForId && allTestsForId.length) {
        maxNum = allTestsForId.reduce((max, t) => {
          const n = parseInt((t.testId || 'T0').substring(1)) || 0;
          return Math.max(max, n);
        }, 0);
      }
      let nextNum = maxNum + 1;

      const createdTests = [];
      let totalCharges = 0;
      const charges = [];
      let clinicalTotal = 0;
      let xrayTotal = 0;
      // Build a set of currently active test types to avoid duplicates
      const activeTypes = new Set((existing || []).filter(t => t && t.status && t.status !== 'Completed' && t.status !== 'Releasing of Result').map(t => String(t.testType || '').toLowerCase()));

      for (const tt of Array.from(toCreateSet)) {
        const type = String(tt || '').trim();
        if (!type) continue;
        // skip if an active test of same normalized type exists
        if (activeTypes.has(type.toLowerCase())) continue;

        // generate unique testId
        let testId = 'T' + String(nextNum).padStart(3, '0');
        while ((await Test.findOne({ testId })) !== null) {
          nextNum++;
          testId = 'T' + String(nextNum).padStart(3, '0');
        }
        nextNum++;

        const area = TEST_TO_AREA[type] || 'Extraction Area';
        // Always route newly created tests to Payment Area first so payment is collected
        // before forwarding to Extraction/X-ray. Forwarding is handled after payment.
        const status = 'Payment Area';

        // determine price for this test (form inputs named like price-<testKey>)
        const priceKey = `price-${type}`;
        let price = 0;
        if (req.body && typeof req.body[priceKey] !== 'undefined') {
          price = parseFloat(req.body[priceKey]) || 0;
        }

        const newTest = new Test({
          testId,
          patient: patient.id,
          testType: type,
          testDate: (new Date()).toISOString(),
          status,
          requestedBy: req.session.user.id,
          createdAt: (new Date()).toISOString(),
          specimenNumbers: {},
          price
        });

        await newTest.save();
        createdTests.push(newTest);
        // record charge and attribute to lab totals
        if (price && price > 0) {
          totalCharges += price;
          charges.push({ testType: type, amount: price });
          // classify by area name (case-insensitive, accept variations like 'xray' or 'x-ray')
          try {
            const aNorm = String(area || '').toLowerCase();
            if (aNorm.includes('xray') || aNorm.includes('x-ray')) {
              xrayTotal += price;
            } else {
              clinicalTotal += price;
            }
          } catch (e) {
            clinicalTotal += price;
          }
        }

        // emit SSE
        try {
          const sse = require('../lib/sseEmitter');
          if (sse && typeof sse.emit === 'function') {
            const payload = {
              action: 'assign',
              testId: newTest.testId,
              area: status,
              time: (new Date()).toISOString(),
              patientCode: patient.patientCode,
              patientName: `${patient.firstName} ${patient.lastName}`
            };
            sse.emit('update', payload);
          }
        } catch (emitErr) {
          console.warn('Auto-create SSE emit failed', emitErr);
        }
      }

      // persist estimated charges on patient record, including lab totals
      try {
        if (charges.length) {
          patient.charges = charges;
          patient.estimatedTotal = totalCharges;
          patient.labTotals = { clinical: clinicalTotal, xray: xrayTotal };
          // Prepare payment items: one entry per lab (clinical, xray) so payments UI can add a single payment per lab
          const paymentItems = [];
          if (clinicalTotal > 0) paymentItems.push({ lab: 'clinical', amount: clinicalTotal, paid: false });
          if (xrayTotal > 0) paymentItems.push({ lab: 'xray', amount: xrayTotal, paid: false });
          patient.paymentItems = paymentItems;
          // Also persist derived required area names for forwarding logic
          try {
            patient.requiredAreas = Array.from(requiredAreaNames || []);
          } catch (e) {
            // fallback: keep existing requiredAreas value
          }
          await patient.save();
        }
      } catch (e) {
        console.warn('Failed to save patient charges', e);
      }

      if (createdTests.length) {
        req.flash('success_msg', `Patient ${firstName} ${lastName} added and ${createdTests.length} test(s) assigned`);
      } else {
        req.flash('success_msg', `Patient ${firstName} ${lastName} added successfully!`);
      }
    } catch (err) {
      console.error('Auto-create test error:', err);
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