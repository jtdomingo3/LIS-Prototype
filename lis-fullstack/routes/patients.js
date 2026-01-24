const express = require('express');
const router = express.Router();
const Patient = require('../models/Patient');
const User = require('../models/User');
const { requireAuth, canAccessPatient } = require('../middleware/auth');
const fs = require('fs');
const pathMod = require('path');
const Jimp = require('jimp');

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
      finalRequiredAreas = AREA_ORDER.filter(a => mappedAreas.has(a));
      const others = Array.from(mappedAreas).filter(a => !AREA_ORDER.includes(a));
      finalRequiredAreas = finalRequiredAreas.concat(others);
    } else {
      // preserve doctor's selection(s) and For Send Out if present
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
          // include requestedTests from saved patient so areas/amounts are preserved
          requestedTests: patient.requestedTests || [],
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

    // After saving, attempt server-side thermal print of patient receipt
    try {
      const fs = require('fs');
      const os = require('os');
      const pathMod = require('path');
      const { spawnSync } = require('child_process');

      // Build simple receipt spec for thermal_test.js JSON input
      // If For Send Out is in requiredAreas, after payment, set status to For Referral (not Completed/Pending)
      // This logic should be handled in the payment/queueing logic, not here, but here's a note:
      // TODO: In your payment/queueing logic, after payment, if requiredAreas includes 'For Send Out', set test.status = 'For Referral'
      const now = new Date();
      const currentDate = now.toISOString().replace('T', ' ').slice(0, 19);
      const fullName = `${patient.firstName || ''} ${patient.lastName || ''}`.trim();
      const age = patient.ageManual || patient.age || 'N/A';
      const tests = Array.isArray(patient.requestedTests) ? patient.requestedTests : [];
      const total = tests.reduce((s, t) => s + (Number((t && (t.amount || t.amount === 0) ? t.amount : 0) || 0)), 0);

      function makeTestLines() {
        let lines = [];
        const printedLabels = new Set();
        // Print all tests first
        if (tests.length) {
          tests.forEach(t => {
            const label = (t && (t.label || t.key)) || String(t || '');
            const amt = (t && (t.amount || t.amount === 0)) ? Number(t.amount) : 0;
            const remarks = t && t.remarks ? ` (${sanitizeText(t.remarks)})` : '';
            const isSendOut = label.toLowerCase().includes('send out');
            const isDoctorCheckup = label.toLowerCase().includes("doctor's check-up");
            let line = `- ${label}`;
            if (amt || isSendOut || isDoctorCheckup) {
              line += ` - PHP ${amt.toFixed(2)}`;
            }
            if (remarks) {
              line += remarks;
            }
            lines.push({ type: 'text', text: line });
            printedLabels.add(label.toLowerCase());
          });
        }
        // Always print Doctor's Check-up, Send Out, and Referral/Referal from requiredAreas, avoid duplicates
        if (Array.isArray(patient.requiredAreas)) {
          patient.requiredAreas.forEach(area => {
            const areaLabel = String(area);
            const areaLabelLower = areaLabel.toLowerCase();
            if ((areaLabelLower.includes("doctor's check-up") || areaLabelLower.includes('send out') || areaLabelLower.includes('referral') || areaLabelLower.includes('referal')) && !printedLabels.has(areaLabelLower)) {
              // Try to get remarks and amount from req.body if available
              let remarks = '';
              let amt = 0;
              if (req.body) {
                const slug = areaLabelLower.replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
                if (req.body['remarks_' + slug]) remarks = ` (${sanitizeText(req.body['remarks_' + slug])})`;
                if (req.body['amount_' + slug]) amt = parseFloat(String(req.body['amount_' + slug]).replace(/,/g,'')) || 0;
              }
              let line = `- ${areaLabel}`;
              if (amt) line += ` - PHP ${amt.toFixed(2)}`;
              if (remarks) line += remarks;
              lines.push({ type: 'text', text: line });
              printedLabels.add(areaLabelLower);
            }
          });
        }
        if (!lines.length) return [{ type: 'text', text: '- (No tests specified)' }];
        return lines;
      }

      // sanitize text to avoid characters that CP437 cannot encode (which appear as '?')
      function sanitizeText(s) {
        if (s == null) return '';
        let out = String(s);
        // replace common symbols with ASCII-safe alternatives
        out = out.replace(/₱/g, 'PHP ');
        out = out.replace(/[–—−]/g, '-');
        out = out.replace(/•/g, '-');
        // remove any remaining non-ASCII characters to avoid '?' in output
        out = out.replace(/[^\u0000-\u007f]/g, '');
        // collapse multiple spaces
        out = out.replace(/\s+/g, ' ').trim();
        return out;
      }

      // Attempt to rasterize small logo + patient code into one image to print beside ID
      let rasterHex = null;
      try {
        const logoPath = pathMod.join(__dirname, '..', 'assets', 'gezyne-logo-NOTEXT.png');
        if (fs.existsSync(logoPath)) {
          const logoImg = await Jimp.read(logoPath);
          // Target width for printer (pixels). Use 384 as common thermal width.
          const targetWidth = 384;
          // Scale logo to reasonable height
          const maxLogoHeight = 48;
          logoImg.scaleToFit(80, maxLogoHeight);
          const logoW = logoImg.bitmap.width;
          const logoH = logoImg.bitmap.height;

          // Prepare canvas and print patient code text on the right side.
          // Extract last 5-digit sequence and render it much larger for visibility.
          const codeText = (patient.patientCode || patient.patientId || '').toString();
          const last5Match = codeText.match(/(\d{5})$/);
          const last5 = last5Match ? last5Match[1] : null;
          const prefix = last5 ? codeText.slice(0, codeText.length - last5.length).trim() : codeText;

          // Load fonts: small for prefix, big for the 5-digit number
          const smallFont = await Jimp.loadFont(Jimp.FONT_SANS_16_BLACK);
          // Use the largest available built-in sans font for emphasis
          const bigFont = await Jimp.loadFont(Jimp.FONT_SANS_64_BLACK);

          // Measure heights to decide canvas height
          const bigText = last5 || codeText;
          const bigTextWidth = Jimp.measureText(bigFont, bigText);
          const bigTextHeight = Jimp.measureTextHeight(bigFont, bigText, bigTextWidth);
          const smallTextWidth = prefix ? Jimp.measureText(smallFont, prefix) : 0;
          const smallTextHeight = prefix ? Jimp.measureTextHeight(smallFont, prefix, smallTextWidth) : 0;

          const padding = 6;
          const gap = 6; // space between elements

          // Small middle text to place between logo and patient code
          const middleText = sanitizeText('GEZYNE CLINICAL LABORATORY');
          const midTextWidth = Jimp.measureText(smallFont, middleText);
          const midTextHeight = Jimp.measureTextHeight(smallFont, middleText, midTextWidth);

          // Layout: logo centered at the top, small text centered below it, then patient code centered
          const canvasHeight = padding + logoH + gap + midTextHeight + gap + bigTextHeight + padding;
          const canvas = new Jimp(targetWidth, canvasHeight, 0xffffffff);

          // center logo at top
          const logoX = Math.floor((targetWidth - logoW) / 2);
          const logoY = padding;
          canvas.composite(logoImg, logoX, logoY);

          // center middle text under logo
          const midX = Math.floor((targetWidth - midTextWidth) / 2);
          const midY = padding + logoH + gap;
          canvas.print(smallFont, midX, midY, middleText);

          // Center the emphasized patient code under the middle text
          const bigX = Math.floor((targetWidth - bigTextWidth) / 2);
          const bigY = midY + midTextHeight + gap;
          canvas.print(bigFont, bigX, bigY, bigText);

          // Convert canvas to monochrome bitmap and pack into ESC/POS raster format
          const width = canvas.bitmap.width;
          const height = canvas.bitmap.height;
          const widthBytes = Math.ceil(width / 8);
          const data = Buffer.alloc(widthBytes * height);
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const idx = (y * width + x) * 4;
              const r = canvas.bitmap.data[idx + 0];
              const g = canvas.bitmap.data[idx + 1];
              const b = canvas.bitmap.data[idx + 2];
              const gray = 0.299 * r + 0.587 * g + 0.114 * b;
              const bit = gray < 128 ? 1 : 0;
              if (bit) {
                const byteIndex = y * widthBytes + Math.floor(x / 8);
                const bitIndex = 7 - (x % 8);
                data[byteIndex] |= (1 << bitIndex);
              }
            }
          }
          const xL = widthBytes & 0xff;
          const xH = (widthBytes >> 8) & 0xff;
          const yL = height & 0xff;
          const yH = (height >> 8) & 0xff;
          const header = Buffer.from([0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH]);
          const rasterBuf = Buffer.concat([header, data]);
          rasterHex = rasterBuf.toString('hex');
        }
      } catch (imgErr) {
        console.warn('Logo rasterization failed:', imgErr);
        rasterHex = null;
      }

      // Compose one copy
      const copySpec = [];
      // insert rasterized logo+code if available, otherwise fallback to printing
      // the last 5 digits (matching the patients list) in a large font
      if (rasterHex) {
        copySpec.push({ type: 'raw', hex: rasterHex });
      } else {
        const codeStr = String(patient.patientCode || patient.patientId || '');
        const last5Match = codeStr.match(/(\d{5})$/);
        const last5 = last5Match ? last5Match[1] : codeStr;
        copySpec.push({ type: 'text', align: 'center', size: 'double', bold: true, text: sanitizeText(last5) });
      }
      copySpec.push({ type: 'text', align: 'center', text: sanitizeText(currentDate) });
      copySpec.push({ type: 'feed', count: 1 });
      copySpec.push({ type: 'text', text: sanitizeText('Name: ' + fullName) });
      copySpec.push({ type: 'text', text: sanitizeText('Age: ' + age) });
      copySpec.push({ type: 'feed', count: 1 });
      copySpec.push({ type: 'text', size: 'normal', text: sanitizeText('Laboratory Request:') });
      copySpec.push({ type: 'feed', count: 0 });
        const sanitizedTestLines = makeTestLines().map(l => ({ type: 'text', size: 'normal', text: sanitizeText(l.text) }));
      copySpec.push.apply(copySpec, sanitizedTestLines);
      copySpec.push({ type: 'feed', count: 1 });
      copySpec.push({ type: 'text', text: sanitizeText('Amount: PHP ' + total.toFixed(2)) });
      copySpec.push({ type: 'feed', count: 2 });
      copySpec.push({ type: 'feed', count: 1 });
      copySpec.push({ type: 'hr', align: 'center', count: 28 });
      copySpec.push({ type: 'feed', count: 0 });
      copySpec.push({ type: 'text', text: sanitizeText('Validated Amount Received by') });
      copySpec.push({ type: 'feed', count: 2 });
      copySpec.push({ type: 'text', align: 'center', size: 'normal', text: sanitizeText('This is not a valid OR') });
      copySpec.push({ type: 'text', align: 'center', size: 'normal', text: sanitizeText('Please keep this ticket') });
      copySpec.push({ type: 'text', align: 'center', size: 'normal', text: sanitizeText('until you are finished') });
      copySpec.push({ type: 'cut' });

      // TEMPORARY: Print only one thermal paper copy
      // const spacer = [{ type: 'feed', count: 4 }];
      // const spec = copySpec.concat(spacer, copySpec);
      const spec = copySpec; // Only one copy for now

      // Save a copy of the spec to workspace logs for inspection (helps trace unexpected content)
      try {
        const inspectPath = pathMod.join(__dirname, '..', 'logs', 'last_patient_spec.json');
        fs.writeFileSync(inspectPath, JSON.stringify(spec, null, 2), { encoding: 'utf8' });
      } catch (e) {
        console.warn('Failed to write last_patient_spec.json for inspection:', e);
      }

      // Write spec to temp JSON file
      const tmp = os.tmpdir();
      const specPath = pathMod.join(tmp, `patient_receipt_${Date.now()}.json`);
      fs.writeFileSync(specPath, JSON.stringify(spec), { encoding: 'utf8' });

      const scriptPath = pathMod.join(__dirname, '..', 'scripts', 'thermal_test.js');
      const args = [scriptPath, '--json', specPath];
      const ENV_PRINTER = process.env.PRINTER_NAME || process.env.PRINTER || null;
      if (ENV_PRINTER) args.push('--printer', ENV_PRINTER);

      const proc = spawnSync(process.execPath, args, { cwd: pathMod.join(__dirname, '..'), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
      try { fs.unlinkSync(specPath); } catch (e) {}

      // Log print result for debugging
      try {
        const entry = {
          action: 'patient_receipt_print',
          patientId: patient.id || patient._id || null,
          patientCode: patient.patientCode || patient.patientId || null,
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

      if (proc.error || proc.status !== 0) {
        console.error('Patient print failed:', proc.error || proc.stderr || proc.stdout || proc.status);
        // keep user flow working, but warn
        req.flash('warning_msg', 'Patient saved but printing failed (see server logs)');
      } else {
        req.flash('success_msg', 'Patient saved and receipt printed');
      }
    } catch (printErr) {
      console.error('Error during patient print attempt:', printErr);
      req.flash('warning_msg', 'Patient saved but printing error occurred');
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