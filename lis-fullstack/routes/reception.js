const express = require('express');
const router = express.Router();
const Test = require('../models/Test');
const Patient = require('../models/Patient');
const User = require('../models/User');
const { requireAuth, canAccessPatient } = require('../middleware/auth');
// Use a shared SSE emitter so other modules can easily emit updates
const sseEmitter = require('../lib/sseEmitter');
const https = require('https');
const gtts = require('google-tts-api');

// Middleware that allows unauthenticated 'kiosk' access when ?kiosk=1 or APP_KIOSK=true
function allowKioskOrAuth(req, res, next) {
  const kioskQuery = req.query && (req.query.kiosk === '1' || String(req.query.kiosk).toLowerCase() === 'true');
  const kioskEnv = (process.env.APP_KIOSK === '1' || String(process.env.APP_KIOSK || '').toLowerCase() === 'true');
  const kiosk = kioskQuery || kioskEnv;
  if (kiosk) {
    req.isKiosk = true;
    return next();
  }
  // not kiosk -> require auth & patient access
  return requireAuth(req, res, function(err) {
    if (err) return next(err);
    return canAccessPatient(req, res, next);
  });
}

// Define the reception areas
const AREAS = [
  'Payment Area',
  'Extraction Area',
  'Drug Test',
  'Ultrasound',
  '2D Echo',
  'X-ray',
  'ECG',
  'Releasing of Result',
  "Doctor's Check-up - Dr. Lorenzo",
  "Doctor's Check-up - Dr. Arcilla"
];

// Simple in-memory advertisement text for kiosk marquee (editable from /reception)
let kioskAdText = '';

// Helper to map a test to the reception area it should appear in.
// Rules:
// - If test.status !== 'Completed', return the status as-is.
// - If status === 'Completed', only map to 'Releasing of Result' when results/encoding exist
//   (test.completedAt or non-empty test.results). Also, do NOT map Doctor's Check-up to Releasing.
function mapAreaForTest(test) {
  if (!test || !test.status) return test && test.status ? test.status : null;
  // Treat explicit 'Released' status as final Completed (do not map back to Releasing)
  if (test.status === 'Released') return 'Completed';
  if (test.status === 'Completed') {
    // If a test has been released (finalized), keep it as Completed and do not
    // map it back to the 'Releasing of Result' area.
    if (test.released) return 'Completed';
    const hasResults = Boolean(test.completedAt || (test.results && String(test.results).trim()));
    const isDoctorCheckup = test.testType === "Doctor's Check-up";
    const isRegistration = test.testType === 'Registration';
    // Only send to Releasing when results exist and it's not Doctor's Check-up or Registration
    if (hasResults && !isDoctorCheckup && !isRegistration) return 'Releasing of Result';
    return 'Completed';
  }
  return test.status;
}

// GET /reception - show areas and counts
router.get('/', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const allTestsRaw = await Test.find({});
    const allTests = Array.isArray(allTestsRaw)
      ? allTestsRaw.slice().sort((a, b) => {
          const aDate = new Date(a.testDate || a.createdAt || 0).getTime();
          const bDate = new Date(b.testDate || b.createdAt || 0).getTime();
          return aDate - bDate;
        })
      : [];

    // Only count tests that have an encoded patient (patient exists and has patientCode)
    // Use mapAreaForTest to decide which reception area a test should appear in
    const counts = AREAS.map(a => ({ name: a, count: 0 }));
    if (Array.isArray(allTests)) {
      for (const t of allTests) {
        const areaForTest = mapAreaForTest(t);
        if (!AREAS.includes(areaForTest)) continue;
        if (!t.patient) continue;
        const patient = await Patient.findById(t.patient);
        if (!patient || !patient.patientCode) continue;
        const idx = counts.findIndex(c => c.name === areaForTest);
        if (idx >= 0) counts[idx].count++;
      }
    }

    res.render('reception/index', {
      title: 'Reception',
      areas: counts,
      ad: kioskAdText
    });
  } catch (err) {
    console.error('Reception index error:', err);
    req.flash('error_msg', 'Error loading reception');
    res.redirect('/dashboard');
  }
});

// GET /reception/assigned - show assigned patient codes per area
router.get('/assigned', allowKioskOrAuth, async (req, res) => {
  try {
    console.log('GET /reception/assigned called', { user: req.session && req.session.user ? req.session.user.username : null, kiosk: !!req.query && (req.query.kiosk === '1' || String(req.query.kiosk).toLowerCase() === 'true') });
    // Diagnostic: show cookie header and session object to debug why user may be undefined
    try { console.log('GET /reception/assigned headers.cookie:', req.headers && req.headers.cookie ? req.headers.cookie : null); } catch (e) {}
    try { console.log('GET /reception/assigned session:', req.session ? JSON.stringify(Object.keys(req.session)) : null); } catch (e) { }
    const allTestsRaw = await Test.find({});
    const allTests = Array.isArray(allTestsRaw)
      ? allTestsRaw.slice().sort((a, b) => {
          const aDate = new Date(a.testDate || a.createdAt || 0).getTime();
          const bDate = new Date(b.testDate || b.createdAt || 0).getTime();
          return aDate - bDate;
        })
      : [];
    const areaAssignments = {};
    for (const area of AREAS) {
      areaAssignments[area] = [];
    }

    if (Array.isArray(allTests)) {
      for (const t of allTests) {
        if (!t.status) continue;
        const area = mapAreaForTest(t);
        if (!AREAS.includes(area)) continue;
        if (!t.patient) continue;
        const patient = await Patient.findById(t.patient);
        if (!patient || !patient.patientCode) continue;
        areaAssignments[area].push({ testId: t.testId, patientCode: patient.patientCode, name: `${patient.firstName} ${patient.lastName}`, assignedDoctor: t.assignedDoctorName || null });
      }
    }

    // Deduplicate assignments per area by patientCode so the same patient isn't shown multiple times
    Object.keys(areaAssignments).forEach(area => {
      const seen = new Set();
      areaAssignments[area] = areaAssignments[area].filter(a => {
        const code = a && a.patientCode ? String(a.patientCode) : null;
        if (!code) return false;
        if (seen.has(code)) return false;
        seen.add(code);
        return true;
      });
    });

  // Always redirect to kiosk mode - the kiosk view is now the only view for /assigned
  const kioskQuery = req.query && (req.query.kiosk === '1' || String(req.query.kiosk).toLowerCase() === 'true');
  const kioskEnv = (process.env.APP_KIOSK === '1' || String(process.env.APP_KIOSK || '').toLowerCase() === 'true');
  const kiosk = req.isKiosk || kioskQuery || kioskEnv;
  
    // If not kiosk param, redirect to kiosk version
    if (!kiosk) {
      return res.redirect('/reception/assigned?kiosk=1');
    }
    
    // Render kiosk view (fullscreen, no layout)
    res.render('reception/kiosk', {
      title: 'Patient Queue Display',
      areas: AREAS,
      assignments: areaAssignments,
      kiosk: true,
      layout: false
    });
  } catch (err) {
    console.error('Reception assigned error:', err);
    req.flash('error_msg', 'Error loading assignments');
    res.redirect('/reception');
  }
});

// GET /reception/assigned-events - Server-Sent Events endpoint for live updates
// This endpoint allows unauthenticated 'kiosk' connections when ?kiosk=1 or APP_KIOSK=true.
router.get('/assigned-events', (req, res) => {
  // allow kiosk connections without session
  const kioskQuery = req.query && (req.query.kiosk === '1' || String(req.query.kiosk).toLowerCase() === 'true');
  const kioskEnv = (process.env.APP_KIOSK === '1' || String(process.env.APP_KIOSK || '').toLowerCase() === 'true');
  const kiosk = kioskQuery || kioskEnv;

  // if not kiosk, require a valid authenticated session and appropriate role
  if (!kiosk) {
    if (!req.session || !req.session.user) {
      // not authenticated -> reject
      res.status(401).end();
      return;
    }
    const allowedRoles = ['Admin', 'Doctor', 'Technician'];
    if (!allowedRoles.includes(req.session.user.role)) {
      res.status(403).end();
      return;
    }
  }

  // Set headers for SSE
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  // Disable proxy buffering (nginx, etc.) and flush headers so the client sees the stream immediately
  try {
    res.set('X-Accel-Buffering', 'no');
  } catch (e) {}
  try { if (res.flushHeaders) res.flushHeaders(); } catch (e) {}
  // send an initial comment to establish the stream
  res.write(':ok\n\n');
  // suggest client retry interval (ms)
  try { res.write('retry: 5000\n\n'); } catch (e) { }

  // Send an initial data event so clients reliably receive an onmessage immediately
  try {
    const initPayload = { serverTime: (new Date()).toISOString(), init: true };
    res.write(`data: ${JSON.stringify(initPayload)}\n\n`);
  } catch (e) {}

  console.log('SSE client connected', kiosk ? '(kiosk)' : (req.session && req.session.user ? req.session.user.username : 'unknown'));
  try { console.log('SSE connect headers.cookie:', req.headers && req.headers.cookie ? req.headers.cookie : null); } catch (e) {}
  try { console.log('SSE connect session keys:', req.session ? JSON.stringify(Object.keys(req.session)) : null); } catch (e) {}

  const onUpdate = (payload) => {
    try {
      // include a timestamp for debugging clients
      const out = Object.assign({ serverTime: (new Date()).toISOString() }, payload);
      res.write(`data: ${JSON.stringify(out)}\n\n`);
    } catch (e) {
      // ignore write failures
    }
  };

  sseEmitter.on('update', onUpdate);

  req.on('close', () => {
    sseEmitter.removeListener('update', onUpdate);
    console.log('SSE client disconnected');
  });
});

// GET /reception/assigned-data - JSON endpoint for assigned patients (used by kiosk/dashboard)
router.get('/assigned-data', allowKioskOrAuth, async (req, res) => {
  try {
    console.log('GET /reception/assigned-data called', { user: req.session && req.session.user ? req.session.user.username : null, kiosk: !!req.query && (req.query.kiosk === '1' || String(req.query.kiosk).toLowerCase() === 'true') });
  const allTestsRaw = await Test.find({});
  const allTests = Array.isArray(allTestsRaw)
    ? allTestsRaw.slice().sort((a, b) => {
        const aDate = new Date(a.testDate || a.createdAt || 0).getTime();
        const bDate = new Date(b.testDate || b.createdAt || 0).getTime();
        return aDate - bDate;
      })
    : [];
    const areaAssignments = {};
    for (const area of AREAS) areaAssignments[area] = [];

    if (Array.isArray(allTests)) {
      for (const t of allTests) {
        if (!t.status) continue;
        const area = mapAreaForTest(t);
        if (!AREAS.includes(area)) continue;
        if (!t.patient) continue;
        const patient = await Patient.findById(t.patient);
        if (!patient || !patient.patientCode) continue;
        areaAssignments[area].push({ testId: t.testId, patientCode: patient.patientCode, assignedDoctor: t.assignedDoctorName || null });
      }
    }

    // Deduplicate assignments per area by patientCode to avoid repeating the same patient
    Object.keys(areaAssignments).forEach(area => {
      const seen = new Set();
      areaAssignments[area] = areaAssignments[area].filter(a => {
        const code = a && a.patientCode ? String(a.patientCode) : null;
        if (!code) return false;
        if (seen.has(code)) return false;
        seen.add(code);
        return true;
      });
    });

    res.json({
      areas: AREAS,
      assignments: areaAssignments,
      ad: kioskAdText,
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error('Assigned-data error:', err);
    res.status(500).json({ error: 'Error retrieving assignments' });
  }
});

// DEBUG: GET /reception/emit-test - emit a test SSE update (kiosk allowed or authenticated)
// Useful for debugging SSE connections from the client without performing other actions.
router.get('/emit-test', allowKioskOrAuth, (req, res) => {
  try {
    const payload = { action: 'debug', message: 'test emit', time: (new Date()).toISOString() };
    console.log('DEBUG SSE emit', payload);
    sseEmitter.emit('update', payload);
    return res.json({ ok: true, emitted: payload });
  } catch (e) {
    console.error('DEBUG emit failed', e);
    return res.status(500).json({ ok: false });
  }
});

// POST /reception/advert - set the kiosk advertisement text (admin only)
router.post('/advert', requireAuth, async (req, res) => {
  try {
    const ad = req.body && (req.body.ad || req.body.adText || req.body.advert) ? String(req.body.ad || req.body.adText || req.body.advert) : '';
    kioskAdText = ad;
    console.log('Kiosk advertisement updated:', kioskAdText);
    try {
      sseEmitter.emit('update', { action: 'advert', ad: kioskAdText, time: (new Date()).toISOString() });
    } catch (e) { console.warn('Failed to emit SSE advert update', e); }
    req.flash && req.flash('success_msg', 'Kiosk advertisement updated');
    return res.redirect('/reception');
  } catch (e) {
    console.error('Failed to update kiosk ad', e);
    req.flash && req.flash('error_msg', 'Failed to update advertisement');
    return res.redirect('/reception');
  }
});

// GET /reception/area/:name - show queue for a specific area
router.get('/area/:name', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const areaName = decodeURIComponent(req.params.name);
  const allTestsRaw = await Test.find({});
  const allTests = Array.isArray(allTestsRaw)
    ? allTestsRaw.slice().sort((a, b) => {
        const aDate = new Date(a.testDate || a.createdAt || 0).getTime();
        const bDate = new Date(b.testDate || b.createdAt || 0).getTime();
        return aDate - bDate;
      })
    : [];
    // For the area queue, include tests that map to the requested areaName using mapAreaForTest.
    const tests = Array.isArray(allTests) ? allTests.filter(t => {
      if (!t.status) return false;
      const mapped = mapAreaForTest(t);
      return mapped === areaName;
    }) : [];

    // Populate patient info for each test and prepare specimens list for the area
    const populated = await Promise.all(tests.map(async (t) => {
      const patient = t.patient ? await Patient.findById(t.patient) : null;
      const patientObj = patient ? patient.toJSON() : null;
      return {
        ...t,
        patient: patientObj,
        patientEncoded: patientObj && patientObj.patientCode ? true : false
      };
    }));

    // Build specimen list (tests that have a specimen number for this area)
    const specimens = populated
      .filter(t => t.specimenNumbers && t.specimenNumbers[areaName])
      .map(t => ({ testId: t.testId, specimen: t.specimenNumbers[areaName], patient: t.patient }));

    // Get list of encoded patients for quick assign dropdown
    const allPatients = await Patient.find({});
    const encodedPatients = Array.isArray(allPatients) ? allPatients.filter(p => p.patientCode).map(p => p.toJSON()) : [];

    // Load available doctors for assignment dropdown
    const users = await User.find({ role: 'Doctor' });

    res.render('reception/area', {
      title: `Reception - ${areaName}`,
      areaName,
      tests: populated,
      areas: AREAS,
      specimens,
      encodedPatients
      , users
    });
  } catch (err) {
    console.error('Reception area error:', err);
    req.flash('error_msg', 'Error loading area');
    res.redirect('/reception');
  }
});

// POST /reception/assign - assign a test to an area (update status)
router.post('/assign', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const { testId, area, specimen, assignedDoctor } = req.body || {};
    console.log('POST /reception/assign invoked', { testId, area, specimen, user: req.session && req.session.user ? req.session.user.username : null });

    // Basic validation
    if (!testId || !area) {
      const msg = 'Missing testId or area';
      console.warn('Assign validation failed:', { testId, area });
      if (req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
        return res.status(400).json({ success: false, message: msg });
      }
      req.flash('error_msg', msg);
      return res.redirect('/reception');
    }

    const test = await Test.findById(testId);
    if (!test) {
      const msg = `Test not found: ${testId}`;
      console.warn(msg);
      if (req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
        return res.status(404).json({ success: false, message: msg });
      }
      req.flash('error_msg', msg);
      return res.redirect('/reception');
    }

    // Ensure the test has an associated patient and that patient is encoded with a patientCode
    if (!test.patient) {
      const msg = 'Cannot assign: test has no associated patient. Please encode the patient first.';
      console.warn(msg, { testId });
      if (req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
        return res.status(400).json({ success: false, message: msg });
      }
      req.flash('error_msg', msg);
      return res.redirect('/reception');
    }
    const patientObj = await Patient.findById(test.patient);
    if (!patientObj || !patientObj.patientCode) {
      const msg = 'Cannot assign: associated patient is not encoded (patient code missing). Please encode patient first.';
      console.warn(msg, { testId, patient: test.patient });
      if (req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
        return res.status(400).json({ success: false, message: msg });
      }
      req.flash('error_msg', msg);
      return res.redirect('/reception');
    }

    // Restrict a patient to be assigned to only one active area at a time (ignore 'Releasing of Result')
    const existingTests = await Test.find({ patient: patientObj.id });
    if (Array.isArray(existingTests)) {
      const conflict = existingTests.find(t => t && t.status && AREAS.includes(t.status) && t.status !== 'Releasing of Result' && t.status !== area);
      if (conflict) {
        // Previously we blocked reassignment when a patient already had an active assignment.
        // Allow manual transfer: clear the conflicting active assignment (mark as Completed)
        // and proceed to assign the selected test to the requested area.
        console.warn('Assign conflict - clearing existing active assignment', { testId, conflict: conflict.testId, patient: patientObj.id });
        try {
          conflict.status = 'Completed';
          // completedAt is set by Test.save() when status === 'Completed'
          await conflict.save();
          // notify clients that the other test was completed/cleared
          try {
            const payloadCleared = { action: 'complete', testId: conflict.testId, status: conflict.status, time: (new Date()).toISOString() };
            sseEmitter.emit('update', payloadCleared);
          } catch (e) { console.warn('SSE emit for cleared conflict failed', e); }
        } catch (clearErr) {
          console.error('Failed to clear conflicting test assignment', clearErr);
        }
        // continue - the current test will be assigned below
      }
    }

    test.status = area;
    // If a specimen code was provided, record it for this area
    if (specimen && String(specimen).trim()) {
      if (!test.specimenNumbers || typeof test.specimenNumbers !== 'object') test.specimenNumbers = {};
      test.specimenNumbers[area] = String(specimen).trim();
    }
    // If a doctor assignment was provided, persist it on the test
    if (assignedDoctor && String(assignedDoctor).trim()) {
      try {
        const doc = await User.findById(assignedDoctor);
        if (doc) {
          test.assignedDoctorId = doc.id;
          test.assignedDoctorName = doc.name;
        } else {
          // store raw value if lookup fails
          test.assignedDoctorId = String(assignedDoctor).trim();
          test.assignedDoctorName = String(assignedDoctor).trim();
        }
      } catch (e) {
        console.warn('Failed to lookup assigned doctor', e);
        test.assignedDoctorId = String(assignedDoctor).trim();
        test.assignedDoctorName = String(assignedDoctor).trim();
      }
    }
    await test.save();

    // notify any connected clients that assignments changed
    try {
      const payload = { action: 'assign', testId: test.testId, area, time: (new Date()).toISOString(), patientCode: patientObj.patientCode, assignedDoctor: test.assignedDoctorName };
      console.log('SSE emit', payload.action, payload.testId, payload.area);
      sseEmitter.emit('update', payload);
    } catch (e) { console.warn('SSE emit failed', e); }

    const message = `Assigned ${test.testId} to ${area}`;
    if (req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.json({ success: true, message, movedTo: area });
    }

    // For non-AJAX form submits, stay on the current page (where the assign button was clicked)
    // by redirecting back to the HTTP Referer when available. This prevents the UI from
    // navigating to the target area page after assigning; receptionist remains on their area.
    const referer = req.get('Referer') || req.get('Referrer');
    if (referer && referer.includes('/reception/area/')) {
      req.flash('success_msg', message);
      return res.redirect(referer);
    }

    // Fallback: redirect to the assigned area's page
    req.flash('success_msg', message);
    return res.redirect(`/reception/area/${encodeURIComponent(area)}`);
  } catch (err) {
    console.error('Reception assign error:', err);
    if (req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
    req.flash('error_msg', 'Error assigning test');
    return res.redirect('/reception');
  }
});

// (create-assign removed) New patients are auto-created and assigned to Payment Area on encoding.

// POST /reception/complete - mark a test as completed (keeps status 'Completed' so reports still work)
router.post('/complete', requireAuth, canAccessPatient, async (req, res) => {
  try {
    console.log('POST /reception/complete invoked', { body: req.body, user: req.session && req.session.user ? req.session.user.username : null });
    try { console.log('POST /reception/complete headers.cookie:', req.headers && req.headers.cookie ? req.headers.cookie : null); } catch (e) {}
    try { console.log('POST /reception/complete session keys:', req.session ? JSON.stringify(Object.keys(req.session)) : null); } catch (e) {}
  try { console.log('POST /reception/complete isAjax:', !!req.xhr, 'x-requested-with:', req.headers['x-requested-with'] || null, 'accept:', req.headers.accept || null); } catch (e) {}
  const { testId, area, amount, amount_clinical, amount_xray } = req.body;
    if (!testId) {
      req.flash('error_msg', 'Missing test id');
      return res.redirect('/reception');
    }
    const test = await Test.findById(testId);
    if (!test) {
      req.flash('error_msg', 'Test not found');
      return res.redirect('/reception');
    }
    // Save previous area (area param if provided) before overwriting
    const previousArea = area || test.status || null;
    console.log('complete: test found', { testId: test.testId, previousArea, testType: test.testType, currentStatus: test.status });

    // If completing from Payment Area, require amount(s) and record payment(s) in patient timeseries
    if ((previousArea === 'Payment Area' || area === 'Payment Area')) {
      // Support new fields amount_clinical and amount_xray; fall back to legacy `amount` as clinical
      const toNumber = v => {
        const s = String(v || '').replace(/,/g, '').trim();
        const n = parseFloat(s);
        return (Number.isNaN(n) ? null : n);
      };
      let parsedClinical = toNumber(amount_clinical);
      let parsedXray = toNumber(amount_xray);
      // legacy single amount field
      if ((parsedClinical === null || parsedClinical === 0) && (parsedXray === null || parsedXray === 0) && amount) {
        parsedClinical = toNumber(amount);
      }

      // require at least one positive amount
      const hasValidClinical = parsedClinical !== null && parsedClinical > 0;
      const hasValidXray = parsedXray !== null && parsedXray > 0;
      if (!hasValidClinical && !hasValidXray) {
        const msg = 'Amount paid is required for Payment Area and must include a positive number (clinical and/or x-ray)';
        console.warn('Payment validation failed:', { testId, amount, amount_clinical, amount_xray });
        if (req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
          return res.status(400).json({ success: false, message: msg });
        }
        req.flash('error_msg', msg);
        return res.redirect(`/reception/area/${encodeURIComponent(previousArea || area || 'Payment Area')}`);
      }

      if (!test.patient) {
        const msg = 'Cannot record payment: test has no associated patient. Please encode the patient first.';
        console.warn(msg, { testId });
        if (req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
          return res.status(400).json({ success: false, message: msg });
        }
        req.flash('error_msg', msg);
        return res.redirect(`/reception/area/${encodeURIComponent(previousArea || area || 'Payment Area')}`);
      }

      const patientObj = await Patient.findById(test.patient);
      if (!patientObj) {
        const msg = 'Associated patient not found';
        if (req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
          return res.status(404).json({ success: false, message: msg });
        }
        req.flash('error_msg', msg);
        return res.redirect(`/reception/area/${encodeURIComponent(previousArea || area || 'Payment Area')}`);
      }

      // Append payment timeseries entry(ies) to patient
      try {
        patientObj.paymentHistory = Array.isArray(patientObj.paymentHistory) ? patientObj.paymentHistory : [];
        const now = (new Date()).toISOString();
        if (hasValidClinical) {
          patientObj.paymentHistory.push({ testId: test.testId, amount: parsedClinical, lab: 'clinical', timestamp: now });
          console.log('Recorded clinical payment for patient', { patientId: patientObj.id, testId: test.testId, amount: parsedClinical });
        }
        if (hasValidXray) {
          patientObj.paymentHistory.push({ testId: test.testId, amount: parsedXray, lab: 'xray', timestamp: now });
          console.log('Recorded x-ray payment for patient', { patientId: patientObj.id, testId: test.testId, amount: parsedXray });
        }
        await patientObj.save();
      } catch (saveErr) {
        console.error('Error saving patient payment history:', saveErr);
        // do not block completion if payment save fails; log and continue
      }
    }


    // If this test is a Doctor's Check-up -> mark Completed and do NOT forward or set In Progress
    if (test.testType === "Doctor's Check-up") {
      test.status = 'Completed';
      await test.save();
      console.log('complete: Doctor checkup marked Completed', { testId: test.testId });
      try {
        const payload = { action: 'complete', testId: test.testId, status: test.status, time: (new Date()).toISOString() };
        console.log('SSE emit', payload.action, payload.testId, payload.status);
        sseEmitter.emit('update', payload);
      } catch (e) { }
      const message = `${test.testId} marked as completed (Doctor's Check-up)`;
      if (req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
        return res.json({ success: true, message, movedTo: null });
      }
      req.flash('success_msg', message);
      return res.redirect(previousArea ? `/reception/area/${encodeURIComponent(previousArea)}` : '/reception');
    }

    // If patient's requiredAreas includes 'For Send Out', set status to 'For Referral' after payment
    let setForReferral = false;
    if (test.patient) {
      const patientObj = await Patient.findById(test.patient);
      if (patientObj && Array.isArray(patientObj.requiredAreas)) {
        setForReferral = patientObj.requiredAreas.some(area => String(area).toLowerCase().includes('send out'));
      }
    }
    if (setForReferral) {
      test.status = 'For Referral';
      await test.save();
      console.log('complete: For Send Out detected, marked For Referral', { testId: test.testId });
    } else {
      // mark as completed for this step first
      test.status = 'Completed';
      await test.save();
      console.log('complete: marked Completed', { testId: test.testId });
    }

    // now attempt to auto-forward to next required area for patient
    if (test.patient) {
      const patientObj = await Patient.findById(test.patient);
      const required = Array.isArray(patientObj && patientObj.requiredAreas) ? patientObj.requiredAreas.slice() : [];

      // produce ordered requiredAreas using AREAS sequence (skip Payment Area and Releasing)
      const orderedRequired = AREAS.filter(a => required.includes(a) && a !== 'Payment Area' && a !== 'Releasing of Result');

      // find next area after previousArea. Only forward when there is a *next* required area.
      let nextArea = null;
      if (previousArea === 'Payment Area') {
        nextArea = orderedRequired.length ? orderedRequired[0] : null;
      } else {
        const idx = orderedRequired.indexOf(previousArea);
        if (idx >= 0 && idx < orderedRequired.length - 1) {
          nextArea = orderedRequired[idx + 1];
        } else {
          // previousArea either not in the patient's required list, or it was the last required area.
          // In both cases we should NOT auto-forward to the first item to avoid cycling back.
          nextArea = null;
        }
      }

      // Ensure patient is not already active in that area
      if (nextArea) {
        const existing = await Test.find({ patient: patientObj.id });
        const conflict = Array.isArray(existing) && existing.find(t => t && t.status === nextArea);
        console.log('complete: forwarding decision', { testId: test.testId, nextArea, conflict: !!conflict });
        if (!conflict) {
          // re-use same test record to forward to next area (status becomes nextArea)
          test.status = nextArea;
          await test.save();
          try {
            const payload = { action: 'forward', testId: test.testId, movedTo: nextArea, time: (new Date()).toISOString() };
            console.log('SSE emit', payload.action, payload.testId, payload.movedTo);
            sseEmitter.emit('update', payload);
          } catch (e) { }
          // stay on the same area page so receptionist can continue serving the next patient
          req.flash('success_msg', `${test.testId} moved to ${nextArea}`);
          if (req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
            return res.json({ success: true, message: `${test.testId} moved to ${nextArea}`, movedTo: nextArea });
          }
          return res.redirect(`/reception/area/${encodeURIComponent(previousArea || '')}`);
        } else {
          // cannot forward because an active test already exists in next area
          console.log('complete: forward blocked by conflict', { testId: test.testId, nextArea });
          req.flash('info_msg', `${test.testId} completed; would forward to ${nextArea} but patient already has an active item there. It remains completed.`);
          if (req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
            return res.json({ success: true, message: `${test.testId} completed; would forward to ${nextArea} but patient already has an active item there. It remains completed.`, movedTo: null, conflict: true });
          }
          return res.redirect(`/reception/area/${encodeURIComponent(previousArea || '')}`);
        }
      }

      // If we reach here, there was no nextArea (either none defined, or previousArea was last)
      // Reception finished for this test.
      // If the previous area was "Releasing of Result" then the process ends -> keep Completed.
      // Otherwise move to 'In Progress' (waiting for results encoding).
      if (previousArea === 'Releasing of Result') {
        // mark as released so mapAreaForTest will not send it back to Releasing
        try {
          test.status = 'Released';
          test.released = true;
          await test.save();
        } catch (e) {
          console.warn('Failed to persist released flag/status', e);
        }
        console.log('complete: final step (Releasing) — marked Released, keep Released', { testId: test.testId });
      } else {
        // Registration should still be treated as In Progress per requirements
        test.status = 'In Progress';
        await test.save();
        console.log('complete: moved to In Progress', { testId: test.testId });
      }
      try {
        const payload = { action: 'complete', testId: test.testId, status: test.status, time: (new Date()).toISOString() };
        console.log('SSE emit', payload.action, payload.testId, payload.status);
        sseEmitter.emit('update', payload);
      } catch (e) { }
    }

    // respond (AJAX) or redirect back to same area so receptionist stays on page
    const message = `${test.testId} marked as ${test.status}`;
    if (req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.json({ success: true, message, movedTo: null, status: test.status });
    }
    req.flash('success_msg', message);
    return res.redirect(previousArea ? `/reception/area/${encodeURIComponent(previousArea)}` : '/reception');
  } catch (err) {
    console.error('Complete error:', err);
    req.flash('error_msg', 'Error marking complete');
    res.redirect('/reception');
  }
});

// POST /reception/delete - delete a test from the queue
router.post('/delete', requireAuth, canAccessPatient, async (req, res) => {
  try {
    console.log('Reception delete handler invoked', { body: req.body });
    const { testId, area } = req.body;
    if (!testId) {
      req.flash('error_msg', 'Missing test id');
      return res.redirect('/reception');
    }
    const deleted = await Test.findByIdAndDelete(testId);
    try {
      const payload = { action: 'delete', testId: deleted ? deleted.testId : testId, time: (new Date()).toISOString() };
      console.log('SSE emit', payload.action, payload.testId);
      sseEmitter.emit('update', payload);
    } catch (e) { }
    const message = `Deleted ${deleted ? deleted.testId : testId}`;
    if (req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.json({ success: true, message });
    }
    req.flash('success_msg', message);
    return res.redirect(area ? `/reception/area/${encodeURIComponent(area)}` : '/reception');
  } catch (err) {
    console.error('Delete error:', err);
    req.flash('error_msg', 'Error deleting test');
    res.redirect('/reception');
  }
});

// expose SSE emitter so other modules (patients, etc.) can notify connected clients
module.exports = router;

// Server-side TTS proxy endpoint
// GET /reception/tts?text=...&lang=en
// This returns an MP3 audio stream generated via an unofficial Google Translate TTS endpoint.
// No API key required. Clients can fetch and play the returned audio regardless of device TTS support.
router.get('/tts', async (req, res) => {
  try {
    const text = req.query && req.query.text ? String(req.query.text).trim() : '';
    const lang = req.query && req.query.lang ? String(req.query.lang).trim() : 'en';
    if (!text) return res.status(400).send('Missing text');

    // Build the Google TTS URL (unofficial endpoint). The package helps construct a valid URL.
    const url = await gtts.getAudioUrl(text, { lang, slow: false, host: 'https://translate.google.com' });

    // Proxy the remote MP3 back to the client to avoid CORS or device restrictions.
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      headers: { 'User-Agent': 'Mozilla/5.0 (Node.js)'}
    };

    https.get(options, (remoteRes) => {
      // Forward content-type and pipe the stream
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      remoteRes.pipe(res);
    }).on('error', (err) => {
      console.error('TTS proxy request failed', err);
      res.status(500).send('TTS proxy failed');
    });
  } catch (err) {
    console.error('TTS route error', err);
    res.status(500).send('TTS error');
  }
});
