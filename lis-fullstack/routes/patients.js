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
    // Fallback: prefer reading the file-based DB `data.json` directly when available
    try {
      const testsCountByPatient = {};
      // try file DB first
      const dbPath = pathMod.join(__dirname, '..', 'data.json');
      let fileTests = null;
      try {
        const raw = fs.readFileSync(dbPath, 'utf8');
        const parsed = JSON.parse(raw || '{}');
        if (Array.isArray(parsed.tests)) fileTests = parsed.tests;
      } catch (e) {
        fileTests = null;
      }

      if (Array.isArray(fileTests)) {
        fileTests.forEach(t => { if (t && t.patient) testsCountByPatient[String(t.patient)] = (testsCountByPatient[String(t.patient)] || 0) + 1; });
      } else {
        // fallback to model API
        const allTests = await Test.find({});
        if (Array.isArray(allTests)) {
          allTests.forEach(t => { if (t && t.patient) testsCountByPatient[String(t.patient)] = (testsCountByPatient[String(t.patient)] || 0) + 1; });
        }
      }

      patients = patients.map(p => {
        const plain = (p && typeof p.toJSON === 'function') ? p.toJSON() : p;
        return Object.assign({}, plain, { hasTests: !!testsCountByPatient[String(plain.id)] });
      });
      console.log('DEBUG patients hasTests map:', testsCountByPatient);
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
    if (forSendOutSelected && !doctorSelections.includes('For Send Out')) {
      doctorSelections.push('For Send Out');
    }

    // If none of the selected tests map to a reception area, treat as awaiting-only
    const awaitingOnly = (selectedTests.length > 0) && mappedAreas.size === 0;

    // Build final requiredAreas: collect all unique mapped areas in the same
    // order reception expects so that downstream queuing/forwarding logic
    // will process them in the intended order.
    const AREA_ORDER = ['Extraction Area', 'Drug Test', 'Ultrasound', '2D Echo', 'X-ray', 'ECG', 'For Send Out'];
    let finalRequiredAreas = [];
    if (!awaitingOnly && mappedAreas.size > 0) {
      // Start with AREA_ORDER matches to preserve ordering
      finalRequiredAreas = AREA_ORDER.filter(a => mappedAreas.has(a));
      const others = Array.from(mappedAreas).filter(a => !AREA_ORDER.includes(a));
      // Merge: AREA_ORDER matches -> others -> doctor selections (avoid duplicates)
      const merged = finalRequiredAreas.slice();
      others.forEach(o => { if (!merged.includes(o)) merged.push(o); });
      (doctorSelections || []).forEach(d => { if (d && !merged.includes(d)) merged.push(d); });
      // Ensure For Send Out is present when selected
      if (forSendOutSelected && !merged.includes('For Send Out')) merged.push('For Send Out');
      finalRequiredAreas = merged;
    } else {
      // preserve doctor's selection(s) and For Send Out if present
      finalRequiredAreas = Array.isArray(doctorSelections) ? doctorSelections.slice() : [];
      if (forSendOutSelected && !finalRequiredAreas.includes('For Send Out')) finalRequiredAreas.push('For Send Out');
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
      company,
      philhealthConsent,
      philhealthId,
      requiredAreas: finalRequiredAreas,
      // preserve selected tests for extraction/medtech visibility (detailed objects)
      requestedTests: requestedTestsDetailed,
      createdBy: req.session.user.id
    });

    await patient.save();

    // Patient saved — tests will be assigned from patient management. Printing is manual.
    req.flash('success_msg', `Patient ${firstName} ${lastName} added successfully!`);
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

// POST /patients/thermal-print - trigger a thermal printer test
router.post('/thermal-print', requireAuth, canAccessPatient, (req, res) => {
  try {
    const { spawnSync } = require('child_process');
    const pathMod = require('path');
    const scriptPath = pathMod.join(__dirname, '..', 'scripts', 'thermal_test.js');

    // Build args: call Node with the script and --receipt
    const args = [scriptPath, '--receipt'];
    if (req.body && req.body.printer) args.push('--printer', req.body.printer);

    const proc = spawnSync(process.execPath, args, { cwd: pathMod.join(__dirname, '..'), encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
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

    // build a simple receipt spec
    const now = new Date();
    const currentDate = now.toISOString().replace('T', ' ').slice(0, 19);
    const fullName = `${patient.firstName || ''} ${patient.lastName || ''}`.trim();
    const age = patient.ageManual || patient.age || 'N/A';
    const tests = Array.isArray(patient.requestedTests) ? patient.requestedTests : [];
    const total = tests.reduce((s, t) => s + (Number((t && (t.amount || t.amount === 0) ? t.amount : 0) || 0)), 0);

    const spec = [];
    spec.push({ type: 'text', align: 'center', size: 'double', bold: true, text: (patient.patientCode || patient.patientId || '') });
    spec.push({ type: 'text', align: 'center', text: currentDate });
    spec.push({ type: 'feed', count: 1 });
    spec.push({ type: 'text', text: 'Name: ' + fullName });
    spec.push({ type: 'text', text: 'Age: ' + age });
    spec.push({ type: 'feed', count: 1 });
    spec.push({ type: 'text', size: 'normal', text: 'Laboratory Request:' });
    if (tests.length) {
      tests.forEach(t => {
        const label = (t && (t.label || t.key)) || String(t || '');
        const amt = (t && (t.amount || t.amount === 0)) ? Number(t.amount) : 0;
        let line = `- ${label}`;
        if (amt) line += ` - PHP ${Number(amt).toFixed(2)}`;
        spec.push({ type: 'text', text: line });
      });
    } else {
      spec.push({ type: 'text', text: '- (No tests specified)' });
    }
    spec.push({ type: 'feed', count: 1 });
    spec.push({ type: 'text', text: 'Amount: PHP ' + Number(total || 0).toFixed(2) });
    spec.push({ type: 'feed', count: 4 });
    spec.push({ type: 'cut' });

    // write to temp and call thermal_test script
    const os = require('os');
    const tmp = os.tmpdir();
    const specPath = pathMod.join(tmp, `patient_receipt_${Date.now()}.json`);
    fs.writeFileSync(specPath, JSON.stringify(spec), { encoding: 'utf8' });

    const { spawnSync } = require('child_process');
    const scriptPath = pathMod.join(__dirname, '..', 'scripts', 'thermal_test.js');
    const args = [scriptPath, '--json', specPath];
    const ENV_PRINTER = process.env.PRINTER_NAME || process.env.PRINTER || null;
    if (ENV_PRINTER) args.push('--printer', ENV_PRINTER);

    const proc = spawnSync(process.execPath, args, { cwd: pathMod.join(__dirname, '..'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
    try { fs.unlinkSync(specPath); } catch (e) {}

    try { appendPrintLog(JSON.stringify({ action: 'patient_receipt_print_manual', patientId: patient.id, args, exitCode: proc.status || null, stderr: proc.stderr || null, stdout: proc.stdout || null })); } catch (e) {}

    if (proc.error || proc.status !== 0) return res.status(500).json({ success: false, error: proc.stderr || proc.stdout || String(proc.error) });
    return res.json({ success: true, output: proc.stdout });
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
    const { firstName, lastName, dateOfBirth, gender, phone, email, address, physician, company, philhealthConsent, philhealthId } = req.body;
    const ageManual = req.body.ageManual || req.body.age || null;
    const philhealthConsentBool = (philhealthConsent === 'on' || philhealthConsent === '1' || philhealthConsent === 'true');
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