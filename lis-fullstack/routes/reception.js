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

// Determine the intended target area for a test based on its requestedTests or testType.
// This is used when deciding where to forward tests after payment or after completing a step.
function getTargetAreaForTest(t) {
  if (!t) return null;
  try {
    if (Array.isArray(t.requestedTests) && t.requestedTests.length) {
      for (const rr of t.requestedTests) {
        if (rr && rr.area) return rr.area;
      }
      const anyX = t.requestedTests.some(rr => rr && String(rr.lab).toLowerCase() === 'xray');
      if (anyX) return 'X-ray';
      const anyTyping = t.requestedTests.some(rr => rr && String(rr.label || '').toLowerCase().includes('typing'));
      if (anyTyping) return 'Extraction Area';
    }
  } catch (e) { console.warn('getTargetAreaForTest failed to inspect requestedTests', e); }
  const label = String(t.testType || '').toLowerCase();
  if (label.includes('xray')) return 'X-ray';
  if (label.includes('ultrasound') || label.includes('echo')) return 'Ultrasound';
  if (label.includes('ecg')) return 'ECG';
  if (label.includes('drug')) return 'Drug Test';
  // Explicit exclusions that should remain Awaiting (handled separately)
  if (label.includes('fecal') || label.includes('pregnan') || label.includes('fob') || label.includes('pregnancy') || label.includes('urinal')) return null;
  // Common blood/serology/hematology templates map to Extraction Area
  if (/blood|chemistry|hematology|serology|pt|aptt|typing|dengue|esr|thyroid|ct-bt|cbc|hba1c/.test(label)) return 'Extraction Area';
  return null;
}

// Determine target area for an individual requestedTests entry (rr)
function getTargetAreaForRequest(rr) {
  if (!rr) return null;
  try {
    if (rr.area) return rr.area;
    const lab = String(rr.lab || '').toLowerCase();
    if (lab === 'xray') return 'X-ray';
    const label = String(rr.label || '').toLowerCase();
    if (label.includes('typing')) return 'Extraction Area';
    if (label.includes('ultrasound') || label.includes('echo')) return 'Ultrasound';
    if (label.includes('ecg')) return 'ECG';
    if (label.includes('drug')) return 'Drug Test';
    if (/blood|chemistry|hematology|serology|pt|aptt/.test(label)) return 'Extraction Area';
  } catch (e) { }
  return null;
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

    // Count unique patients per area (deduplicate by patientCode) so dashboard shows patient counts
    const counts = AREAS.map(a => ({ name: a, count: 0, _seen: new Set() }));
    if (Array.isArray(allTests)) {
      for (const t of allTests) {
        const areaForTest = mapAreaForTest(t);
        if (!AREAS.includes(areaForTest)) continue;
        if (!t.patient) continue;
        const patient = await Patient.findById(t.patient);
        if (!patient || !patient.patientCode) continue;
        const idx = counts.findIndex(c => c.name === areaForTest);
        if (idx >= 0) counts[idx]._seen.add(String(patient.patientCode));
      }
    }
    // finalize counts and remove internal sets
    for (const c of counts) {
      c.count = c._seen.size || 0;
      delete c._seen;
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

    // Aggregate tests by patient so each area shows one row per patient (tests listed inside)
    let aggregated = null;
    {
      const byPatient = {};
      for (const t of populated) {
        if (!t.patient || !t.patient.id) continue;
        const pid = t.patient.id;
        if (!byPatient[pid]) byPatient[pid] = { patient: t.patient, patientEncoded: t.patientEncoded, tests: [], firstDate: t.testDate || t.createdAt };
        byPatient[pid].tests.push(t);
        // keep earliest date for display
        try {
          const cur = new Date(byPatient[pid].firstDate || 0).getTime();
          const cand = new Date(t.testDate || t.createdAt || 0).getTime();
          if (cand < cur) byPatient[pid].firstDate = t.testDate || t.createdAt;
        } catch (e) {}
      }
      // convert to array with aggregated amounts
      aggregated = Object.keys(byPatient).map(pid => {
        const item = byPatient[pid];

        // Merge Blood Chemistry variant tests into a single logical 'Blood Chemistry' test
        try {
          const bcIdxs = [];
          for (let i = 0; i < item.tests.length; i++) {
            const tt = item.tests[i];
            const ttLabel = String(tt.testType || '').toLowerCase();
            if (/blood\s*chemistry|^bc\b|^blood[-_\s]?chem/i.test(ttLabel)) {
              bcIdxs.push(i);
            }
          }
          if (bcIdxs.length > 1) {
            // collect requestedTests from all BC variant tests
            const mergedRequested = [];
            const mergedSpecimens = {};
            const mergedIds = [];
            for (const idx of bcIdxs.sort((a,b)=>b-a)) {
              const tt = item.tests[idx];
              mergedIds.push(tt.testId || tt.id || ('BC-' + idx));
              if (Array.isArray(tt.requestedTests)) mergedRequested.push(...tt.requestedTests);
              if (tt.specimenNumbers && typeof tt.specimenNumbers === 'object') {
                Object.assign(mergedSpecimens, tt.specimenNumbers);
              }
              // remove the variant entry
              item.tests.splice(idx, 1);
            }
            // dedupe mergedRequested by key/label
            const seen = new Set();
            const deduped = [];
            for (const r of mergedRequested) {
              const k = (String(r.key || r.label || '')).toLowerCase();
              if (!k) continue;
              if (seen.has(k)) continue;
              seen.add(k);
              deduped.push(r);
            }
            // create a synthetic merged test for view purposes
            const mergedTest = Object.assign({}, item.tests[0] || {}, {
              testId: mergedIds.join(','),
              testType: 'Blood Chemistry',
              requestedTests: deduped,
              specimenNumbers: Object.keys(mergedSpecimens).length ? mergedSpecimens : undefined
            });
            // insert merged test at start
            item.tests.unshift(mergedTest);
          }
        } catch (e) { console.warn('Failed merging blood chemistry variants', e); }

        // compute clinical/xray totals and list of testIds (per-area totals)
        let clinicalTotal = 0, xrayTotal = 0;
        const testIds = [];
        const testTypes = [];
          for (const tt of item.tests) {
            testIds.push(tt.testId || tt.testId);
            testTypes.push(tt.testType || 'Test');
            try {
              const rlist = Array.isArray(tt.requestedTests) ? tt.requestedTests : [];
              // For Payment Area, all requested items contribute to the payment totals.
              // For other areas, only include requested items that target this area.
              const areaRelevant = Array.isArray(rlist)
                ? (areaName === 'Payment Area'
                    ? rlist.slice()
                    : rlist.filter(rr => {
                        const targ = getTargetAreaForRequest(rr);
                        return targ === areaName;
                      }))
                : [];
              // attach per-test area-specific requested list for view rendering
              tt._areaRequested = areaRelevant;
              for (const r of areaRelevant) {
                const a = Number(r && (r.amount || r.amount === 0) ? r.amount : 0) || 0;
                if (r && String(r.lab).toLowerCase() === 'xray') xrayTotal += a; else clinicalTotal += a;
              }
            } catch (e) {}
          }
          return { patient: item.patient, patientEncoded: item.patientEncoded, tests: item.tests, testIds, testTypes, clinicalTotal, xrayTotal, date: item.firstDate };
      });
    }

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
      tests: aggregated,
      areas: AREAS,
      specimens,
      encodedPatients,
      users
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
          // record history with user info
          conflict.addStatusEntry({ from: conflict.status, to: 'Completed', user: req.session && req.session.user ? req.session.user.username : null, area: 'Completed', timestamp: (new Date()).toISOString() });
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

    // record history entry including user and area
    test.addStatusEntry({ from: test.status, to: area, user: req.session && req.session.user ? req.session.user.username : null, area, timestamp: (new Date()).toISOString() });
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

// POST /reception/complete - mark patient/tests as completed for the area or advance from Payment Area
router.post('/complete', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const { patientId, testIds, area, amount_clinical, amount_xray } = req.body || {};
    console.log('POST /reception/complete', { patientId, testIds, area, amount_clinical, amount_xray });

    if (!patientId) {
      const msg = 'Missing patientId';
      if (req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) return res.status(400).json({ success: false, message: msg });
      req.flash && req.flash('error_msg', msg);
      return res.redirect('/reception');
    }

    // parse provided testIds (these are test.testId values joined by comma)
    const ids = (testIds || '').split(',').map(s => String(s || '').trim()).filter(Boolean);

    const processed = [];
    if (area === 'Payment Area') {
      // Load all tests referenced and determine each test's target area
      const testsToProcess = [];
      for (const tid of ids) {
        try {
          const t = await Test.findOne({ testId: tid });
          if (!t) continue;
          testsToProcess.push(t);
        } catch (e) { console.warn('Failed loading test', tid, e); }
      }

      // Map each test to a candidate target area (null => Awaiting)
      const candidates = testsToProcess.map(t => ({ test: t, target: getTargetAreaForTest(t) }));
      console.log('DEBUG Payment Area candidates:', candidates.map(c => ({ testId: c.test && c.test.testId, target: c.target })));
      // Choose the earliest area in AREAS order among non-null targets; this area becomes active for the patient
      const nonNullTargets = candidates.map(c => c.target).filter(Boolean);
      let chosenTarget = null;
      if (nonNullTargets.length) {
        // pick the one with smallest AREAS index
        let bestIdx = Infinity;
        for (const tgt of nonNullTargets) {
          const idx = AREAS.indexOf(tgt);
          if (idx >= 0 && idx < bestIdx) { bestIdx = idx; chosenTarget = tgt; }
        }
      }

      // If no chosen target, everything stays Awaiting
      for (const c of candidates) {
        try {
          console.log('DEBUG Payment Area processing test', { testId: c.test && c.test.testId, originalStatus: c.test && c.test.status, candidateTarget: c.target, chosenTarget });
          const t = c.test;
          const label = String(t.testType || '').toLowerCase();
          const isSampleOnDemand = /fecal|pregnan|fob|urinal|fecalysis|fecal-occult-blood|pregnancy/.test(label) ||
                                  (Array.isArray(t.requestedTests) && t.requestedTests.some(rr => rr && /(fecal|pregnan|fob|urinal|pregnancy|fecalysis)/i.test(String(rr.label || ''))));
          const targ = chosenTarget && c.target === chosenTarget ? chosenTarget : (isSampleOnDemand ? 'Awaiting' : 'Pending');
          t.addStatusEntry({ from: t.status, to: targ, user: req.session && req.session.user ? req.session.user.username : null, area: targ, timestamp: (new Date()).toISOString() });
          t.status = targ;
          await t.save();
          processed.push(t.testId || t.id);
          try { sseEmitter.emit('update', { action: 'complete', testId: t.testId, status: t.status, patient: t.patient, time: (new Date()).toISOString() }); } catch (e) { console.warn('SSE emit failed', e); }
        } catch (e) { console.warn('Failed saving processed test', e); }
      }

    } else {
      // Non-payment area marking: if specific testIds provided, use them; otherwise
      // complete all tests for this patient that currently map to this area.
      let targets = [];
      if (ids && ids.length) {
        for (const tid of ids) {
          try {
            const t = await Test.findOne({ testId: tid });
            if (t) targets.push(t);
          } catch (e) { console.warn('Failed loading test', tid, e); }
        }
      } else {
        // load all tests for patient and pick those that currently map to this area
        // or whose requested pipeline includes this area, or whose pipeline has a later area
        // after the completed area (so they should be advanced). Exclude sample-on-demand tests.
        try {
          const all = await Test.find({ patient: patientId });
          const currentIdx = AREAS.indexOf(area);
          if (Array.isArray(all)) {
            for (const t of all) {
              try {
                const mapped = mapAreaForTest(t);
                if (mapped === area) { targets.push(t); continue; }
                const rlist = Array.isArray(t.requestedTests) ? t.requestedTests : [];
                const reqAreas = [];
                for (const rr of rlist) {
                  try { const a = getTargetAreaForRequest(rr); if (a) reqAreas.push(a); } catch (e) {}
                }
                // unique and ordered by AREAS
                const uniq = Array.from(new Set(reqAreas)).sort((a, b) => (AREAS.indexOf(a) - AREAS.indexOf(b)));
                // skip sample-on-demand tests from being auto-advanced
                const label = String(t.testType || '').toLowerCase();
                const isSampleOnDemand = /fecal|pregnan|fob|urinal|fecalysis|fecal-occult-blood|pregnancy/.test(label) ||
                                        (Array.isArray(t.requestedTests) && t.requestedTests.some(rr => rr && /(fecal|pregnan|fob|urinal|pregnancy|fecalysis)/i.test(String(rr.label || ''))));
                // If the patient's requested pipeline explicitly includes this area, include.
                if (uniq.indexOf(area) >= 0) { targets.push(t); continue; }
                // Otherwise, if the pipeline has any later area after the completed area
                // (meaning this test should be advanced to that later area), include it
                if (!isSampleOnDemand && currentIdx >= 0 && uniq.some(a => AREAS.indexOf(a) > currentIdx)) {
                  targets.push(t);
                  continue;
                }
              } catch (e) {}
            }
          }
        } catch (e) { console.warn('Failed loading patient tests for completion', e); }
      }

      // Build per-test next-area info first so we can choose a single next area
      const work = [];
      for (const t of targets) {
        try {
          const reqAreas = [];
          try {
            const rlist = Array.isArray(t.requestedTests) ? t.requestedTests : [];
            for (const rr of rlist) {
              try { const a = getTargetAreaForRequest(rr); if (a) reqAreas.push(a); } catch (e) {}
            }
          } catch (e) {}
          const uniqAreas = Array.from(new Set(reqAreas)).sort((a, b) => (AREAS.indexOf(a) - AREAS.indexOf(b)));
          const currentIdx = AREAS.indexOf(area);
          let nextArea = null;
          if (uniqAreas.length) {
            for (const cand of uniqAreas) {
              const idx = AREAS.indexOf(cand);
              if (idx > currentIdx) { nextArea = cand; break; }
            }
          }
          const label = String(t.testType || '').toLowerCase();
          const isSampleOnDemand = /fecal|pregnan|fob|urinal|fecalysis|fecal-occult-blood|pregnancy/.test(label) ||
                                  (Array.isArray(t.requestedTests) && t.requestedTests.some(rr => rr && /(fecal|pregnan|fob|urinal|pregnancy|fecalysis)/i.test(String(rr.label || ''))));
          work.push({ test: t, uniqAreas, nextArea, isSampleOnDemand });
        } catch (e) { console.warn('Failed preparing work item for test', t && (t.testId || t.id), e); }
      }

      // Choose a single earliest next area among all candidate nextAreas (non-null)
      let chosenNextArea = null;
      const candidateNexts = work.map(w => w.nextArea).filter(Boolean);
      if (candidateNexts.length) {
        let bestIdx = Infinity;
        for (const cand of candidateNexts) {
          const idx = AREAS.indexOf(cand);
          if (idx >= 0 && idx < bestIdx) { bestIdx = idx; chosenNextArea = cand; }
        }
      }

      // Now apply the chosenNextArea: only tests whose nextArea === chosenNextArea
      // should be moved there. Other tests with a nextArea remain Awaiting. Tests
      // with no nextArea are handled as before (Awaiting for sample-on-demand,
      // In Progress otherwise).
      for (const w of work) {
        try {
          const t = w.test;
          if (w.nextArea && chosenNextArea && w.nextArea === chosenNextArea) {
            t.addStatusEntry({ from: t.status, to: w.nextArea, user: req.session && req.session.user ? req.session.user.username : null, area: w.nextArea, timestamp: (new Date()).toISOString() });
            t.status = w.nextArea;
          } else if (w.nextArea && chosenNextArea && w.nextArea !== chosenNextArea) {
            // this test needs a later area but it's not the chosen one -> Pending,
            // except sample-on-demand tests remain Awaiting
            const holdStatus = w.isSampleOnDemand ? 'Awaiting' : 'Pending';
            t.addStatusEntry({ from: t.status, to: holdStatus, user: req.session && req.session.user ? req.session.user.username : null, area: holdStatus, timestamp: (new Date()).toISOString() });
            t.status = holdStatus;
          } else {
            // no next area required
            if (w.isSampleOnDemand) {
              t.addStatusEntry({ from: t.status, to: 'Awaiting', user: req.session && req.session.user ? req.session.user.username : null, area: 'Awaiting', timestamp: (new Date()).toISOString() });
              t.status = 'Awaiting';
            } else {
              t.addStatusEntry({ from: t.status, to: 'In Progress', user: req.session && req.session.user ? req.session.user.username : null, area: 'In Progress', timestamp: (new Date()).toISOString() });
              t.status = 'In Progress';
            }
          }

          await t.save();
          processed.push(t.testId || t.id);
          try { sseEmitter.emit('update', { action: 'complete', testId: t.testId, status: t.status, patient: t.patient, time: (new Date()).toISOString() }); } catch (e) { console.warn('SSE emit failed', e); }
        } catch (e) { console.warn('Failed processing work item during complete non-payment', w && w.test && (w.test.testId || w.test.id), e); }
      }
    }

    const message = processed.length ? `Marked ${processed.length} test(s) complete` : 'No tests processed';
    if (req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.json({ success: true, message });
    }

    req.flash && req.flash('success_msg', message);
    const referer = req.get('Referer') || req.get('Referrer');
    return res.redirect(referer || '/reception');
  } catch (err) {
    console.error('Reception complete error:', err);
    if (req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) return res.status(500).json({ success: false, message: 'Error marking complete' });
    req.flash && req.flash('error_msg', 'Error marking complete');
    return res.redirect('/reception');
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
// (module.exports moved to file end to ensure all routes are exported)

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

// export router after all routes are defined
module.exports = router;
