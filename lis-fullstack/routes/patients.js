const express = require('express');
const router = express.Router();
const Patient = require('../models/Patient');
const User = require('../models/User');
const Test = require('../models/Test');
const { requireAuth, canAccessPatient } = require('../middleware/auth');
const fs = require('fs');
const pathMod = require('path');
const Jimp = require('jimp');
const bwipjs = require('bwip-js');
const sseEmitter = require('../lib/sseEmitter');

// Print logging helper
const PRINT_LOG_PATH = pathMod.join(__dirname, '..', 'logs', 'print.log');
function appendPrintLog(entry) {
  try {
    const ts = new Date().toISOString();
    const data = `[${ts}] ${entry}\n`;
    fs.appendFileSync(PRINT_LOG_PATH, data, { encoding: 'utf8' });
  } catch (e) {
    console.error('Failed to write print log:', e);
  }
}

// GET /patients - List all patients
router.get('/', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;

    const searchQuery = req.query.search || '';
    const philhealthFilter = req.query.philhealth || '';
    const companyFilter = req.query.company || '';
    const dateFilter = req.query.date || '';

    // Get all patients and filter/search
    let allPatients = await Patient.find({});

    // Compute system-wide patient stats across whole database
    let systemStats = { total: 0, female: 0, male: 0, philhealth: 0 };
    if (Array.isArray(allPatients)) {
      systemStats.total = allPatients.length;
      allPatients.forEach(p => {
        const g = String(p.gender || '').toLowerCase();
        if (g.startsWith('f')) systemStats.female++;
        else if (g.startsWith('m')) systemStats.male++;
        if (p.philhealthConsent) systemStats.philhealth++;
      });
    }

    // Available companies for the company filter
    const availableCompanies = Array.isArray(allPatients) ? Array.from(new Set(allPatients.map(p => (p.company || '').toString()).filter(Boolean))).sort() : [];

    // Apply search filter (name/id)
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      allPatients = allPatients.filter(patient =>
        (patient.firstName && patient.firstName.toLowerCase().includes(searchLower)) ||
        (patient.middleName && patient.middleName.toLowerCase().includes(searchLower)) ||
        (patient.lastName && patient.lastName.toLowerCase().includes(searchLower)) ||
        (patient.patientId && patient.patientId.toLowerCase().includes(searchLower))
      );
    }

    // PhilHealth filter (yes/no)
    if (philhealthFilter) {
      const wantPhil = String(philhealthFilter).toLowerCase() === 'yes';
      allPatients = allPatients.filter(p => {
        return wantPhil ? Boolean(p.philhealthConsent) : !Boolean(p.philhealthConsent);
      });
    }

    // Company filter (exact match from dropdown)
    if (companyFilter) {
      const compLower = String(companyFilter).toLowerCase();
      allPatients = allPatients.filter(p => (p.company || '').toString().toLowerCase().includes(compLower));
    }

    // Date filter (match createdAt date YYYY-MM-DD)
    if (dateFilter) {
      const df = String(dateFilter);
      allPatients = allPatients.filter(p => {
        const dt = p.testDate || p.createdAt || p.dateOfBirth || null;
        try {
          return dt ? new Date(dt).toISOString().slice(0,10) === df : false;
        } catch (e) { return false; }
      });
    }

    // Sort by creation date (newest first)
    if (Array.isArray(allPatients)) {
      allPatients.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    const totalPatients = allPatients.length;
    const totalPages = Math.ceil(totalPatients / limit);

    // Paginate
    let patients = allPatients.slice(skip, skip + limit);

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

    // Attach hasTests flag per patient so the view can decide which action button to show.
    // Compute tests count per patient
    try {
      const testsCountByPatient = {};
      const allTests = (global.db && typeof global.db.getTests === 'function')
        ? global.db.getTests()
        : await Test.find({});
      if (Array.isArray(allTests)) {
        allTests.forEach(t => { if (t && t.patient) testsCountByPatient[String(t.patient)] = (testsCountByPatient[String(t.patient)] || 0) + 1; });
      }

      patients = patients.map(p => {
        const plain = (p && typeof p.toJSON === 'function') ? p.toJSON() : p;
        return Object.assign({}, plain, { hasTests: !!testsCountByPatient[String(plain.id)] });
      });
    } catch (e) {
      console.warn('Failed to compute patient test flags:', e);
    }

    res.render('patients/index', {
      title: 'Patient Management',
      patients,
      currentPage: page,
      totalPages,
      hasPrevPage: page > 1,
      hasNextPage: page < totalPages,
      prevPage: page - 1,
      nextPage: page + 1,
      searchQuery,
      philhealthFilter,
      companyFilter,
      dateFilter,
      availableCompanies,
      systemStats
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
          'fecalysis.ejs','esr.ejs','fecal-occult-blood.ejs','urinalysis.ejs','ct-bt.ejs','blood-typing.ejs','pregnancy-test.ejs','dengue-duo.ejs','thyroid-panel.ejs','blood-chemistry.ejs','pt-aptt.ejs','xray.ejs','ecg.ejs','hematology.ejs','serology.ejs','echocardiography-2d.ejs','drugtest.ejs'
        ];
        try {
          const files = fs.readdirSync(resultsDir).filter(f => allowed.includes(f));
          const staticTemplates = files.map(f => {
            if (f === 'drugtest.ejs') return { name: 'Drug Test', testType: 'drugtest' };
            if (f === 'blood-chemistry-bun-crea.ejs') return { name: 'Blood Chemistry - BUN/Crea', testType: 'BUN/Creat' };
            if (f === 'blood-chemistry-sgpt-sgot.ejs') return { name: 'Blood Chemistry - SGPT/SGOT', testType: 'Blood Chemistry - SGPT/SGOT' };
            if (f === 'echocardiography-2d.ejs') return { name: 'Echocardiography - 2D', testType: 'echocardiography-2d' };
            const name = f.replace('.ejs', '').replace(/-/g, ' ');
            return { name: name.charAt(0).toUpperCase() + name.slice(1), testType: f.replace('.ejs','') };
          });
          staticTemplates.push({ name: 'Ultrasound', testType: 'Ultrasound' });
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
    const { firstName, middleName, lastName, dateOfBirth, gender, phone, email, address, physician } = req.body;
    const company = req.body.company || '';
    const philhealthConsent = req.body.philhealthConsent === 'on' || req.body.philhealthConsent === '1' || req.body.philhealthConsent === 'true';
    const philhealthId = req.body.philhealthId || '';
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

    // Validate required fields: only firstName, lastName and gender are required
    if (!firstName || !lastName || !gender) {
      req.flash('error_msg', 'Please fill required fields: First name, Last name and Gender');
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
    const patientCode = `GCL-${yyyy}${mm}${dayStr}-${String(seq).padStart(5, '0')}`;

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
    let forSendOutSelected = false;
    // Accept explicit "For Send Out" checkbox in the form (common name variants)
    if (req.body) {
      const v = req.body.forSendOut || req.body.for_send_out || req.body['for-send-out'] || req.body['forSendOut'];
      if (v === '1' || v === 'on' || v === 'true' || v === 'yes') {
        forSendOutSelected = true;
      }
    }
    for (const t of selectedTests) {
      const tLower = String(t).toLowerCase();
      if (tLower.includes('send out') || tLower.includes('for send out')) {
        forSendOutSelected = true;
      }
      const a = mapTestToArea(t);
      if (a) mappedAreas.add(a);
      const slug = tLower.replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
      const rawAmt = req.body['amount_' + slug];
      const amt = rawAmt ? parseFloat(String(rawAmt).replace(/,/g,'')) : 0;
      const lab = (a === 'X-ray') ? 'xray' : 'clinical';
      requestedTestsDetailed.push({ key: t, label: t, amount: isNaN(amt) ? 0 : amt, lab, area: a || null });
    }
    // Standardize: If For Send Out is selected, add to requiredAreas
    if (forSendOutSelected && !doctorSelections.includes('Sendout')) {
      // normalize to internal 'Sendout' label
      doctorSelections.push('Sendout');
    }

    // If none of the selected tests map to a reception area, treat as awaiting-only
    const awaitingOnly = (selectedTests.length > 0) && mappedAreas.size === 0;

    // Build final requiredAreas: collect all unique mapped areas in the same
    // order reception expects so that downstream queuing/forwarding logic
    // will process them in the intended order.
    const AREA_ORDER = ['Extraction Area', 'Drug Test', 'Ultrasound', '2D Echo', 'X-ray', 'ECG', 'Sendout'];
    let finalRequiredAreas = [];
    if (!awaitingOnly && mappedAreas.size > 0) {
      // Start with AREA_ORDER matches to preserve ordering
      finalRequiredAreas = AREA_ORDER.filter(a => mappedAreas.has(a));
      const others = Array.from(mappedAreas).filter(a => !AREA_ORDER.includes(a));
      // Merge: AREA_ORDER matches -> others -> doctor selections (avoid duplicates)
      const merged = finalRequiredAreas.slice();
      others.forEach(o => { if (!merged.includes(o)) merged.push(o); });
      (doctorSelections || []).forEach(d => { if (d && !merged.includes(d)) merged.push(d); });
      // Ensure Sendout is present when selected
      if (forSendOutSelected && !merged.includes('Sendout')) merged.push('Sendout');
      finalRequiredAreas = merged;
    } else {
      // preserve doctor's selection(s) and For Send Out if present
      finalRequiredAreas = Array.isArray(doctorSelections) ? doctorSelections.slice() : [];
      if (forSendOutSelected && !finalRequiredAreas.includes('Sendout')) finalRequiredAreas.push('Sendout');
    }

    const patient = new Patient({
      id: req.body.id || req.body._id || undefined,
      patientId,
      patientCode,
      firstName,
      middleName: middleName || '',
      lastName,
      dateOfBirth,
      ageManual,
      physician,
      gender,
      phone,
      email,
      address,
      company,
      philhealthConsent,
      philhealthId,
      requiredAreas: finalRequiredAreas,
      // preserve selected tests for extraction/medtech visibility (detailed objects)
      requestedTests: requestedTestsDetailed,
      client_id: (req.body && req.body.client_id) ? req.body.client_id : undefined,
      createdBy: req.session.user.id
    });

    await patient.save();

    // Emit SSE update so all connected clients receive a notification
    try {
      const msg = `New patient added: ${patient.firstName} ${patient.middleName ? (patient.middleName + ' ') : ''}${patient.lastName}` + (patient.patientId ? ` (ID: ${patient.patientId})` : '');
      sseEmitter.emit('update', { action: 'patient_created', patientId: patient.id, patientName: `${patient.firstName} ${patient.lastName}`, patientCode: patient.patientCode || null, patientIdLabel: patient.patientId || null, time: (new Date()).toISOString(), message: msg });
    } catch (e) { console.warn('SSE emit failed for patient_created', e); }

    // Patient saved — tests will be assigned from patient management. Printing is manual.
    req.flash('success_msg', `Patient ${firstName} ${middleName ? middleName + ' ' : ''}${lastName} added successfully!`);

    // If this request came from the standalone sync engine or explicit JSON API client,
    // return JSON including the created id and client_id so the client can map records deterministically.
    const isSyncClient = !!(req.headers['x-lis-sync-email'] || req.headers['x-lis-sync-hash'] || req.headers['x-lis-sync-replay']);
    const isExplicitJson = req.xhr || (req.headers['accept'] && req.headers['accept'].includes('application/json') && !req.headers['accept'].includes('text/html'));
    if (isSyncClient || isExplicitJson) {
      return res.json({ success: true, id: patient.id, client_id: patient.client_id || (req.body && req.body.client_id) || null, patientCode: patient.patientCode, patientId: patient.patientId });
    }

    // Stay on the new patient form so users can continue adding patients
    res.redirect('/patients/new');

  } catch (error) {
    console.error('Create patient error:', error);
    req.flash('error_msg', 'Error creating patient');
    res.render('patients/new', {
      title: 'Add New Patient',
      patient: req.body
    });
  }
});

// POST /patients/thermal-print - trigger a thermal printer test
router.post('/thermal-print', requireAuth, canAccessPatient, (req, res) => {
  try {
    const { spawnSync } = require('child_process');
    const pathMod = require('path');
    const fsMod = require('fs');
    const scriptPath = pathMod.join(__dirname, '..', 'scripts', 'thermal_test.js');
    if (!fsMod.existsSync(scriptPath)) {
      return res.status(404).json({ success: false, error: 'thermal_test.js not found' });
    }

    // Build args: call Node with the script and --receipt
    const args = [scriptPath, '--receipt'];
    if (req.body && req.body.printer) args.push('--printer', req.body.printer);

    const spawnEnv = Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1' });
    const proc = spawnSync(process.execPath, args, { cwd: pathMod.join(__dirname, '..'), encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, env: spawnEnv });
    // append log
    try {
      const entry = {
        action: 'thermal_test_manual',
        user: req.session && req.session.user ? req.session.user.id : null,
        args: args,
        exitCode: proc.status != null ? proc.status : null,
        error: proc.error ? String(proc.error) : null,
        stdout: proc.stdout || null,
        stderr: proc.stderr || null,
        timestamp: new Date().toISOString()
      };
      appendPrintLog(JSON.stringify(entry));
    } catch (logErr) {
      console.error('Failed to append print log:', logErr);
    }

    if (proc.error) {
      console.error('Thermal print spawn error:', proc.error);
      return res.status(500).json({ success: false, error: String(proc.error) });
    }
    if (proc.status !== 0) {
      console.error('Thermal print failed:', proc.stderr || proc.stdout || proc.status);
      return res.status(500).json({ success: false, error: proc.stderr || proc.stdout || ('Exit code: ' + proc.status) });
    }
    return res.json({ success: true, output: proc.stdout });
  } catch (e) {
    console.error('Thermal print handler error:', e);
    return res.status(500).json({ success: false, error: String(e) });
  }
});

// POST /patients/:id/print - print patient receipt on demand
router.post('/:id/print', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.id);
    if (!patient) return res.status(404).json({ success: false, error: 'Patient not found' });
    // Use the latest print helper to generate the revised receipt format
    const printHelper = require('../lib/printHelper');
    // Fetch patient's tests to include requested items in the receipt
    const Test = require('../models/Test');
    const tests = await Test.find({ patient: req.params.id });
    const result = await printHelper.printPatientReceipt(patient, tests);
    if (!result || !result.success) return res.status(500).json({ success: false, error: result && result.error ? result.error : 'Print failed' });
    return res.json({ success: true, output: result.output });
  } catch (e) {
    console.error('Patient print error:', e);
    return res.status(500).json({ success: false, error: String(e) });
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
    const { firstName, middleName, lastName, dateOfBirth, gender, phone, email, address, physician, company, philhealthConsent, philhealthId } = req.body;
    const ageManual = req.body.ageManual || req.body.age || null;
    const philhealthConsentBool = (philhealthConsent === 'on' || philhealthConsent === '1' || philhealthConsent === 'true');
    const requiredAreas = Array.isArray(req.body.requiredAreas)
      ? req.body.requiredAreas
      : req.body.requiredAreas ? [req.body.requiredAreas] : [];

    // Validate required fields: only firstName, lastName and gender are required
    if (!firstName || !lastName || !gender) {
      req.flash('error_msg', 'Please fill required fields: First name, Last name and Gender');
      return res.redirect(`/patients/${req.params.id}/edit`);
    }

    const patient = await Patient.findByIdAndUpdate(
      req.params.id,
      {
        firstName,
        middleName: middleName || '',
        lastName,
        dateOfBirth,
        ageManual,
        physician,
        gender,
        phone,
        email,
        address,
        requiredAreas,
        company: company || '',
        philhealthConsent: !!philhealthConsentBool,
        philhealthId: philhealthId || ''
      },
      { new: true }
    );

    if (!patient) {
      req.flash('error_msg', 'Patient not found');
      return res.redirect('/patients');
    }

    try {
      sseEmitter.emit('update', {
        action: 'patient_updated',
        patientId: patient.id,
        patientName: `${patient.firstName} ${patient.lastName}`,
        patientCode: patient.patientCode || null,
        patientIdLabel: patient.patientId || null,
        time: (new Date()).toISOString(),
        message: `Patient ${patient.firstName} ${patient.lastName} updated`
      });
    } catch (e) { console.warn('SSE emit failed for patient_updated', e); }

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
    const Test = require('../models/Test');
    
    const targetId = req.params.id;

    // Resolve patient by any identifier (id, _id, patientId, patientCode)
    let patient = await Patient.findById(targetId);
    if (!patient) patient = await Patient.findOne({ patientId: targetId });
    if (!patient) patient = await Patient.findOne({ patientCode: targetId });
    if (!patient) patient = await Patient.findOne({ id: targetId });

    const allTests = await Test.find();
    if (patient) {
      const patientTests = allTests.filter(t => t && (
        t.patient === patient.id || 
        t.patient === patient._id || 
        t.patient === patient.patientId || 
        t.patient === patient.patientCode ||
        t.patient === targetId
      ));
      for (const t of patientTests) {
        await Test.findByIdAndDelete(t.id);
      }
      await Patient.findByIdAndDelete(patient.id);
    } else {
      const patientTests = allTests.filter(t => t && t.patient === targetId);
      for (const t of patientTests) {
        await Test.findByIdAndDelete(t.id);
      }
      await Patient.findByIdAndDelete(targetId);
    }

    // Emit SSE event so all active client pages (and standalone sync) update immediately
    try {
      const pName = patient ? `${patient.firstName} ${patient.lastName}` : 'Patient';
      sseEmitter.emit('update', {
        action: 'patient_deleted',
        patientId: targetId,
        patientName: pName,
        time: (new Date()).toISOString(),
        message: `🗑️ Patient ${pName} deleted`
      });
    } catch (e) { console.warn('SSE emit failed for patient_deleted', e); }

    req.flash('success_msg', 'Patient and associated tests deleted successfully');
    res.redirect('/patients');

  } catch (error) {
    console.error('Delete patient error:', error);
    req.flash('error_msg', 'Error deleting patient');
    res.redirect('/patients');
  }
});

module.exports = router;