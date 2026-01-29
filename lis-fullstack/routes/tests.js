const express = require('express');
const router = express.Router();
const Test = require('../models/Test');
const Patient = require('../models/Patient');
const User = require('../models/User');
const { requireAuth, canAccessPatient } = require('../middleware/auth');
const sseEmitter = require('../lib/sseEmitter');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

// multer for handling multipart/form-data file uploads in memory
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });


// GET /tests - List all tests
router.get('/', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const searchQuery = req.query.search || '';
    const statusFilter = req.query.status || '';
    const typeFilter = req.query.testType || '';

  // Get all tests and patients
  let allTests = await Test.find({});
  const allPatients = await Patient.find({});

    // Available test types for filter dropdown
    const availableTestTypes = Array.isArray(allTests) ? Array.from(new Set(allTests.map(t => (t.testType || '').toString()).filter(Boolean))).sort() : [];

    // Apply search filter
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      allTests = allTests.filter(test => {
        const patient = allPatients.find(p => p.id === test.patient);
        const patientName = patient ? `${patient.firstName} ${patient.lastName}`.toLowerCase() : '';
        return (test.testId || '').toString().toLowerCase().includes(searchLower) ||
               (test.testType || '').toString().toLowerCase().includes(searchLower) ||
               patientName.includes(searchLower);
      });
    }

    // Ensure For Send Out is added even when no selectedTests were provided
    try {
      const forSendOutAlways = req.body.forSendOut === '1' || req.body.forSendOut === 'on' || req.body.forSendOut === 'true';
      if (forSendOutAlways) {
        const exists = requestedTestsDetailed.some(r => String(r.label || r.key || '').toLowerCase() === 'for send out');
        if (!exists) {
          const amtRaw = req.body['amount_sendout'];
          const amt = amtRaw ? parseFloat(String(amtRaw).replace(/,/g,'')) : 0;
          const remark = req.body['remark_sendout'] || '';
          // normalize to internal 'Sendout' area
          requestedTestsDetailed.push({ key: 'For Send Out', label: 'For Send Out', amount: isNaN(amt) ? 0 : amt, lab: 'external', area: 'Sendout', remarks: remark });
        }
      }
    } catch (e) {}

    // Apply status filter
    if (statusFilter) {
      const sf = statusFilter.toString().toLowerCase();
      allTests = allTests.filter(t => ((t.status || '').toString().toLowerCase() === sf));
    }

    // Apply testType filter (substring match)
    if (typeFilter) {
      const tf = typeFilter.toString().toLowerCase();
      allTests = allTests.filter(t => (t.testType || '').toString().toLowerCase().includes(tf));
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
      searchQuery,
      statusFilter,
      typeFilter,
      availableTestTypes
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
      'esr.ejs',
      'fecal-occult-blood.ejs',
      'urinalysis.ejs',
      'ct-bt.ejs',
      'blood-typing.ejs',
      'pregnancy-test.ejs',
      'dengue-duo.ejs',
      'thyroid-panel.ejs',
      'blood-chemistry.ejs',
      'blood-chemistry-sgpt-sgot.ejs',
      'blood-chemistry-bun-crea.ejs',
      'blood-chemistry-lipid-profile.ejs',
      'blood-chemistry-electrolytes.ejs',
      'blood-chemistry-hba1c.ejs',
      'blood-chemistry-albumin.ejs',
      'blood-chemistry-blood-sugar.ejs',
      'pt-aptt.ejs',
      'xray.ejs',
      'ecg.ejs',
      'hematology.ejs',
      'serology.ejs',
      'ultrasound-abd-kubp-hbt.ejs',
      'echocardiography-2d.ejs',
      'ultrasound-transvaginal.ejs',
      'ultrasound-biophysical.ejs',
      'ultrasound-1st-trimester-obstetrics.ejs',
      'ultrasound-pelvic.ejs',
      'drugtest.ejs'
    ];
    const files = fs.readdirSync(resultsDir).filter(f => allowed.includes(f));
    const staticTemplates = files.map(f => {
      if (f === 'drugtest.ejs') return { name: 'Drug Test', testType: 'drugtest' };
      if (f === 'blood-chemistry-bun-crea.ejs') {
        return { name: 'Blood Chemistry - BUN/Crea', testType: 'BUN/Creat' };
      }
      if (f === 'blood-chemistry-sgpt-sgot.ejs') {
        return { name: 'Blood Chemistry - SGPT/SGOT', testType: 'Blood Chemistry - SGPT/SGOT' };
      }
      if (f === 'ultrasound-abd-kubp-hbt.ejs') {
        return { name: 'Ultrasound - ABD / KUBP / HBT', testType: 'ultrasound-abd-kubp-hbt' };
      }
      if (f === 'echocardiography-2d.ejs') {
        return { name: 'Echocardiography - 2D', testType: 'echocardiography-2d' };
      }
      if (f === 'ultrasound-transvaginal.ejs') {
        return { name: 'Ultrasound - Transvaginal', testType: 'ultrasound-transvaginal' };
      }
      if (f === 'ultrasound-biophysical.ejs') {
        return { name: 'Ultrasound - Biophysical', testType: 'ultrasound-biophysical' };
      }
      if (f === 'ultrasound-1st-trimester-obstetrics.ejs') {
        return { name: 'Ultrasound - Trimester Obstetrics', testType: 'ultrasound-trimester-obstetrics' };
      }
      if (f === 'ultrasound-pelvic.ejs') {
        return { name: 'Ultrasound - Pelvic Ultrasound', testType: 'ultrasound-pelvic' };
      }
      const name = f.replace('.ejs', '').replace(/-/g, ' ');
      return { name: name.charAt(0).toUpperCase() + name.slice(1), testType: f.replace('.ejs','') };
    });
    templates = templates.concat(staticTemplates);
    // Ensure trimester ultrasound static template is available in selection
    try {
      const exists = templates.some(t => (t.testType || '').toLowerCase() === 'ultrasound-trimester-obstetrics');
      if (!exists) {
        templates.push({ name: 'Ultrasound - Trimester Obstetrics', testType: 'ultrasound-trimester-obstetrics' });
      }
    } catch (e) {}
  } catch (e) {
    // ignore static templates on error
  }

    const test = {};
    test.patient = req.query.patient || '';
    // If opening the new test form from a patient link, enable print-after-assign by default
    if (req.query && req.query.patient) {
      test.printAfterAssign = '1';
    }
    res.render('tests/new', {
      title: 'Create New Test',
      test,
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
    // normalize selected tests (from checkbox grid)
    const selectedTests = Array.isArray(req.body.selectedTests) ? req.body.selectedTests : (req.body.selectedTests ? [req.body.selectedTests] : []);

    // Build detailed requestedTests if selectedTests provided
    let requestedTestsDetailed = [];
    let awaitingOnly = false;
    if (selectedTests.length) {
      const mapTestToArea = (testLabel) => {
        const s = String(testLabel || '').toLowerCase();
        if (!s) return null;
        if (s.includes('fecal') || s.includes('pregnancy') || s.includes('urinalysis')) return null;
        if (s.includes('echocardiography') || s.includes('2d echo') || s.includes('2d')) return '2D Echo';
        if (s.includes('drugtest') || s.includes('drug test')) return 'Drug Test';
        if (s.includes('ecg')) return 'ECG';
        if (s.includes('ultrasound')) return 'Ultrasound';
        if (s.includes('xray') || s.includes('x-ray')) return 'X-ray';
        if (s.includes('blood') || s.includes('chemistry') || s.includes('hematology') || s.includes('serology') || s.includes('pt') || s.includes('aptt')) return 'Extraction Area';
        return null;
      };
      const mappedAreas = new Set();
      for (const t of selectedTests) {
        const raw = String(t || '');
        const slug = raw.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
        const amtRaw = req.body['amount_' + slug];
        const amt = amtRaw ? parseFloat(String(amtRaw).replace(/,/g,'')) : 0;
        const remark = req.body['remark_' + slug] || '';
        const area = mapTestToArea(raw);
        if (area) mappedAreas.add(area);
        requestedTestsDetailed.push({ key: raw, label: raw, amount: isNaN(amt) ? 0 : amt, lab: (area === 'X-ray') ? 'xray' : 'clinical', area: area || null, remarks: remark });
      }
      awaitingOnly = selectedTests.length > 0 && mappedAreas.size === 0;
      // Add For Send Out if present
      const forSendOut = req.body.forSendOut === '1' || req.body.forSendOut === 'on' || req.body.forSendOut === 'true';
      if (forSendOut) {
        const amtRaw = req.body['amount_sendout'];
        const amt = amtRaw ? parseFloat(String(amtRaw).replace(/,/g,'')) : 0;
        const remark = req.body['remark_sendout'] || '';
        // use internal normalized area name 'Sendout' (do not expose as separate kiosk tile)
        requestedTestsDetailed.push({ key: 'For Send Out', label: 'For Send Out', amount: isNaN(amt) ? 0 : amt, lab: 'external', area: 'Sendout', remarks: remark });
      }
    }

    // Normalize requiredAreas from form (may contain doctor selections)
    const requiredAreas = Array.isArray(req.body.requiredAreas) ? req.body.requiredAreas : (req.body.requiredAreas ? [req.body.requiredAreas] : []);

    // Also include any selected Doctor's Check-up requiredAreas as requested tests so they appear on receipts
    try {
      for (const ra of requiredAreas) {
        if (!ra) continue;
        const rstr = String(ra || '').trim();
        if (/doctor/i.test(rstr) && /check/i.test(rstr)) {
          // Normalize label to shorter form to keep it on one line when printed
          const normalized = rstr.replace(/Doctor'?s\s*Check-?up/i, 'Doctor Check-up');
          // Avoid duplicating if already present
          const exists = requestedTestsDetailed.some(x => String(x.label || x.key || '').toLowerCase() === normalized.toLowerCase());
          if (!exists) requestedTestsDetailed.push({ key: normalized, label: normalized, amount: 0, lab: 'clinical', area: 'Doctor', remarks: '' });
        }
      }
    } catch (e) {}

    // Validate required fields: require patient and either a single testType, selectedTests,
    // or a doctor/sendout selection (these are allowed to create tests without a testType)
    const hasSelected = Array.isArray(selectedTests) && selectedTests.length > 0;
    const doctorSelected = requiredAreas.some(r => r && /doctor/i.test(String(r)));
    const forSendOutFlag = (req.body.forSendOut === '1' || req.body.forSendOut === 'on' || req.body.forSendOut === 'true') || requestedTestsDetailed.some(r => String(r.area || '').toLowerCase() === 'sendout');
    if (!patient || (!testType && !hasSelected && !doctorSelected && !forSendOutFlag)) {
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

    // Helper: determine prefix from label
    const getPrefixForLabel = (label) => {
      const s = String(label || '').toLowerCase();
      if (/send\s*out|for\s*send|sendout|send-out/.test(s)) return 'SO';
      if (/doctor|check-?up|checkup/.test(s)) return 'DC';
      if (/drug/.test(s)) return 'DT';
      if (/\becg\b|electrocardio|electrocardiogram/.test(s)) return 'ECG';
      if (/x[-\s]?ray|radiograph/.test(s)) return 'XR';
      if (/ultrasound|ultra[-\s]?sound/.test(s)) return 'US';
      if (/echo|echocardiograph|echocardiography|2d\s*echo/.test(s)) return 'ECHO';
      if (/serol|serology/.test(s)) return 'SR';
      if (/fecal|fecalysis|stool/.test(s)) return 'FA';
      if (/urinal|urine|urinalysis/.test(s)) return 'UA';
      if (/pregnan|pregnancy/.test(s)) return 'PT';
      // Specific clinical tests -> unique prefixes
      if (/blood\s*typing|blood-typing|bloodtyping/.test(s)) return 'BT';
      if (/hematology|hemato|cbc/.test(s)) return 'HM';
      if (/thyroid|thyroid\s*panel/.test(s)) return 'TH';
      if (/\besr\b|erythrocyte/.test(s)) return 'ESR';
      if (/dengue/.test(s)) return 'DG';
      if (/(ct\s*&?\s*bt|ct\s*bt|ct\s*and\s*bt|bleeding|clotting)/.test(s)) return 'CTBT';
      if (/blood|chemistry|pt|aptt|bun|crea|sgpt|sgot|lipid|hba1c|albumin|blood\s*sugar|chemistry/.test(s)) return 'BC';
      return 'T';
    };

    // Helper: get next counter and persist
    const getNextTestId = (prefix) => {
      try {
        const counters = global.db.getCounters() || {};
        const next = (counters[prefix] || 0) + 1;
        counters[prefix] = next;
        global.db.saveCounters(counters);
        // increase width to accommodate more test ids (add 3 digits)
        return prefix + String(next).padStart(7, '0');
      } catch (e) {
        // fallback to timestamp-based id
        return prefix + Date.now();
      }
    };

    const createdTests = [];

    // Helper to detect doctor-only requested item

    // Helper to detect doctor-only requested item
    const isDoctorRequest = (rt) => {
      try {
        const lab = String(rt.lab || '').toLowerCase();
        const label = String(rt.label || rt.key || '').toLowerCase();
        if (lab === 'doctor' || label.includes('doctor')) return true;
      } catch (e) {}
      return false;
    };

    // Helper to pick doctor area string from requiredAreas (prefer Lorenzo then Arcilla)
    const pickDoctorArea = () => {
      try {
        for (const r of requiredAreas) {
          if (!r) continue;
          const s = String(r).toLowerCase();
          if (s.includes("dr. lorenzo") || s.includes('lorenzo')) return "Doctor's Check-up - Dr. Lorenzo";
          if (s.includes("dr. arcilla") || s.includes('arcilla')) return "Doctor's Check-up - Dr. Arcilla";
        }
      } catch (e) {}
      return null;
    };

    // Helper to lookup doctor user by last name
    const findDoctorUser = async (areaStr) => {
      try {
        if (!areaStr) return null;
        if (areaStr.toLowerCase().includes('lorenzo')) {
          const docs = await User.find({ role: 'Doctor' });
          return docs.find(d => String(d.name || '').toLowerCase().includes('lorenzo')) || null;
        }
        if (areaStr.toLowerCase().includes('arcilla')) {
          const docs = await User.find({ role: 'Doctor' });
          return docs.find(d => String(d.name || '').toLowerCase().includes('arcilla')) || null;
        }
      } catch (e) { console.warn('findDoctorUser failed', e); }
      return null;
    };

    // Group blood chemistry variants into single 'Blood Chemistry' test when multiple selected
    if (requestedTestsDetailed && requestedTestsDetailed.length) {
      const copyRequested = requestedTestsDetailed.slice();
      // Treat specific requested items as Blood Chemistry only when they match chemistry-related keywords
      // but explicitly exclude 'typing' (e.g., 'Blood Typing') which is a separate serology/hematology test.
      const isBloodChem = r => {
        const s = String(r.key || r.label || '').toLowerCase();
        if (!s) return false;
        if (s.includes('typing')) return false; // exclude Blood Typing
        return /chemistry|bun|crea|sgpt|sgot|lipid|hba1c|albumin|blood\s*sugar|blood\s*chemistry/.test(s);
      };
      const bloodItems = copyRequested.filter(isBloodChem);
      if (bloodItems.length > 1) {
        const prefix = getPrefixForLabel('Blood Chemistry');
        const tid = getNextTestId(prefix);
        const payload = {
          testId: tid,
          patient,
          testType: 'Blood Chemistry',
          testDate: (new Date()).toISOString(),
          status: 'Payment Area',
          priority: (priority && String(priority).trim()) ? priority : 'Normal',
          requestedBy: req.session.user.id,
          requestedTests: bloodItems,
          awaitingOnly: awaitingOnly
        };
        const t = new Test(payload);
        await t.save();
        createdTests.push(t);
        // remove blood items from further processing
        for (const b of bloodItems) {
          const idx = copyRequested.findIndex(x => x.key === b.key && x.label === b.label);
          if (idx >= 0) copyRequested.splice(idx, 1);
        }
      }

      // Create individual tests for remaining requested items
      for (const rt of copyRequested) {
        const prefix = getPrefixForLabel(rt.label || rt.key || 'T');
        const tid = getNextTestId(prefix);
        const payload = {
          testId: tid,
          patient,
          testType: rt.label || rt.key || 'Test',
          testDate: (new Date()).toISOString(),
          status: 'Payment Area',
          priority: (priority && String(priority).trim()) ? priority : 'Normal',
          requestedBy: req.session.user.id,
          requestedTests: [rt],
          awaitingOnly: awaitingOnly
        };
        // If this single requested item is a doctor-only request and no other non-doctor items
        // are present for this patient creation flow, queue directly to doctor's checkup.
        try {
          const doctorArea = pickDoctorArea();
          if (isDoctorRequest(rt) && (!copyRequested.some(x => !isDoctorRequest(x)))) {
            if (doctorArea) {
              payload.status = doctorArea;
              const docUser = await findDoctorUser(doctorArea);
              if (docUser) { payload.assignedDoctorId = docUser.id; payload.assignedDoctorName = docUser.name; }
            } else {
              // if no explicit doctor selected, use a generic doctor area default to Lorenzo
              payload.status = "Doctor's Check-up - Dr. Lorenzo";
              const docUser = await findDoctorUser("Doctor's Check-up - Dr. Lorenzo");
              if (docUser) { payload.assignedDoctorId = docUser.id; payload.assignedDoctorName = docUser.name; }
            }
          }
        } catch (e) { console.warn('Doctor assignment logic failed', e); }
        const t = new Test(payload);
        await t.save();
        createdTests.push(t);
      }
    } else {
      // Single testType path
      // Detect sendout single-request early: use SO prefix and queue to Sendout immediately
      const forSendOutSingle = req.body && (req.body.forSendOut === '1' || req.body.forSendOut === 'on' || req.body.forSendOut === 'true');
      let prefix = getPrefixForLabel(testType || 'T');
      if (forSendOutSingle) prefix = 'SO';
      const tid = getNextTestId(prefix);
      const payload = {
        testId: tid,
        patient,
        testType: forSendOutSingle ? 'For Send Out' : (testType || 'Registration'),
        testDate: (new Date()).toISOString(),
        // keep initial status as 'Payment Area' so reception/payment can process it
        status: 'Payment Area',
        results,
        notes,
        priority: (priority && String(priority).trim()) ? priority : 'Normal',
        requestedBy: req.session.user.id
      };
      // If the form requested a Send Out but no detailed requestedTests were provided
      // (single testType path), attach a normalized For Send Out requested item so
      // the Payment Area processing can route it to the internal 'Sendout' area.
      // Add defensive logging to help debug missing form fields in production.
      try {
        console.log('DEBUG POST /tests - single-path payload check, forSendOut raw=', req.body && req.body.forSendOut);
      } catch (e) {}
      if (!requestedTestsDetailed.length && forSendOutSingle) {
        const amtRaw = req.body['amount_sendout'];
        const amt = amtRaw ? parseFloat(String(amtRaw).replace(/,/g,'')) : 0;
        const remark = req.body['remark_sendout'] || '';
        payload.requestedTests = [{ key: 'For Send Out', label: 'For Send Out', amount: isNaN(amt) ? 0 : amt, lab: 'external', area: 'Sendout', remarks: remark }];
        payload.awaitingOnly = awaitingOnly;
        console.log('DEBUG POST /tests - attached single-path For Send Out requestedTests', payload.requestedTests);
      } else if (requestedTestsDetailed.length) {
        payload.requestedTests = requestedTestsDetailed;
        payload.awaitingOnly = awaitingOnly;
        console.log('DEBUG POST /tests - attached requestedTestsDetailed length=', requestedTestsDetailed.length);
      } else {
        // ensure requestedTests exists as empty array for clarity in DB
        payload.requestedTests = payload.requestedTests || [];
      }
      // If this is a doctor check-up (and there are no X-ray/clinical/lab items), queue directly
      try {
        const allDoctorOnly = requestedTestsDetailed.length && requestedTestsDetailed.every(isDoctorRequest);
        const doctorArea = pickDoctorArea();
        if ((String(testType || '').toLowerCase().includes('doctor') || allDoctorOnly) && allDoctorOnly) {
          if (doctorArea) {
            payload.status = doctorArea;
            const docUser = await findDoctorUser(doctorArea);
            if (docUser) { payload.assignedDoctorId = docUser.id; payload.assignedDoctorName = docUser.name; }
          } else {
            payload.status = "Doctor's Check-up - Dr. Lorenzo";
            const docUser = await findDoctorUser("Doctor's Check-up - Dr. Lorenzo");
            if (docUser) { payload.assignedDoctorId = docUser.id; payload.assignedDoctorName = docUser.name; }
          }
        }
      } catch (e) { console.warn('Doctor-only single test logic failed', e); }
      const t = new Test(payload);
      await t.save();
      createdTests.push(t);
    }

    // Emit SSE update so reception/kiosk updates
    try {
      sseEmitter.emit('update', { action: 'assigned', patientId: patient, tests: createdTests.map(ct => ({ testId: ct.testId, id: ct.id, testType: ct.testType })), time: (new Date()).toISOString() });
    } catch (e) { console.warn('SSE emit failed', e); }

    // If UI requested printing after assign, invoke print helper once for the patient with all created tests
    try {
      const doctorSelected = requiredAreas.some(r => String(r || '').toLowerCase().includes('doctor') && String(r || '').toLowerCase().includes('check'));
      let doPrint = req.body && (req.body.printAfterAssign === '1' || req.body.printAfterAssign === 'on' || req.body.printAfterAssign === 'true');
      if (doctorSelected) doPrint = true;
      if (doPrint) {
        const printHelper = require('../lib/printHelper');
        const patientObj = await Patient.findById(patient);
        // Fire-and-forget printing so HTTP response/redirect is not blocked by printer transport
        printHelper.printPatientReceipt(patientObj, createdTests)
          .then(result => {
            if (result && result.success) console.log('Background print succeeded for patient', patient);
            else console.warn('Background print failed for patient', patient, result && result.error);
          })
          .catch(err => console.warn('Background print error', err));
      }
    } catch (e) {
      console.error('Print after assign error:', e);
      req.flash('warning_msg', `Tests created but printing error occurred`);
    }

    req.flash('success_msg', `Tests created successfully!`);
    return res.redirect('/patients');

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

    // Only render form for supported test types (including pregnancy)
    // Temporary diagnostic: log testType and guard evaluations to help debugging
    const tt = test.testType || '';
    const checks = {
      fecalysis: /fecalysis/i.test(tt),
      fecal_occult: /(fecal\s*occult|fecal-occult|fecaloccult)/i.test(tt),
      urinalysis: /urinalysis/i.test(tt),
      lipid: /(lipid|lipid\s*profile|blood\s*chemistry\s*-?\s*lipid|blood\s*chemistry\s*lipid\s*profile|blood\s*chemistry\s*lipid)/i.test(tt),
      electrolytes: /(electrolyte|electrolytes|sodium|potassium|chloride)/i.test(tt),
        blood_sugar: /(blood sugar|blood-sugar|sugar|fbs|rbs|1st hour|2nd hour)/i.test(tt),
      hematology: /hemato|hematology|cbc/i.test(tt),
      blood_typing: /(blood\s*typing|blood-typing|bloodtyping)/i.test(tt),
      serology: /serol|serology/i.test(tt),
      thyroid: /thyroid|thyroid\s*panel|thyroid-panel/i.test(tt),
      hba1c: /(hba1c|hb\s*a1c|hb-a1c|hba\s*1c)/i.test(tt),
      albumin: /(albumin|alb)/i.test(tt),
      pregnancy: /pregnan|pregnancy|pregnancy\s*test/i.test(tt),
      dengue: /dengue/i.test(tt),
      pt: /\b(?:pt|prothrombin|pt-aptt|ptaptt)\b/i.test(tt),
      blood_chem: /(blood\s*chemistry|blood-chemistry|blood\s*chem)/i.test(tt),
        echocardiography: /(echo|echocardiograph|echocardiography|2d\s*echo|2decho)/i.test(tt),
      ultrasound_abd: /(ultrasound[-\s]?abd[-\s]?kubp[-\s]?hbt)/i.test(tt),
      ultrasound_transvaginal: /(ultrasound[-\s]?transvaginal|transvaginal)/i.test(tt),
      ultrasound_biophysical: /(ultrasound[-\s]?biophysical|biophysical)/i.test(tt),
      ultrasound_pelvic: /(static:)?(ultrasound[-_\s]?pelvic(\.ejs)?|pelvic)/i.test(tt),
      ultrasound_1st_trimester: /(?:1st|first|2nd|second|3rd|third|trimester|trimester[-_\s]?obstetrics|ultrasound[-_\s]?trimester)/i.test(tt),
      esr: /(esr|erythrocyte|erythrocyte\s*sedimentation|erythrocyte\s*sedimentation\s*rate)/i.test(tt)
      ,
      drugtest: /(drug\s*test|drugtest)/i.test(tt),
      ct_bt: /(bleeding|clotting|ct\s*&?\s*bt|ct\s*and\s*bt)/i.test(tt)
      ,
      xray: /(x-?ray|xray|radiograph)/i.test(tt),
      ecg: /(ecg|electrocardio|electrocardiogram)/i.test(tt)
      ,
      echocardiography: /(echo|echocardiograph|echocardiography|2d\s*echo|2decho)/i.test(tt)
    };
    // Fallback: if the POST body contains gestational/CRL fields, treat as ultrasound (pelvic/transvaginal)
    try {
      const hasGest = req && req.body && (req.body.gestational_sac_length || req.body.gestational_sac_length_A || req.body.gestational_sac_length_B);
      const hasCrl = req && req.body && (req.body.crl_length || req.body.crl_length_A || req.body.crl_length_B);
      const hasBiophysical = req && req.body && (req.body.bpd_size || req.body.hc_size || req.body.ac_size || req.body.fl_size || req.body['biometry_size[]'] || req.body.biometry_size);
      if (hasGest || hasCrl) {
        checks.ultrasound_transvaginal = true;
        checks.ultrasound_pelvic = true;
      } else if (hasBiophysical) {
        checks.ultrasound_biophysical = true;
      }
    } catch (e) {}
    console.log(`DEBUG GET /tests/${req.params.id}/results - testType='${tt}', checks=`, checks);
    if (!tt || !Object.values(checks).some(Boolean)) {
      console.error(`UNSUPPORTED results entry request for test ${req.params.id} - testType='${tt}'`, { checks });
      req.flash('error_msg', 'Results entry form is only available for supported test types (including Pregnancy Test)');
      return res.redirect(`/tests/${req.params.id}`);
    }

    // populate patient and performedBy user list
    const patient = test.patient ? await Patient.findById(test.patient) : null;
    const testForView = { ...test, patient: patient ? patient.toJSON() : null };
    const users = await User.find({});

    // choose the appropriate entry form
    let view = 'tests/results_entry_fecalysis';
    // normalize testType for robust matching (remove non-alphanumerics)
    const normalizedType = String(test.testType || '').toLowerCase().replace(/[^a-z0-9]/g, ' ');
    if (/(lipid|lipid\s*profile|blood\s*chemistry\s*-\s*lipid|blood\s*chemistry\s*lipid)/i.test(test.testType)) view = 'tests/results_entry_blood_chemistry_lipid_profile';
    if (/(sgpt|sgot)/i.test(normalizedType)) view = 'tests/results_entry_blood_chemistry_sgpt_sgot';
    if (/(hba1c|hb\s*a1c|hb-a1c|hba\s*1c)/i.test(test.testType)) view = 'tests/results_entry_blood_chemistry_hba1c';
    if (/(electrolyte|electrolytes|sodium|potassium|chloride)/i.test(test.testType)) view = 'tests/results_entry_blood_chemistry_electrolytes';
    if (/(blood sugar|blood-sugar|sugar|fbs|rbs|1st hour|2nd hour)/i.test(test.testType)) view = 'tests/results_entry_blood_chemistry_blood_sugar';
    if (/(albumin|alb)/i.test(normalizedType)) view = 'tests/results_entry_blood_chemistry_albumin';
    if (/(x-?ray|xray|radiograph)/i.test(test.testType)) view = 'tests/results_entry_xray';
    if (/(ecg|electrocardio|electrocardiogram)/i.test(test.testType)) view = 'tests/results_entry_ecg';
    if (/(fecal\s*occult|fecal-occult|fecaloccult)/i.test(test.testType)) view = 'tests/results_entry_fecal_occult_blood';
    if (/(bleeding|clotting|ct\s*&?\s*bt|ct\s*and\s*bt)/i.test(test.testType)) view = 'tests/results_entry_ct_bt';
    if (/(esr|erythrocyte|erythrocyte\s*sedimentation|erythrocyte\s*sedimentation\s*rate)/i.test(test.testType)) view = 'tests/results_entry_esr';
    if (/urinalysis/i.test(test.testType)) view = 'tests/results_entry_urinalysis';
    if (/hemato|hematology|cbc/i.test(test.testType)) view = 'tests/results_entry_hematology';
    if (/(blood\s*typing|blood-typing|bloodtyping)/i.test(test.testType)) view = 'tests/results_entry_blood_typing';
    if (/serol|serology/i.test(test.testType)) view = 'tests/results_entry_serology';
    if (/thyroid|thyroid\s*panel|thyroid-panel/i.test(test.testType)) view = 'tests/results_entry_thyroid_panel';
    if (/pregnan|pregnancy|pregnancy\s*test/i.test(test.testType)) view = 'tests/results_entry_pregnancy_test';
    if (/dengue/i.test(test.testType)) view = 'tests/results_entry_dengue_duo';
    if (/\b(?:pt|prothrombin|pt-aptt|ptaptt)\b/i.test(test.testType)) view = 'tests/results_entry_pt_aptt';
    if (/(bun|creatinine|bun[\s\/-]?crea|bun\/?crea)/i.test(test.testType)) view = 'tests/results_entry_blood_chemistry_bun_crea';
    if (/(blood\s*chemistry|blood-chemistry|blood\s*chem)/i.test(normalizedType) && !/(lipid|lipid\s*profile|blood\s*chemistry\s*-?\s*lipid|blood\s*chemistry\s*lipid\s*profile|blood\s*chemistry\s*lipid|electrolyte|electrolytes|sodium|potassium|chloride|hba1c|hb\s*a1c|hb-a1c|blood sugar|blood-sugar|sugar|fbs|rbs|1st hour|2nd hour|bun|creatinine|bun[\s\/\-]?crea|bun\/?crea|sgpt|sgot|albumin|alb)/i.test(normalizedType)) view = 'tests/results_entry_blood_chemistry';
    if (/(ultrasound[-\s]?transvaginal|transvaginal)/i.test(test.testType)) view = 'tests/results_entry_ultrasound_transvaginal';
    if (/(ultrasound[-\s]?biophysical|biophysical)/i.test(test.testType)) view = 'tests/results_entry_ultrasound_biophysical';
    if (/(?:1st|first|2nd|second|3rd|third|trimester|ultrasound[-_\s]?trimester)/i.test(test.testType)) view = 'tests/results_entry_ultrasound_1st_trimester_obstetrics';
    if (/(ultrasound[-\s]?abd[-\s]?kubp[-\s]?hbt)/i.test(test.testType)) view = 'tests/results_entry_ultrasound_abd_kubp_hbt';
    if (/(echo|echocardiograph|echocardiography|2d\s*echo|2decho)/i.test(test.testType)) view = 'tests/results_entry_echocardiography_2d';
    if (/(static:)?(ultrasound[-_\s]?pelvic(\.ejs)?|pelvic)/i.test(test.testType)) view = 'tests/results_entry_ultrasound_pelvic';
    if (/(drug\s*test|drugtest)/i.test(test.testType)) view = 'tests/results_entry_drugtest';
    console.log(`DEBUG GET /tests/${req.params.id}/results - selected view='${view}'`);
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
router.post('/:id/results', requireAuth, canAccessPatient, upload.single('photoFile'), async (req, res) => {
  try {
    const test = await Test.findById(req.params.id);
    if (!test) {
      req.flash('error_msg', 'Test not found');
      return res.redirect('/tests');
    }


    // Diagnostic: log testType and which regex checks match (helps debug unsupported type errors)
    const tt = test.testType || '';
    const checks = {
      fecalysis: /fecalysis/i.test(tt),
      fecal_occult: /(fecal\s*occult|fecal-occult|fecaloccult)/i.test(tt),
      urinalysis: /urinalysis/i.test(tt),
      hematology: /hemato|hematology|cbc/i.test(tt),
      blood_typing: /(blood\s*typing|blood-typing|bloodtyping)/i.test(tt),
      serology: /serol|serology/i.test(tt),
      thyroid: /thyroid|thyroid\s*panel|thyroid-panel/i.test(tt),
      pregnancy: /pregnan|pregnancy|pregnancy\s*test/i.test(tt),
      dengue: /dengue/i.test(tt),
      pt: /\b(?:pt|prothrombin|pt-aptt|ptaptt)\b/i.test(tt),
      blood_chem: /(blood\s*chemistry|blood-chemistry|blood\s*chem)/i.test(tt),
      lipid: /(lipid|lipid\s*profile|blood\s*chemistry\s*-?\s*lipid|blood\s*chemistry\s*lipid\s*profile|blood\s*chemistry\s*lipid)/i.test(tt),
      electrolytes: /(electrolyte|electrolytes|sodium|potassium|chloride)/i.test(tt),
      blood_sugar: /(blood sugar|blood-sugar|sugar|fbs|rbs|1st hour|2nd hour)/i.test(tt),
      ultrasound_abd: /(ultrasound[-\s]?abd[-\s]?kubp[-\s]?hbt)/i.test(tt),
      ultrasound_transvaginal: /(ultrasound[-\s]?transvaginal|transvaginal)/i.test(tt),
      ultrasound_biophysical: /(ultrasound[-\s]?biophysical|biophysical)/i.test(tt),
      ultrasound_pelvic: /(ultrasound[-_\s]?pelvic(\.ejs)?|pelvic)/i.test(tt),
      ultrasound_1st_trimester: /(1st\s*trimester|first\s*trimester|1st[-\s]?trimester|trimester\s*obstetrics|ultrasound[-\s]?.*1st)/i.test(tt),
      esr: /(esr|erythrocyte|erythrocyte\s*sedimentation|erythrocyte\s*sedimentation\s*rate)/i.test(tt),
      drugtest: /(drug\s*test|drugtest)/i.test(tt),
      ct_bt: /(bleeding|clotting|ct\s*&?\s*bt|ct\s*and\s*bt)/i.test(tt)
      ,
      xray: /(x-?ray|xray|radiograph)/i.test(tt)
      ,
      ecg: /(ecg|electrocardio|electrocardiogram)/i.test(tt)
    };
    console.log(`DEBUG POST /tests/${req.params.id}/results - testType='${tt}', checks=`, checks);

    // Ensure pelvic ultrasound forms are accepted even when testType string
    // does not exactly match (some forms submit fields instead of testType).
    checks.ultrasound_pelvic = checks.ultrasound_pelvic || /(static:)?(ultrasound[-_\s]?pelvic(\.ejs)?|pelvic)/i.test(tt);
    // Ensure biophysical ultrasound forms are accepted when form fields are submitted
    checks.ultrasound_biophysical = checks.ultrasound_biophysical || /(ultrasound[-\s]?biophysical|biophysical)/i.test(tt);
    // Fallback: if the request contains common ultrasound fields, accept as ultrasound-pelvic
    if (!checks.ultrasound_pelvic && req && req.body && (
      req.body.gestational_sac_length || req.body.crl_length || req.body.impression || req.body.paragraphs || req.body.findings || req.body.examination
    )) {
      checks.ultrasound_pelvic = true;
      // also mark transvaginal true for compatibility with shared ultrasound handlers
      checks.ultrasound_transvaginal = checks.ultrasound_transvaginal || true;
    }
    // Fallback: if the request contains biophysical-specific fields, accept as biophysical
    if (!checks.ultrasound_biophysical && req && req.body && (
      req.body.bpd_size || req.body.hc_size || req.body.ac_size || req.body.fl_size || req.body['biometry_size[]'] || req.body.biometry_size
    )) {
      checks.ultrasound_biophysical = true;
    }

    if (!tt || !Object.values(checks).some(Boolean)) {
      console.error(`UNSUPPORTED POST results entry for test ${req.params.id} - testType='${tt}'`, { checks, template: test && test.template });
      req.flash('error_msg', 'Invalid test type for this results form');
      return res.redirect(`/tests/${req.params.id}`);
    }

    console.log('POST /tests/:id/results body:', JSON.stringify(req.body || {}));

    // Extract common performer fields
    const { performedBy, mtName, mtLicense, pathName, pathLicense } = req.body;

    let resultsObj = {};
    let topUpdates = {};

    if (/(fecal\s*occult|fecal-occult|fecaloccult)/i.test(test.testType)) {
      const { specimen, result } = req.body;
      resultsObj = {
        specimen: (specimen || '').trim(),
        result: (result || '').trim()
      };
    } else if (/(esr|erythrocyte|erythrocyte\s*sedimentation|erythrocyte\s*sedimentation\s*rate)/i.test(test.testType)) {
      const { esr_value } = req.body;
      const raw = (esr_value || '').toString().trim();
      let flag = '';
      const val = parseFloat(raw);

      // Determine patient age and sex to choose reference range
      let patientObj = null;
      try {
        if (test.patient) patientObj = await Patient.findById(test.patient);
      } catch (e) {
        patientObj = null;
      }

      let age = null;
      if (patientObj && patientObj.dateOfBirth) {
        age = Math.max(0, new Date().getFullYear() - new Date(patientObj.dateOfBirth).getFullYear());
      }
      const sex = patientObj && patientObj.sex ? String(patientObj.sex).toLowerCase() : '';

      // Defaults
      const childUpper = 20;
      const maleUpper = 10;
      const femaleUpper = 20;
      const lower = 0;

      let upper = maleUpper;
      if (age !== null && age < 18) {
        upper = childUpper;
      } else {
        if (sex === 'male' || sex === 'm') upper = maleUpper;
        else upper = femaleUpper;
      }

      if (!isNaN(val)) {
        if (val > upper) flag = 'H';
        else if (val < lower) flag = 'L';
      }

      resultsObj = {
        esr_value: raw,
        esr_flag: flag
      };
    } else if (/(bleeding|clotting|ct\s*&?\s*bt|ct\s*and\s*bt|ct\s*bt|ctbt)/i.test(test.testType)) {
      // Accept minutes and seconds fields for more accurate time input
      const { bleeding_min, bleeding_sec, clotting_min, clotting_sec } = req.body;
      // Fallback to old single-field names if present (back-compat)
      const fallbackBt = (req.body.bleeding_time || '').toString().trim();
      const fallbackCt = (req.body.clotting_time || '').toString().trim();

      const minBt = (bleeding_min || '').toString().trim();
      const secBt = (bleeding_sec || '').toString().trim();
      const minCt = (clotting_min || '').toString().trim();
      const secCt = (clotting_sec || '').toString().trim();

      // Helper to parse ints; return null when not a valid integer
      function toIntSafe(s) {
        const n = parseInt(s, 10);
        return isNaN(n) ? null : n;
      }

      function computeTotalSeconds(minStr, secStr, fallbackStr) {
        const m = toIntSafe(minStr);
        const s = toIntSafe(secStr);
        if (m === null && s === null) {
          if (fallbackStr) {
            const parsed = parseFloat(fallbackStr);
            if (!isNaN(parsed)) return Math.round(parsed * 60);
          }
          return null;
        }
        const minutes = Math.max(0, (m === null ? 0 : m));
        let seconds = Math.max(0, (s === null ? 0 : s));
        // normalize seconds into minutes if >= 60
        if (seconds >= 60) {
          const extra = Math.floor(seconds / 60);
          seconds = seconds % 60;
          return (minutes + extra) * 60 + seconds;
        }
        return minutes * 60 + seconds;
      }

      const btSeconds = computeTotalSeconds(minBt, secBt, fallbackBt);
      const ctSeconds = computeTotalSeconds(minCt, secCt, fallbackCt);

      // Reference ranges in seconds
      const btLowerSec = 1 * 60;
      const btUpperSec = 5 * 60;
      const ctLowerSec = 2 * 60;
      const ctUpperSec = 7 * 60;

      let flagBt = '';
      let flagCt = '';
      if (btSeconds !== null && !isNaN(btSeconds)) {
        if (btSeconds > btUpperSec) flagBt = 'H';
        else if (btSeconds < btLowerSec) flagBt = 'L';
      }
      if (ctSeconds !== null && !isNaN(ctSeconds)) {
        if (ctSeconds > ctUpperSec) flagCt = 'H';
        else if (ctSeconds < ctLowerSec) flagCt = 'L';
      }

      // Prepare display strings like "2 minutes 45 secs" or fall back to numeric minute value
      function formatTimeDisplay(secVal, fallback) {
        if (secVal === null || isNaN(secVal)) return (fallback || '');
        const mins = Math.floor(secVal / 60);
        const secs = Math.round(secVal % 60);
        if (secs) return `${mins} minutes ${secs} secs`;
        return `${mins}`;
      }

      const displayBt = formatTimeDisplay(btSeconds, fallbackBt);
      const displayCt = formatTimeDisplay(ctSeconds, fallbackCt);

      resultsObj = {
        bleeding_time: displayBt,
        bleeding_time_display: displayBt,
        bleeding_seconds: btSeconds,
        bleeding_flag: flagBt,
        clotting_time: displayCt,
        clotting_time_display: displayCt,
        clotting_seconds: ctSeconds,
        clotting_flag: flagCt
      };
    } else if (/fecalysis/i.test(test.testType)) {
      const { color, consistency, pusCell, rbc, parasites, others, note } = req.body;
      resultsObj = {
        color: (color || '').trim(),
        consistency: (consistency || '').trim(),
        pusCell: (pusCell || '').trim(),
        rbc: (rbc || '').trim(),
        parasites: (parasites || '').trim(),
        others: (others || '').trim(),
        note: (note || '').trim()
      };

    } else if (/(drug\s*test|drugtest)/i.test(test.testType)) {
      // Drug test entry parsing
      const serial = (req.body.serial || '').toString().trim() || 'NB126997';
      const ccfNo = (req.body.ccfNo || '').toString().trim() || '202511290286';
      const name = (req.body.name || '').toString().trim();
      const gender = (req.body.gender || '').toString().trim();
      const transactionDateTime = req.body.transactionDateTime ? new Date(req.body.transactionDateTime).toISOString() : null;
      const reportDateTime = req.body.reportDateTime ? new Date(req.body.reportDateTime).toISOString() : null;
      const purpose = (req.body.purpose || '').toString().trim();
      const analyst = (req.body.analyst || '').toString().trim();
      const headLab = (req.body.headLab || '').toString().trim();
      // If multer processed an uploaded file, prefer that (process with sharp if available)
      let photoData = null;
      try {
        if (req.file && req.file.buffer) {
          try {
            // Try to use sharp for safe server-side resizing/compression
            const sharp = require('sharp');
            const maxDim = 800;
            const processed = await sharp(req.file.buffer)
              .rotate()
              .resize({ width: maxDim, height: maxDim, fit: 'inside' })
              .jpeg({ quality: 75 })
              .toBuffer();
            photoData = `data:image/jpeg;base64,${processed.toString('base64')}`;
          } catch (sharpErr) {
            // sharp not available or processing failed — fallback to original buffer
            photoData = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
          }
        } else if (req.body.photoData) {
          photoData = (req.body.photoData || '').toString().trim() || null;
        }
      } catch (e) {
        photoData = null;
      }

      // drugs arrays
      const names = (Array.isArray(req.body['drugNames[]']) ? req.body['drugNames[]'] : (Array.isArray(req.body.drugNames) ? req.body.drugNames : (req.body['drugNames[]'] ? [req.body['drugNames[]']] : (req.body.drugNames ? [req.body.drugNames] : []))));
      const results = (Array.isArray(req.body['drugResults[]']) ? req.body['drugResults[]'] : (Array.isArray(req.body.drugResults) ? req.body.drugResults : (req.body['drugResults[]'] ? [req.body['drugResults[]']] : (req.body.drugResults ? [req.body.drugResults] : []))));
      const remarks = (Array.isArray(req.body['drugRemarks[]']) ? req.body['drugRemarks[]'] : (Array.isArray(req.body.drugRemarks) ? req.body.drugRemarks : (req.body['drugRemarks[]'] ? [req.body['drugRemarks[]']] : (req.body.drugRemarks ? [req.body.drugRemarks] : []))));

      const drugs = [];
      const maxLen = Math.max(names.length, results.length, remarks.length);
      for (let i = 0; i < maxLen; i++) {
        const dname = (names[i] || '').toString().trim();
        const dres = (results[i] || '').toString().trim() || '';
        const drem = (remarks[i] || '').toString().trim() || '';
        if (dname || dres || drem) drugs.push({ drug: dname, result: dres, remarks: drem });
      }

      resultsObj = {
        serial,
        ccfNo,
        name,
        gender,
        transactionDateTime,
        reportDateTime,
        purpose,
        drugs,
        photoData,
        analyst,
        headLab
      };
    } else if (/(lipid|lipid\s*profile|blood\s*chemistry\s*-\s*lipid|blood\s*chemistry\s*lipid)/i.test(test.testType)) {
      // Lipid profile: Cholesterol, Triglyceride (tg), HDL, LDL (auto-calc default)
      const { cholesterol, tg, hdl, ldl, note } = req.body;
      // parse numeric values
      function toNum(v) {
        if (v === undefined || v === null) return null;
        const s = String(v).trim();
        if (s === '') return null;
        const n = parseFloat(s.replace(/[^0-9.+-eE]/g, ''));
        return isNaN(n) ? null : n;
      }
      const cholN = toNum(cholesterol);
      const tgN = toNum(tg);
      const hdlN = toNum(hdl);
      let ldlN = toNum(ldl);

      // If LDL not provided, compute using Friedewald approximation: LDL = TC - HDL - (TG/5)
      if ((ldlN === null || ldlN === undefined) && cholN !== null && hdlN !== null && tgN !== null) {
        ldlN = cholN - hdlN - (tgN / 5.0);
        // round to 2 decimals
        ldlN = Math.round(ldlN * 100) / 100;
      }

      // Compute H/L flags based on reference ranges
      function computeFlag(val, min, max) {
        if (val === null || val === undefined) return '';
        if (typeof min === 'number' && !isNaN(min) && val < min) return 'L';
        if (typeof max === 'number' && !isNaN(max) && val > max) return 'H';
        return '';
      }

      const cholFlag = computeFlag(cholN, 0, 200);
      const tgFlag = computeFlag(tgN, 60, 150);
      const hdlFlag = computeFlag(hdlN, 35, 80);
      const ldlFlag = computeFlag(ldlN, 66, 178);

      // Prepare display values (string) but keep numeric for flags if needed
      const display = (v) => (v === null || v === undefined ? '' : String(v));

      resultsObj = {
        cholesterol: display(cholesterol || ''),
        cholesterol_numeric: cholN,
        cholesterol_flag: cholFlag,
        tg: display(tg || ''),
        tg_numeric: tgN,
        tg_flag: tgFlag,
        hdl: display(hdl || ''),
        hdl_numeric: hdlN,
        hdl_flag: hdlFlag,
        ldl: (ldl !== undefined && ldl !== null && String(ldl).trim() !== '') ? String(ldl) : (ldlN !== null ? String(ldlN) : ''),
        ldl_numeric: ldlN,
        ldl_flag: ldlFlag,
        note: (note || '').trim()
      };
    } else if (/urinalysis/i.test(test.testType)) {
      const { color, appearance, specificGravity, ph, protein, glucose, ketones, bilirubin, blood, nitrite, leukocyte,
        urobilinogen, rbc, wbc, epithelial, mucus, amorphous, bacteria, casts, others, note } = req.body;
      resultsObj = {
        color: (color || '').trim(),
        appearance: (appearance || '').trim(),
        specificGravity: (specificGravity || '').trim(),
        ph: (ph || '').trim(),
        protein: (protein || '').trim(),
        glucose: (glucose || '').trim(),
        ketones: (ketones || '').trim(),
        bilirubin: (bilirubin || '').trim(),
        blood: (blood || '').trim(),
        nitrite: (nitrite || '').trim(),
        leukocyte: (leukocyte || '').trim(),
        urobilinogen: (urobilinogen || '').trim(),
        rbc: (rbc || '').trim(),
        wbc: (wbc || '').trim(),
        epithelial: (epithelial || '').trim(),
        mucus: (mucus || '').trim(),
        amorphous: (amorphous || '').trim(),
        bacteria: (bacteria || '').trim(),
        casts: (casts || '').trim(),
        others: (others || '').trim(),
        note: (note || '').trim()
      };
    } else if (/hemato|hematology|cbc/i.test(test.testType)) {
      const { rbc, hemoglobin, hematocrit, mcv, mch, mchc, wbc, neutrophils, lymphocyte, monocyte, eosinophils, basophils, platelets } = req.body;
      resultsObj = {
        rbc: (rbc || '').trim(),
        hemoglobin: (hemoglobin || '').trim(),
        hematocrit: (hematocrit || '').trim(),
        mcv: (mcv || '').trim(),
        mch: (mch || '').trim(),
        mchc: (mchc || '').trim(),
        wbc: (wbc || '').trim(),
        neutrophils: (neutrophils || '').trim(),
        lymphocyte: (lymphocyte || '').trim(),
        monocyte: (monocyte || '').trim(),
        eosinophils: (eosinophils || '').trim(),
        basophils: (basophils || '').trim(),
        platelets: (platelets || '').trim()
      };
    } else if (/(blood\s*typing|blood-typing|bloodtyping)/i.test(test.testType)) {
      const { specimen, result } = req.body;
      resultsObj = {
        specimen: (specimen || '').trim(),
        result: (result || '').trim()
      };
    } else if (/serol|serology/i.test(test.testType)) {
      // Serology: allow multiple test/result rows submitted as arrays
      const names = req.body.testName;
      const values = req.body.testResult;
      const entries = [];
      if (Array.isArray(names)) {
        for (let i = 0; i < names.length; i++) {
          const n = (names[i] || '').trim();
          const v = Array.isArray(values) ? (values[i] || '').trim() : (values || '').trim();
          if (n || v) entries.push({ test: n, result: v });
        }
      } else if (names || values) {
        entries.push({ test: (names || '').trim(), result: (values || '').trim() });
      }
      resultsObj = { entries };
    } else if (/thyroid|thyroid\s*panel|thyroid-panel/i.test(test.testType)) {
      const { tsh, ft4, ft3 } = req.body;
      resultsObj = {
        tsh: (tsh || '').trim(),
        ft4: (ft4 || '').trim(),
        ft3: (ft3 || '').trim()
      };
    } else if (/dengue/i.test(test.testType)) {
      const { ns1, igm, igg } = req.body;
      resultsObj = {
        ns1: (ns1 || '').trim(),
        igm: (igm || '').trim(),
        igg: (igg || '').trim()
      };
    } else if (/(hba1c|hb\s*a1c|hb-a1c|hba\s*1c)/i.test(test.testType)) {
      // Single-analyte HbA1c
      const raw = (req.body.hba1c || '').toString().trim();
      function toNum(v){ if (v===undefined||v===null) return null; const s=String(v).trim(); if(s==='') return null; const n=parseFloat(s.replace(/[^0-9.+-eE]/g,'')); return isNaN(n)?null:n }
      function parseRange(ref){ if(!ref) return null; const m=String(ref).match(/([0-9]+(?:\.[0-9]+)?)\s*[\-–—]\s*([0-9]+(?:\.[0-9]+)?)/); if(m) return {min:parseFloat(m[1]), max:parseFloat(m[2]), display:m[1]+'-'+m[2]}; const m2=String(ref).match(/([0-9]+(?:\.[0-9]+)?)/); if(m2) return {min:parseFloat(m2[1]), max:NaN, display:m2[1]}; return null }
      function flagNum(n,min,max){ if(n===null) return ''; if(typeof min==='number' && !isNaN(min) && n<min) return 'L'; if(typeof max==='number' && !isNaN(max) && n>max) return 'H'; return '' }
      const num = toNum(raw);
      const refRaw = (req.body.hba1c_ref || req.body.reference || '').toString().trim();
      const ref = parseRange(refRaw) || {min:4.00, max:6.50, display:'4.00-6.50'};
      resultsObj = {};
      resultsObj.hba1c = raw;
      resultsObj.hba1c_numeric = num;
      resultsObj.hba1c_flag = (req.body.hba1c_flag || flagNum(num, ref.min, ref.max));
      resultsObj.hba1c_ref = ref.display || '';
    } else if (/(electrolyte|electrolytes|sodium|potassium|chloride)/i.test(test.testType)) {
      // Standalone electrolytes entry: sodium, potassium, chloride
      const sRaw = (req.body.sodium || req.body.na || '').toString().trim();
      const kRaw = (req.body.potassium || req.body.k || '').toString().trim();
      const clRaw = (req.body.chloride || req.body.cl || '').toString().trim();
      const sRefRaw = (req.body.sodium_ref || req.body.na_ref || '').toString().trim();
      const kRefRaw = (req.body.potassium_ref || req.body.k_ref || '').toString().trim();
      const clRefRaw = (req.body.chloride_ref || req.body.cl_ref || '').toString().trim();

      function toNum(v){ if (v===undefined||v===null) return null; const s=String(v).trim(); if(s==='') return null; const n=parseFloat(s.replace(/[^0-9.+-eE]/g,'')); return isNaN(n)?null:n }
      function parseRange(ref){ if(!ref) return null; const m=String(ref).match(/([0-9]+(?:\.[0-9]+)?)\s*[\-–—]\s*([0-9]+(?:\.[0-9]+)?)/); if(m) return {min:parseFloat(m[1]), max:parseFloat(m[2]), display:m[1]+'-'+m[2]}; const m2=String(ref).match(/([0-9]+(?:\.[0-9]+)?)/); if(m2) return {min:parseFloat(m2[1]), max:NaN, display:m2[1]}; return null }
      function flagNum(n,min,max){ if(n===null) return ''; if(typeof min==='number' && !isNaN(min) && n<min) return 'L'; if(typeof max==='number' && !isNaN(max) && n>max) return 'H'; return '' }

      const defaults = { sodium:{min:135,max:145,display:'135-145'}, potassium:{min:3.5,max:5.1,display:'3.5-5.1'}, chloride:{min:98,max:107,display:'98-107'} };

      const sNum = toNum(sRaw);
      const kNum = toNum(kRaw);
      const clNum = toNum(clRaw);

      const sRef = parseRange(sRefRaw) || defaults.sodium;
      const kRef = parseRange(kRefRaw) || defaults.potassium;
      const clRef = parseRange(clRefRaw) || defaults.chloride;

      resultsObj = {};
      if (sRaw || sNum !== null) {
        resultsObj.sodium = sRaw || (sNum!==null?String(sNum):'');
        resultsObj.sodium_numeric = sNum;
        resultsObj.sodium_flag = (req.body.sodium_flag || flagNum(sNum, sRef.min, sRef.max));
        resultsObj.sodium_ref = sRef.display || '';
      }
      if (kRaw || kNum !== null) {
        resultsObj.potassium = kRaw || (kNum!==null?String(kNum):'');
        resultsObj.potassium_numeric = kNum;
        resultsObj.potassium_flag = (req.body.potassium_flag || flagNum(kNum, kRef.min, kRef.max));
        resultsObj.potassium_ref = kRef.display || '';
      }
      if (clRaw || clNum !== null) {
        resultsObj.chloride = clRaw || (clNum!==null?String(clNum):'');
        resultsObj.chloride_numeric = clNum;
        resultsObj.chloride_flag = (req.body.chloride_flag || flagNum(clNum, clRef.min, clRef.max));
        resultsObj.chloride_ref = clRef.display || '';
      }
    } else if (/(blood sugar|blood-sugar|sugar|fbs|rbs|1st hour|2nd hour)/i.test(test.testType)) {
      // Standalone blood sugar entry: fbs, rbs, firstHour, secondHour
      const fbsRaw = (req.body.fbs || '').toString().trim();
      const rbsRaw = (req.body.rbs || '').toString().trim();
      const firstRaw = (req.body.firstHour || req.body['1stHour'] || req.body['1st hour'] || '').toString().trim();
      const secondRaw = (req.body.secondHour || req.body['2ndHour'] || req.body['2nd hour'] || '').toString().trim();
      const fbsRefRaw = (req.body.fbs_ref || req.body.fbsRef || '').toString().trim();
      const rbsRefRaw = (req.body.rbs_ref || req.body.rbsRef || '').toString().trim();
      const firstRefRaw = (req.body.firstHour_ref || req.body.firstHourRef || '').toString().trim();
      const secondRefRaw = (req.body.secondHour_ref || req.body.secondHourRef || '').toString().trim();

      function toNum(v){ if (v===undefined||v===null) return null; const s=String(v).trim(); if(s==='') return null; const n=parseFloat(s.replace(/[^0-9.+-eE]/g,'')); return isNaN(n)?null:n }
      function parseRange(ref){ if(!ref) return null; const m=String(ref).match(/([0-9]+(?:\.[0-9]+)?)\s*[\-–—]\s*([0-9]+(?:\.[0-9]+)?)/); if(m) return {min:parseFloat(m[1]), max:parseFloat(m[2]), display:m[1]+'-'+m[2]}; const m2=String(ref).match(/([0-9]+(?:\.[0-9]+)?)/); if(m2) return {min:parseFloat(m2[1]), max:NaN, display:m2[1]}; return null }
      function flagNum(n,min,max){ if(n===null) return ''; if(typeof min==='number' && !isNaN(min) && n<min) return 'L'; if(typeof max==='number' && !isNaN(max) && n>max) return 'H'; return '' }

      const defaults = { fbs:{min:70,max:110,display:'70-110'}, rbs:{min:80,max:130,display:'80-130'}, firstHour:{min:90,max:140,display:'90-140'}, secondHour:{min:80,max:120,display:'80-120'} };

      const fbsNum = toNum(fbsRaw);
      const rbsNum = toNum(rbsRaw);
      const firstNum = toNum(firstRaw);
      const secondNum = toNum(secondRaw);

      const fbsRef = parseRange(fbsRefRaw) || defaults.fbs;
      const rbsRef = parseRange(rbsRefRaw) || defaults.rbs;
      const firstRef = parseRange(firstRefRaw) || defaults.firstHour;
      const secondRef = parseRange(secondRefRaw) || defaults.secondHour;

      resultsObj = {};
      if (fbsRaw || fbsNum !== null) {
        resultsObj.fbs = fbsRaw || (fbsNum!==null?String(fbsNum):'');
        resultsObj.fbs_numeric = fbsNum;
        resultsObj.fbs_flag = (req.body.fbs_flag || flagNum(fbsNum, fbsRef.min, fbsRef.max));
        resultsObj.fbs_ref = fbsRef.display || '';
      }
      if (rbsRaw || rbsNum !== null) {
        resultsObj.rbs = rbsRaw || (rbsNum!==null?String(rbsNum):'');
        resultsObj.rbs_numeric = rbsNum;
        resultsObj.rbs_flag = (req.body.rbs_flag || flagNum(rbsNum, rbsRef.min, rbsRef.max));
        resultsObj.rbs_ref = rbsRef.display || '';
      }
      if (firstRaw || firstNum !== null) {
        resultsObj.firstHour = firstRaw || (firstNum!==null?String(firstNum):'');
        resultsObj.firstHour_numeric = firstNum;
        resultsObj.firstHour_flag = (req.body.firstHour_flag || flagNum(firstNum, firstRef.min, firstRef.max));
        resultsObj.firstHour_ref = firstRef.display || '';
      }
      if (secondRaw || secondNum !== null) {
        resultsObj.secondHour = secondRaw || (secondNum!==null?String(secondNum):'');
        resultsObj.secondHour_numeric = secondNum;
        resultsObj.secondHour_flag = (req.body.secondHour_flag || flagNum(secondNum, secondRef.min, secondRef.max));
        resultsObj.secondHour_ref = secondRef.display || '';
      }
    } else if (/(bun|creatinine|bun[\s\/-]?crea|bun\/?crea)/i.test(test.testType)) {
      // Standalone BUN / Creatinine variant (result-only). Only save fields present and compute numeric + flags.
      const creatRaw = (req.body.creatinine || req.body.crea || '').toString().trim();
      const bunRaw = (req.body.bun || '').toString().trim();

      function toNum(v){ if (v===undefined||v===null) return null; const s=String(v).trim(); if(s==='') return null; const n=parseFloat(s.replace(/[^0-9.+-eE]/g,'')); return isNaN(n)?null:n }
      function flagNum(n,min,max){ if(n===null) return ''; if(typeof min==='number' && !isNaN(min) && n<min) return 'L'; if(typeof max==='number' && !isNaN(max) && n>max) return 'H'; return '' }

      const creatNum = toNum(creatRaw);
      const bunNum = toNum(bunRaw);

      resultsObj = {};
      if (creatRaw || creatNum !== null) {
        resultsObj.creatinine = creatRaw || (creatNum!==null?String(creatNum):'');
        resultsObj.creatinine_numeric = creatNum;
        resultsObj.creatinine_flag = (req.body.creatinine_flag || flagNum(creatNum, 0.5, 1.0));
        resultsObj.creatinine_ref = '0.50-1.00';
      }
      if (bunRaw || bunNum !== null) {
        resultsObj.bun = bunRaw || (bunNum!==null?String(bunNum):'');
        resultsObj.bun_numeric = bunNum;
        resultsObj.bun_flag = (req.body.bun_flag || flagNum(bunNum, 4.67, 23.36));
        resultsObj.bun_ref = '4.67-23.36';
      }
      // optional note
      resultsObj.note = (req.body.note || '').trim();

    } else if (/(albumin|alb)/i.test(test.testType)) {
      // Simple ALB entry: single analyte with optional reference
      const albRaw = (req.body.alb || req.body.ALB || '').toString().trim();
      function toNum(v){ if (v===undefined||v===null) return null; const s=String(v).trim(); if(s==='') return null; const n=parseFloat(s.replace(/[^0-9.+-eE]/g,'')); return isNaN(n)?null:n }
      function parseRange(ref){ if(!ref) return null; const m=String(ref).match(/([0-9]+(?:\.[0-9]+)?)\s*[\-–—]\s*([0-9]+(?:\.[0-9]+)?)/); if(m) return {min:parseFloat(m[1]), max:parseFloat(m[2]), display:m[1]+'-'+m[2]}; const m2=String(ref).match(/([0-9]+(?:\.[0-9]+)?)/); if(m2) return {min:parseFloat(m2[1]), max:NaN, display:m2[1]}; return null }
      function flagNum(n,min,max){ if(n===null) return ''; if(typeof min==='number' && !isNaN(min) && n<min) return 'L'; if(typeof max==='number' && !isNaN(max) && n>max) return 'H'; return '' }

      const albNum = toNum(albRaw);
      const albRefRaw = (req.body.alb_ref || req.body.albRef || req.body.reference || '').toString().trim();
      const albRef = parseRange(albRefRaw) || {min:3.00, max:6.00, display:'3.00-6.00'};
      resultsObj = {};
      if (albRaw || albNum !== null) {
        resultsObj.alb = albRaw || (albNum!==null?String(albNum):'');
        resultsObj.alb_numeric = albNum;
        resultsObj.alb_flag = (req.body.alb_flag || flagNum(albNum, albRef.min, albRef.max));
        resultsObj.alb_ref = albRef.display || '';
      }
      // optional note
      resultsObj.note = (req.body.note || '').trim();

    } else if (/(x-?ray|xray|radiograph)/i.test(test.testType)) {
      // X-Ray: save case number, short examination, and rich-text paragraphs
      const caseNumber = (req.body.caseNumber || '').toString().trim();
      const examination = (req.body.examination || '').toString().trim();
      const paragraphsRaw = (req.body.paragraphs || '').toString();
      const fontSize = (req.body.paragraphsFontSize || '').toString().trim();
      const fontFamily = (req.body.paragraphsFontFamily || '').toString().trim();

      // If user submitted raw text without HTML tags, convert newlines to paragraphs
      let paragraphs = paragraphsRaw.trim();
      const hasHtmlTag = /<\/?[a-z][\s\S]*>/i.test(paragraphs);
      if (!hasHtmlTag && paragraphs.length) {
        // Split on double newlines for paragraphs, single newlines to <br>
        const paras = paragraphs.split(/\r?\n\r?\n/).map(p => p.trim()).filter(Boolean).map(p => '<p>' + p.replace(/\r?\n/g, '<br>') + '</p>');
        paragraphs = paras.join('\n');
      }

      resultsObj = {
        paragraphs: paragraphs || ''
      };

      // Also store caseNumber and examination inside results as fallback
      if (caseNumber) resultsObj.caseNumber = caseNumber;
      if (examination) resultsObj.examination = examination;

      if (fontSize) resultsObj.paragraphs_font_size = fontSize;
      if (fontFamily) resultsObj.paragraphs_font_family = fontFamily;

      if (caseNumber) topUpdates.caseNumber = caseNumber;
      if (examination) topUpdates.examination = examination;

    } else if (/(blood(\s*|-)chemistry|blood\s*chem)/i.test(test.testType)) {

    } else if (/(ecg|electrocardio|electrocardiogram)/i.test(test.testType)) {
      // ECG: paragraph findings + single reading physician
      const paragraphsRaw = (req.body.paragraphs || '').toString();
      const fontSize = (req.body.paragraphsFontSize || '').toString().trim();
      const fontFamily = (req.body.paragraphsFontFamily || '').toString().trim();

      let paragraphs = paragraphsRaw.trim();
      const hasHtmlTagEcg = /<\/?[a-z][\s\S]*>/i.test(paragraphs);
      if (!hasHtmlTagEcg && paragraphs.length) {
        const paras = paragraphs.split(/\r?\n\r?\n/).map(p => p.trim()).filter(Boolean).map(p => '<p>' + p.replace(/\r?\n/g, '<br>') + '</p>');
        paragraphs = paras.join('\n');
      }

      resultsObj = {
        paragraphs: paragraphs || ''
      };

      if (fontSize) resultsObj.paragraphs_font_size = fontSize;
      if (fontFamily) resultsObj.paragraphs_font_family = fontFamily;

      // Reading physician
      resultsObj.doctorName = (req.body.doctorName || '').trim();
      resultsObj.doctorLicense = (req.body.doctorLicense || '').trim();
      // Prefer custom designation if provided (doctorDesignationOther)
      const doctorDesignationOther = (req.body.doctorDesignationOther || '').toString().trim();
      resultsObj.doctorDesignation = doctorDesignationOther ? doctorDesignationOther : (req.body.doctorDesignation || '').trim();

      // ECG results stored above (paragraphs + doctor info)
    } else if (/\b(?:pt|prothrombin|pt-aptt|ptaptt)\b/i.test(test.testType)) {
      const { pt_control, pt_patient, pt_activity, pt_inr, aptt_patient } = req.body;
      resultsObj = {
        prothrombin: {
          control: (pt_control || '').trim(),
          patient: (pt_patient || '').trim(),
          activity: (pt_activity || '').trim(),
          inr: (pt_inr || '').trim()
        },
        aptt: {
          patient: (aptt_patient || '').trim()
        }
      };
    } else if (/pregnan|pregnancy|pregnancy\s*test/i.test(test.testType)) {
      const { sample, result } = req.body;
      resultsObj = {
        sample: (sample || '').trim(),
        result: (result || '').trim()
      };
    } else if (/(ultrasound[-\s]?biophysical|biophysical)/i.test(test.testType)) {
      // Biophysical ultrasound parsing
      const bpd_size = (req.body.bpd_size || '').toString().trim();
      const bpd_label = (req.body.bpd_label || '').toString().trim();
      const hc_size = (req.body.hc_size || '').toString().trim();
      const hc_label = (req.body.hc_label || '').toString().trim();
      const ac_size = (req.body.ac_size || '').toString().trim();
      const ac_label = (req.body.ac_label || '').toString().trim();
      const fl_size = (req.body.fl_size || '').toString().trim();
      const fl_label = (req.body.fl_label || '').toString().trim();

      // extra biometry rows
      const labelsRaw = req.body['biometry_label[]'] || req.body.biometry_label || req.body.biometry_label;
      const sizesRaw = req.body['biometry_size[]'] || req.body.biometry_size || req.body.biometry_size;
      let biometry = [];
      if (Array.isArray(labelsRaw) || Array.isArray(sizesRaw)) {
        const labels = Array.isArray(labelsRaw) ? labelsRaw : (labelsRaw ? [labelsRaw] : []);
        const sizes = Array.isArray(sizesRaw) ? sizesRaw : (sizesRaw ? [sizesRaw] : []);
        const max = Math.max(labels.length, sizes.length);
        for (let i = 0; i < max; i++) {
          const lbl = labels[i] !== undefined ? String(labels[i]).trim() : '';
          const sz = sizes[i] !== undefined ? String(sizes[i]).trim() : '';
          if (lbl || sz) biometry.push({ label: lbl, size: sz });
        }
      }

      const number_of_fetus = (req.body.number_of_fetus || '').toString().trim();
      const average_ultrasound_age = (req.body.average_ultrasound_age || '').toString().trim();
      const presentation = (req.body.presentation || '').toString().trim();
      const edc_by_ultrasound_raw = (req.body.edc_by_ultrasound || '').toString().trim();
      let edc_by_ultrasound = '';
      if (edc_by_ultrasound_raw) {
        const d = new Date(edc_by_ultrasound_raw);
        if (!isNaN(d.getTime())) edc_by_ultrasound = d.toISOString(); else edc_by_ultrasound = edc_by_ultrasound_raw;
      }
      const efw = (req.body.efw || '').toString().trim();
      const fetal_heart_rate = (req.body.fetal_heart_rate || '').toString().trim();
      const placental_location = (req.body.placental_location || '').toString().trim();
      const maturity = (req.body.maturity || '').toString().trim();
      const amniotic_fluid = (req.body.amniotic_fluid || '').toString().trim();
      const gender = (req.body.gender || '').toString().trim();
      const fetal_tone = (req.body.fetal_tone || '').toString().trim();
      const fetal_movement = (req.body.fetal_movement || '').toString().trim();
      const fetal_breathing = (req.body.fetal_breathing || '').toString().trim();
      const afi = (req.body.afi || '').toString().trim();
      const bps = (req.body.bps || '').toString().trim();
      const estimated_date_of_delivery_raw = (req.body.estimated_date_of_delivery || req.body.estimatedDateOfDelivery || '').toString().trim();
      let estimated_date_of_delivery = '';
      if (estimated_date_of_delivery_raw) {
        const d2 = new Date(estimated_date_of_delivery_raw);
        if (!isNaN(d2.getTime())) estimated_date_of_delivery = d2.toISOString(); else estimated_date_of_delivery = estimated_date_of_delivery_raw;
      }

      const impression = (req.body.impression || '').toString().trim();
      const doctorName = (req.body.pathName || req.body.doctorName || '').toString().trim();
      const doctorLicense = (req.body.pathLicense || req.body.doctorLicense || '').toString().trim();
      const doctorDesignation = (req.body.doctorDesignation || '').toString().trim();

      resultsObj = {
        bpd_size, bpd_label,
        hc_size, hc_label,
        ac_size, ac_label,
        fl_size, fl_label,
        biometry,
        number_of_fetus,
        average_ultrasound_age,
        presentation,
        edc_by_ultrasound,
        efw,
        fetal_heart_rate,
        placental_location,
        maturity,
        amniotic_fluid,
        gender,
        fetal_tone,
        fetal_movement,
        fetal_breathing,
        afi,
        bps,
        estimated_date_of_delivery,
        impression,
        doctorName,
        doctorLicense,
        doctorDesignation
      };

      // store editable section title
      resultsObj.section_title = (req.body.section_title || req.body.sectionTitle || (test && test.results && test.results.section_title) || 'BIOPHYSICAL ULTRASOUND').toString().trim();

    } else if (/(static:)?(ultrasound[-_\s]?(transvaginal|pelvic)(\.ejs)?|transvaginal|pelvic)/i.test(test.testType)) {
      // Transvaginal ultrasound: structured fields per checklist
      const gestational_sac_length = (req.body.gestational_sac_length || req.body.gestationalSacLength || '').toString().trim();
      const gestational_sac_age = (req.body.gestational_sac_age || req.body.gestationalSacAge || '').toString().trim();
      const crl_length = (req.body.crl_length || req.body.crlLength || '').toString().trim();
      const crl_age = (req.body.crl_age || req.body.crlAge || '').toString().trim();
      // Support multiple comment entries: arrays `comment_sign[]` and `comment_text[]`
      const commentSigns = req.body['comment_sign[]'] || req.body.comment_sign || req.body.comment_signs || req.body.comment_sign;
      const commentTexts = req.body['comment_text[]'] || req.body.comment_text || req.body.comment_texts || req.body.comment_text;
      let commentEntries = [];
      if (Array.isArray(commentSigns) || Array.isArray(commentTexts)) {
        const signs = Array.isArray(commentSigns) ? commentSigns : (commentSigns ? [commentSigns] : []);
        const texts = Array.isArray(commentTexts) ? commentTexts : (commentTexts ? [commentTexts] : []);
        const max = Math.max(signs.length, texts.length);
        for (let i = 0; i < max; i++) {
          const s = signs[i] !== undefined ? String(signs[i]).trim() : '-';
          const t = texts[i] !== undefined ? String(texts[i]).trim() : '';
          if (t || s) commentEntries.push({ sign: (s === '+' ? '+' : '-'), text: t });
        }
      } else if (req.body.comment_yolk || req.body.yolkSac || req.body.comment_hemorrhage || req.body.hemorrhage) {
        if (req.body.comment_yolk || req.body.yolkSac) commentEntries.push({ sign: '-', text: (req.body.comment_yolk || req.body.yolkSac).toString().trim() });
        if (req.body.comment_hemorrhage || req.body.hemorrhage) commentEntries.push({ sign: '-', text: (req.body.comment_hemorrhage || req.body.hemorrhage).toString().trim() });
      } else {
        // nothing submitted; keep empty array
        commentEntries = [];
      }
      const average_ultrasound_age = (req.body.average_ultrasound_age || req.body.averageUltrasoundAge || '').toString().trim();
      const fetal_heart_rate = (req.body.fetal_heart_rate || req.body.fetalHeartRate || '').toString().trim();
      const expected_date_of_delivery_raw = (req.body.expected_date_of_delivery || req.body.expectedDateOfDelivery || '').toString().trim();
      let expected_date_of_delivery = '';
      if (expected_date_of_delivery_raw) {
        const d = new Date(expected_date_of_delivery_raw);
        if (!isNaN(d.getTime())) expected_date_of_delivery = d.toISOString(); else expected_date_of_delivery = expected_date_of_delivery_raw;
      }
      const other = (req.body.other || '').toString().trim();
      const impression = (req.body.impression || '').toString().trim();
      const doctorName = (req.body.pathName || req.body.doctorName || '').toString().trim();
      const doctorLicense = (req.body.pathLicense || req.body.doctorLicense || '').toString().trim();
      const doctorDesignation = (req.body.doctorDesignation || '').toString().trim();

      resultsObj = {
        gestational_sac_length: gestational_sac_length,
        gestational_sac_age: gestational_sac_age,
        crl_length: crl_length,
        crl_age: crl_age,
        comment_entries: commentEntries,
        // back-compat: expose the first two entries as separate fields if present
        comment_yolk: (commentEntries && commentEntries[0] ? (commentEntries[0].text || '') : ''),
        comment_hemorrhage: (commentEntries && commentEntries[1] ? (commentEntries[1].text || '') : ''),
        average_ultrasound_age: average_ultrasound_age,
        fetal_heart_rate: fetal_heart_rate,
        expected_date_of_delivery: expected_date_of_delivery,
        other: other,
        impression: impression,
        doctorName: doctorName,
        doctorLicense: doctorLicense,
        doctorDesignation: doctorDesignation
      };
      // store editable section title when provided (or keep existing/default)
      resultsObj.section_title = (req.body.section_title || req.body.sectionTitle || (test && test.results && test.results.section_title) || (/(transvaginal)/i.test(test.testType) ? 'TRANSVAGINAL ULTRASOUND' : 'PELVIC ULTRASOUND')).toString().trim();
    } else if (/(?:1st|first|2nd|second|3rd|third|trimester|ultrasound[-_\s]?trimester|trimester[-_\s]?obstetrics)/i.test(test.testType)) {
      // 1st Trimester Obstetrics - unified single/twin parsing
      const isTwinRaw = req.body.isTwin;
      const isTwin = (isTwinRaw === 'on' || isTwinRaw === 'true' || isTwinRaw === true || String(isTwinRaw).toLowerCase() === 'on');

      function parseCommentArray(signsRaw, textsRaw, fallbackKey1, fallbackKey2) {
        let entries = [];
        if (Array.isArray(signsRaw) || Array.isArray(textsRaw)) {
          const signs = Array.isArray(signsRaw) ? signsRaw : (signsRaw ? [signsRaw] : []);
          const texts = Array.isArray(textsRaw) ? textsRaw : (textsRaw ? [textsRaw] : []);
          const max = Math.max(signs.length, texts.length);
          for (let i = 0; i < max; i++) {
            const s = signs[i] !== undefined ? String(signs[i]).trim() : '-';
            const t = texts[i] !== undefined ? String(texts[i]).trim() : '';
            if (t || s) entries.push({ sign: (s === '+' ? '+' : '-'), text: t });
          }
        } else if (req.body[fallbackKey1] || req.body[fallbackKey2]) {
          if (req.body[fallbackKey1]) entries.push({ sign: '-', text: String(req.body[fallbackKey1]).trim() });
          if (req.body[fallbackKey2]) entries.push({ sign: '-', text: String(req.body[fallbackKey2]).trim() });
        }
        return entries;
      }

      if (isTwin) {
        const gA_len = (req.body.gestational_sac_length_A || req.body.gestational_sac_length || '').toString().trim();
        const gA_age = (req.body.gestational_sac_age_A || req.body.gestational_sac_age || '').toString().trim();
        const crlA_len = (req.body.crl_length_A || req.body.crl_length || '').toString().trim();
        const crlA_age = (req.body.crl_age_A || req.body.crl_age || '').toString().trim();

        const gB_len = (req.body.gestational_sac_length_B || '').toString().trim();
        const gB_age = (req.body.gestational_sac_age_B || '').toString().trim();
        const crlB_len = (req.body.crl_length_B || '').toString().trim();
        const crlB_age = (req.body.crl_age_B || '').toString().trim();

        const commentEntriesA = parseCommentArray(req.body['comment_sign_A[]'] || req.body.comment_sign_A, req.body['comment_text_A[]'] || req.body.comment_text_A, 'comment_yolk', 'yolkSac');
        const commentEntriesB = parseCommentArray(req.body['comment_sign_B[]'] || req.body.comment_sign_B, req.body['comment_text_B[]'] || req.body.comment_text_B, 'comment_hemorrhage', 'hemorrhage');

        // combined fallback for older forms
        let combinedComments = [];
        if (Array.isArray(req.body['comment_sign[]']) || Array.isArray(req.body['comment_text[]'])) {
          const signs = Array.isArray(req.body['comment_sign[]']) ? req.body['comment_sign[]'] : (req.body['comment_sign[]'] ? [req.body['comment_sign[]']] : []);
          const texts = Array.isArray(req.body['comment_text[]']) ? req.body['comment_text[]'] : (req.body['comment_text[]'] ? [req.body['comment_text[]']] : []);
          const max = Math.max(signs.length, texts.length);
          for (let i = 0; i < max; i++) {
            const s = signs[i] !== undefined ? String(signs[i]).trim() : '-';
            const t = texts[i] !== undefined ? String(texts[i]).trim() : '';
            if (t || s) combinedComments.push({ sign: (s === '+' ? '+' : '-'), text: t });
          }
        }

        const avgA = (req.body.average_ultrasound_age_A || req.body.average_ultrasound_age || '').toString().trim();
        const fhrA = (req.body.fetal_heart_rate_A || req.body.fetal_heart_rate || '').toString().trim();
        const avgB = (req.body.average_ultrasound_age_B || '').toString().trim();
        const fhrB = (req.body.fetal_heart_rate_B || '').toString().trim();

        const expected_date_of_delivery_raw = (req.body.expected_date_of_delivery || req.body.expectedDateOfDelivery || '').toString().trim();
        let expected_date_of_delivery = '';
        if (expected_date_of_delivery_raw) {
          const d = new Date(expected_date_of_delivery_raw);
          if (!isNaN(d.getTime())) expected_date_of_delivery = d.toISOString(); else expected_date_of_delivery = expected_date_of_delivery_raw;
        }

        const other = (req.body.other || '').toString().trim();
        const impression = (req.body.impression || '').toString().trim();
        const doctorName = (req.body.pathName || req.body.doctorName || '').toString().trim();
        const doctorLicense = (req.body.pathLicense || req.body.doctorLicense || '').toString().trim();
        const doctorDesignation = (req.body.doctorDesignation || req.body.doctorDesignation || '').toString().trim();

        resultsObj = {
          isTwin: true,
          gestational_sac_length_A: gA_len,
          gestational_sac_age_A: gA_age,
          crl_length_A: crlA_len,
          crl_age_A: crlA_age,
          gestational_sac_length_B: gB_len,
          gestational_sac_age_B: gB_age,
          crl_length_B: crlB_len,
          crl_age_B: crlB_age,
          comment_entries_A: commentEntriesA,
          comment_entries_B: commentEntriesB,
          // keep legacy combined comments if present
          comment_entries: (commentEntriesA && commentEntriesA.length) || (commentEntriesB && commentEntriesB.length) ? (commentEntriesA.concat(commentEntriesB)) : (combinedComments.length ? combinedComments : []),
          average_ultrasound_age_A: avgA,
          fetal_heart_rate_A: fhrA,
          average_ultrasound_age_B: avgB,
          fetal_heart_rate_B: fhrB,
          expected_date_of_delivery: expected_date_of_delivery,
          other: other,
          impression: impression,
          doctorName: doctorName,
          doctorLicense: doctorLicense,
          doctorDesignation: doctorDesignation
        };
        // allow editable section title for trimester obstetrics
        resultsObj.section_title = (req.body.section_title || req.body.sectionTitle || (test && test.results && test.results.section_title) || 'TRIMESTER OBSTETRICS').toString().trim();
      } else {
        // single fetus parsing (back-compat and new single form)
        const g_len = (req.body.gestational_sac_length || req.body.gestationalSacLength || '').toString().trim();
        const g_age = (req.body.gestational_sac_age || req.body.gestationalSacAge || '').toString().trim();
        const crl_len = (req.body.crl_length || req.body.crlLength || '').toString().trim();
        const crl_age = (req.body.crl_age || req.body.crlAge || '').toString().trim();

        const commentSigns = req.body['comment_sign[]'] || req.body.comment_sign || req.body.comment_signs || req.body.comment_sign;
        const commentTexts = req.body['comment_text[]'] || req.body.comment_text || req.body.comment_texts || req.body.comment_text;
        let commentEntries = [];
        if (Array.isArray(commentSigns) || Array.isArray(commentTexts)) {
          const signs = Array.isArray(commentSigns) ? commentSigns : (commentSigns ? [commentSigns] : []);
          const texts = Array.isArray(commentTexts) ? commentTexts : (commentTexts ? [commentTexts] : []);
          const max = Math.max(signs.length, texts.length);
          for (let i = 0; i < max; i++) {
            const s = signs[i] !== undefined ? String(signs[i]).trim() : '-';
            const t = texts[i] !== undefined ? String(texts[i]).trim() : '';
            if (t || s) commentEntries.push({ sign: (s === '+' ? '+' : '-'), text: t });
          }
        } else if (req.body.comment_yolk || req.body.yolkSac || req.body.comment_hemorrhage || req.body.hemorrhage) {
          if (req.body.comment_yolk || req.body.yolkSac) commentEntries.push({ sign: '-', text: (req.body.comment_yolk || req.body.yolkSac).toString().trim() });
          if (req.body.comment_hemorrhage || req.body.hemorrhage) commentEntries.push({ sign: '-', text: (req.body.comment_hemorrhage || req.body.hemorrhage).toString().trim() });
        }

        const average_ultrasound_age = (req.body.average_ultrasound_age || req.body.averageUltrasoundAge || '').toString().trim();
        const fetal_heart_rate = (req.body.fetal_heart_rate || req.body.fetalHeartRate || '').toString().trim();
        const expected_date_of_delivery_raw = (req.body.expected_date_of_delivery || req.body.expectedDateOfDelivery || '').toString().trim();
        let expected_date_of_delivery = '';
        if (expected_date_of_delivery_raw) {
          const d = new Date(expected_date_of_delivery_raw);
          if (!isNaN(d.getTime())) expected_date_of_delivery = d.toISOString(); else expected_date_of_delivery = expected_date_of_delivery_raw;
        }
        const other = (req.body.other || '').toString().trim();
        const impression = (req.body.impression || '').toString().trim();
        const doctorName = (req.body.pathName || req.body.doctorName || '').toString().trim();
        const doctorLicense = (req.body.pathLicense || req.body.doctorLicense || '').toString().trim();
        const doctorDesignation = (req.body.doctorDesignation || req.body.doctorDesignation || '').toString().trim();

        resultsObj = {
          isTwin: false,
          gestational_sac_length: g_len,
          gestational_sac_age: g_age,
          crl_length: crl_len,
          crl_age: crl_age,
          comment_entries: commentEntries,
          // back-compat
          comment_yolk: (commentEntries && commentEntries[0] ? (commentEntries[0].text || '') : ''),
          comment_hemorrhage: (commentEntries && commentEntries[1] ? (commentEntries[1].text || '') : ''),
          average_ultrasound_age: average_ultrasound_age,
          fetal_heart_rate: fetal_heart_rate,
          expected_date_of_delivery: expected_date_of_delivery,
          other: other,
          impression: impression,
          doctorName: doctorName,
          doctorLicense: doctorLicense,
          doctorDesignation: doctorDesignation
        };
        // allow editable section title for trimester obstetrics
        resultsObj.section_title = (req.body.section_title || req.body.sectionTitle || (test && test.results && test.results.section_title) || 'TRIMESTER OBSTETRICS').toString().trim();
      }
    } else if (/(ultrasound[-\s]?abd[-\s]?kubp[-\s]?hbt)/i.test(test.testType)) {
      // Ultrasound ABD / KUBP / HBT variant: accept examination select, findings paragraphs, and impression
      const examination = (req.body.examination || '').toString().trim();
      const paragraphs = (req.body.paragraphs || req.body.findings || req.body.result || '').toString().trim();
      const impression = (req.body.impression || '').toString().trim();
      const doctorName = (req.body.pathName || req.body.doctorName || '').toString().trim();
      const doctorLicense = (req.body.pathLicense || req.body.doctorLicense || '').toString().trim();
      const doctorDesignation = (req.body.doctorDesignation || '').toString().trim();
      resultsObj = {
        examination: examination,
        section_title: (req.body.section_title || req.body.sectionTitle || '').toString().trim() || 'ULTRASOUND RESULT',
        paragraphs: paragraphs,
        impression: impression,
        doctorName: doctorName,
        doctorLicense: doctorLicense,
        doctorDesignation: doctorDesignation,
        paragraphs_font_family: req.body.paragraphsFontFamily || req.body.paragraphs_font_family,
        paragraphs_font_size: req.body.paragraphsFontSize || req.body.paragraphs_font_size
      };
    } else if (/(echo|echocardiograph|echocardiography|2d\s*echo|2decho)/i.test(test.testType)) {
      // Echocardiography (2D): findings paragraphs, color flow study, conclusion and signature
      const paragraphs = (req.body.paragraphs || req.body.findings || req.body.result || '').toString().trim();
      const color_flow = (req.body.color_flow || req.body.color_flow_study || '').toString().trim();
      const conclusion = (req.body.conclusion || req.body.impression || req.body.conclusion_text || '').toString().trim();
      const doctorName = (req.body.pathName || req.body.doctorName || '').toString().trim();
      const doctorLicense = (req.body.pathLicense || req.body.doctorLicense || '').toString().trim();
      const doctorDesignation = (req.body.doctorDesignation || '').toString().trim() || 'Cardiologist';

      // weight/height/bsa handling
      const weightRaw = (req.body.weight || '').toString().trim();
      const heightRaw = (req.body.height || '').toString().trim();
      const bsaRaw = (req.body.bsa || '').toString().trim();

      // parse numeric values when possible
      function toNum(v){ if (v===undefined||v===null) return null; const s=String(v).trim(); if(s==='') return null; const n=parseFloat(s.replace(/[^0-9.+-eE]/g,'')); return isNaN(n)?null:n }
      const weightNum = toNum(weightRaw);
      const heightNum = toNum(heightRaw);
      let bsaVal = (bsaRaw && bsaRaw !== '') ? bsaRaw : '';

      // If bsa not provided but weight and height are numeric, compute Mosteller BSA
      if ((!bsaVal || bsaVal==='') && weightNum !== null && heightNum !== null) {
        const bsaCalc = Math.sqrt((heightNum * weightNum) / 3600);
        if (!isNaN(bsaCalc)) bsaVal = (Math.round(bsaCalc * 100) / 100).toFixed(2);
      }

      resultsObj = {
        paragraphs: paragraphs,
        color_flow: color_flow,
        conclusion: conclusion,
        doctorName: doctorName,
        doctorLicense: doctorLicense,
        doctorDesignation: doctorDesignation,
        weight: weightRaw || (weightNum!==null?String(weightNum):''),
        weight_numeric: weightNum,
        height: heightRaw || (heightNum!==null?String(heightNum):''),
        height_numeric: heightNum,
        bsa: bsaVal,
        section_title: (req.body.section_title || req.body.sectionTitle || (test && test.results && test.results.section_title) || 'ECHOCARDIOGRAPHY REPORT').toString().trim(),
        paragraphs_font_family: req.body.paragraphsFontFamily || req.body.paragraphs_font_family,
        paragraphs_font_size: req.body.paragraphsFontSize || req.body.paragraphs_font_size
      };
      // Diagnostic log for echocardiography saving
      console.log(`ECHOCARDIO POST for test ${req.params.id} - weight,height,bsa:`, { weightRaw, heightRaw, bsaVal });
    }

    // allow storing performer name/license directly on results for printing
    resultsObj.performedByName = (mtName || '').trim();
    resultsObj.performedByLicense = (mtLicense || '').trim();
    resultsObj.requestedByName = (pathName || '').trim();
    resultsObj.requestedByLicense = (pathLicense || '').trim();
    // optional validator (second medtech) fields
    resultsObj.validatedByName = (req.body.validatedByName || '').trim();
    resultsObj.validatedByLicense = (req.body.validatedByLicense || '').trim();

    // debug logging removed

    // Determine completedAt from optional timeReleased input (use test date's date part)
    let completedAt = new Date();
    if (req.body.timeReleased && String(req.body.timeReleased).trim()) {
      try {
        const baseDate = test.testDate ? new Date(test.testDate) : new Date();
        const dateStr = baseDate.toISOString().slice(0,10); // YYYY-MM-DD
        const timeStr = String(req.body.timeReleased).trim(); // expected HH:MM
        const iso = dateStr + 'T' + (timeStr.length === 5 ? (timeStr + ':00') : timeStr);
        const parsed = new Date(iso);
        if (!isNaN(parsed.getTime())) completedAt = parsed;
      } catch (e) {
        // fallback to now
        completedAt = new Date();
      }
    }

    const updateData = {
      results: resultsObj,
      status: 'Completed',
      completedAt: completedAt,
      ...topUpdates
    };

    // set performedBy only if explicitly provided (performer management is handled separately)
    if (performedBy) {
      updateData.performedBy = performedBy;
    }

    const updated = await Test.findByIdAndUpdate(req.params.id, updateData, { new: true });
    try {
      console.log('Saved results for test', req.params.id, 'results keys:', updated && updated.results ? Object.keys(updated.results) : null);
    } catch (e) {}

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
      'esr.ejs',
      'ct-bt.ejs',
      'urinalysis.ejs',
      'blood-typing.ejs',
      'pregnancy-test.ejs',
      'dengue-duo.ejs',
      'blood-chemistry.ejs',
      'blood-chemistry-sgpt-sgot.ejs',
      'blood-chemistry-bun-crea.ejs',
      'blood-chemistry-electrolytes.ejs',
      'blood-chemistry-hba1c.ejs',
      'blood-chemistry-albumin.ejs',
      'pt-aptt.ejs',
      'xray.ejs',
      'ecg.ejs',
      'hematology.ejs',
      'serology.ejs',
      'ultrasound-abd-kubp-hbt.ejs',
      'echocardiography-2d.ejs'
      , 'ultrasound-transvaginal.ejs'
      , 'ultrasound-biophysical.ejs'
      , 'ultrasound-1st-trimester-obstetrics.ejs'
      , 'drugtest.ejs'
      , 'ultrasound-pelvic.ejs'
    ];
    const files = fs.readdirSync(resultsDir).filter(f => allowed.includes(f));
    const staticTemplates = files.map(f => {
      if (f === 'drugtest.ejs') return { name: 'Drug Test', testType: 'drugtest' };
      if (f === 'blood-chemistry-bun-crea.ejs') {
        return { name: 'Blood Chemistry - BUN/Crea', testType: 'BUN/Creat' };
      }
      if (f === 'blood-chemistry-sgpt-sgot.ejs') {
        return { name: 'Blood Chemistry - SGPT/SGOT', testType: 'Blood Chemistry - SGPT/SGOT' };
      }
      const name = f.replace('.ejs', '').replace(/-/g, ' ');
      return { name: name.charAt(0).toUpperCase() + name.slice(1), testType: name };
    });
    templates = templates.concat(staticTemplates);
    try {
      const exists2 = templates.some(t => (t.testType || '').toLowerCase() === 'ultrasound-trimester-obstetrics');
      if (!exists2) {
        templates.push({ name: 'Ultrasound - Trimester Obstetrics', testType: 'ultrasound-trimester-obstetrics' });
      }
    } catch (e) {}
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