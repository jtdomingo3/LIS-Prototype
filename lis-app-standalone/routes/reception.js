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

// Define helper functions for dynamic doctor area resolution
function getDoctor1Name() {
  const env = (process.env.DOCTOR_1_NAME || '').trim();
  if (env && env !== 'undefined') return env;
  return 'Dr. Lorenzo';
}

function getDoctor2Name() {
  const env = (process.env.DOCTOR_2_NAME || '').trim();
  if (env && env !== 'undefined') return env;
  return 'Dr. Arcilla';
}

function doctorArea(name) {
  const clean = (name && String(name).trim() && String(name).trim() !== 'undefined') ? String(name).trim() : 'Dr. Lorenzo';
  return `Doctor's Check-up - ${clean}`;
}

function getAreas() {
  const d1 = getDoctor1Name();
  const d2 = getDoctor2Name();
  const list = [
    'Payment Area',
    'Sendout',
    'Extraction Area',
    'Drug Test',
    'Ultrasound',
    '2D Echo',
    'X-ray',
    'ECG'
  ];
  if (d1) list.push(doctorArea(d1));
  if (d2 && d2 !== d1) list.push(doctorArea(d2));
  list.push('Releasing of Result');
  return list;
}

// Simple in-memory advertisement text for kiosk marquee (editable from /reception)
let kioskAdText = '';

// Helper to map a test to the reception area it should appear in.
// Rules:
// - If test.status !== 'Completed', return the status as-is.
// - If status === 'Completed', only map to 'Releasing of Result' when results/encoding exist
//   (test.completedAt or non-empty test.results). Also, do NOT map Doctor's Check-up to Releasing.
function mapAreaForTest(test) {
  if (!test || !test.status) return test && test.status ? test.status : null;
  // If stashed (patient unavailable), hold in stashed section
  if (test.stashed || test.status === 'Stashed') return 'Stashed';
  // If explicitly released or released flag set, it is completely done (do not map to any active queue area)
  if (test.released || test.status === 'Released') return 'Completed';
  if (test.status === 'Completed') {
    const hasResults = Boolean(test.completedAt || (test.results && String(test.results).trim()));
    const isDoctorCheckup = test.testType && String(test.testType).toLowerCase().includes('doctor');
    const isRegistration = test.testType === 'Registration';
    if (hasResults && !isDoctorCheckup && !isRegistration) return 'Releasing of Result';
    return 'Completed';
  }
  return test.status;
}

// Determine the intended target area for a test based on its requestedTests or testType.
// This is used when deciding where to forward tests after payment or after completing a step.
function getTargetAreaForTest(t) {
  if (!t) return null;
  const d1 = getDoctor1Name();
  const d2 = getDoctor2Name();
  const d1Lower = d1.toLowerCase();
  const d2Lower = d2.toLowerCase();

  const label = String(t.testType || '').toLowerCase();

  // 1. Direct testType matching
  if (label.includes('doctor')) {
    if (d2 && label.includes(d2Lower)) return doctorArea(d2);
    return doctorArea(d1);
  }
  if (label.includes('drug')) return 'Drug Test';
  if (label.includes('2d') || label.includes('echocardiography') || label.includes('2d echo') || label === 'echo') return '2D Echo';
  if (label.includes('ultrasound')) return 'Ultrasound';
  if (label.includes('xray') || label.includes('x-ray')) return 'X-ray';
  if (label.includes('ecg')) return 'ECG';
  if (/send\s*out|for\s*send|sendout|send-out/.test(label)) return 'Sendout';
  if (label.includes('fecal') || label.includes('pregnan') || label.includes('fob') || label.includes('pregnancy') || label.includes('urinal')) return null;
  if (/blood|chemistry|bun|crea|creatinine|hematology|serology|pt|aptt|typing|dengue|esr|thyroid|ct-bt|cbc|hba1c/.test(label)) return 'Extraction Area';

  // 2. Fallback to inspect requestedTests
  try {
    if (Array.isArray(t.requestedTests) && t.requestedTests.length) {
      if (t.requestedTests.length === 1 && t.requestedTests[0]) {
        return getTargetAreaForRequest(t.requestedTests[0]);
      }
      for (const rr of t.requestedTests) {
        if (rr && rr.area) {
          const ra = String(rr.area || '').toLowerCase();
          if (ra.includes('send')) return 'Sendout';
          if (ra.includes("dr.") || ra.includes('doctor')) {
            if (d2 && ra.includes(d2Lower)) return doctorArea(d2);
            return doctorArea(d1);
          }
          return rr.area;
        }
      }
      const anyX = t.requestedTests.some(rr => rr && String(rr.lab).toLowerCase() === 'xray');
      if (anyX) return 'X-ray';
      const anyTyping = t.requestedTests.some(rr => rr && String(rr.label || '').toLowerCase().includes('typing'));
      if (anyTyping) return 'Extraction Area';
    }
  } catch (e) { console.warn('getTargetAreaForTest failed to inspect requestedTests', e); }

  return null;
}

// Determine target area for an individual requestedTests entry (rr)
function getTargetAreaForRequest(rr) {
  if (!rr) return null;
  const d1 = getDoctor1Name();
  const d2 = getDoctor2Name();
  const d1Lower = d1.toLowerCase();
  const d2Lower = d2.toLowerCase();
  try {
    // Normalize legacy 'For Send Out' to internal 'Sendout' area
    if (rr.area) {
      const ra = String(rr.area || '').toLowerCase();
      if (ra.includes('send')) return 'Sendout';
      if (ra.includes("dr.") || ra.includes('doctor')) {
        if (d2 && ra.includes(d2Lower)) return doctorArea(d2);
        return doctorArea(d1);
      }
      return rr.area;
    }
    const lab = String(rr.lab || '').toLowerCase();
    if (lab === 'xray') return 'X-ray';
    const label = String(rr.label || '').toLowerCase();
    if (label.includes('typing')) return 'Extraction Area';
    if (label.includes('2d') || label.includes('echocardiography') || label.includes('2d echo') || label === 'echo') return '2D Echo';
    if (label.includes('ultrasound')) return 'Ultrasound';
    if (label.includes('xray') || label.includes('x-ray')) return 'X-ray';
    if (label.includes('ecg')) return 'ECG';
    if (label.includes('drug')) return 'Drug Test';
    if (label.includes('send')) return 'Sendout';
    if (/blood|chemistry|bun|crea|creatinine|hematology|serology|pt|aptt/.test(label)) return 'Extraction Area';
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

    // Build display areas (exclude internal-only areas like 'Sendout' from kiosk/dashboard tiles)
    const AREAS = getAreas();
    const DISPLAY_AREAS = AREAS.filter(a => String(a).toLowerCase() !== 'sendout');

    // Count unique patients per area (deduplicate by patientCode) so dashboard shows patient counts
    const counts = DISPLAY_AREAS.map(a => ({ name: a, count: 0, _seen: new Set() }));
    if (Array.isArray(allTests)) {
      // Prefetch patients once to avoid repeated synchronous disk reads inside the loop
      const allPatients = global.db.getPatients() || [];
      const patientsById = Object.fromEntries((allPatients || []).map(p => [p.id, p]));
      for (const t of allTests) {
        const areaForTest = mapAreaForTest(t);
        // only count areas that are part of DISPLAY_AREAS
        if (!DISPLAY_AREAS.includes(areaForTest)) continue;
        if (!t.patient) continue;
        const patient = patientsById[t.patient];
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

    // Build stashed results list grouped by patient
    const stashedByPatient = {};
    if (Array.isArray(allTests)) {
      const allPatients = global.db.getPatients() || [];
      const patientsById = Object.fromEntries((allPatients || []).map(p => [p.id, p]));
      for (const t of allTests) {
        if (mapAreaForTest(t) === 'Stashed') {
          const pid = t.patient;
          if (!pid) continue;
          if (!stashedByPatient[pid]) {
            stashedByPatient[pid] = {
              patient: patientsById[pid] || { id: pid, firstName: 'Unknown', lastName: '' },
              testIds: [],
              testNames: [],
              stashedAt: t.updatedAt || t.testDate || new Date()
            };
          }
          stashedByPatient[pid].testIds.push(t.id);
          const tName = (t.testType || 'Test').toString().replace(/-/g,' ').replace(/\b\w/g, ch=>ch.toUpperCase());
          if (!stashedByPatient[pid].testNames.includes(tName)) {
            stashedByPatient[pid].testNames.push(tName);
          }
        }
      }
    }
    const stashedList = Object.values(stashedByPatient);

    res.render('reception/index', {
      title: 'Reception',
      areas: counts,
      stashedCount: stashedList.length,
      stashedList: stashedList,
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
    const allTestsRaw = await Test.find({});
    const allTests = Array.isArray(allTestsRaw)
      ? allTestsRaw.slice().sort((a, b) => {
          const aDate = new Date(a.testDate || a.createdAt || 0).getTime();
          const bDate = new Date(b.testDate || b.createdAt || 0).getTime();
          return aDate - bDate;
        })
      : [];
    // For assigned (kiosk) view we expose DISPLAY_AREAS only (hide internal-only 'Sendout')
    const AREAS = getAreas();
    const DISPLAY_AREAS = AREAS.filter(a => String(a).toLowerCase() !== 'sendout');
    const areaAssignments = {};
    for (const area of DISPLAY_AREAS) {
      areaAssignments[area] = [];
    }

    if (Array.isArray(allTests)) {
      // Prefetch patients once to avoid repeated disk reads
      const allPatients = global.db.getPatients() || [];
      const patientsById = Object.fromEntries((allPatients || []).map(p => [p.id, p]));
      for (const t of allTests) {
        if (!t.status) continue;
        const area = mapAreaForTest(t);
        if (!DISPLAY_AREAS.includes(area)) continue;
        if (!t.patient) continue;
        const patient = patientsById[t.patient];
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
    
    // Render kiosk view (fullscreen, no layout) exposing only DISPLAY_AREAS
    res.render('reception/kiosk', {
      title: 'Patient Queue Display',
      areas: DISPLAY_AREAS,
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

  // if not kiosk, require a valid authenticated session. Allow any authenticated user
  // to connect so all users receive live updates and notifications.
  if (!kiosk) {
    if (!req.session || !req.session.user) {
      // not authenticated -> reject
      res.status(401).end();
      return;
    }
    // any authenticated user allowed (no role check)
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
  try { res.write('retry: 3000\n\n'); } catch (e) { }

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
      const AREAS = getAreas();
      const DISPLAY_AREAS = AREAS.filter(a => String(a).toLowerCase() !== 'sendout');
      const areaAssignments = {};
      for (const area of DISPLAY_AREAS) areaAssignments[area] = [];

    if (Array.isArray(allTests)) {
      // Prefetch patients once to avoid repeated disk reads
      const allPatients = global.db.getPatients() || [];
      const patientsById = Object.fromEntries((allPatients || []).map(p => [p.id, p]));
      for (const t of allTests) {
        if (!t.status) continue;
        const area = mapAreaForTest(t);
          if (!DISPLAY_AREAS.includes(area)) continue;
        if (!t.patient) continue;
        const patient = patientsById[t.patient];
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

// POST /reception/clear-queues - Clear all active reception queues (admin only)
router.post('/clear-queues', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const user = req.session && req.session.user;
    if (!user || user.role !== 'Admin') {
      req.flash('error_msg', 'Admin access required to clear reception queues');
      return res.redirect('/reception');
    }

    const tests = (typeof global.db.getTests === 'function' ? global.db.getTests() : []) || [];
    let count = 0;
    const nowIso = new Date().toISOString();
    const userName = (user && (user.name || user.username)) ? (user.name || user.username) : 'Admin';

    for (let i = 0; i < tests.length; i++) {
      const t = tests[i];
      if (t) {
        const prevStatus = t.status || null;
        t.status = 'Released';
        t.released = true;
        if (!t.completedAt) t.completedAt = nowIso;
        if (!Array.isArray(t.statusHistory)) t.statusHistory = [];
        t.statusHistory.push({ from: prevStatus, to: 'Released', user: userName, area: 'Released', timestamp: nowIso });
        t.updatedAt = nowIso;
        count++;
      }
    }

    // Save all updated tests to database ONCE in a single atomic operation
    global.db.saveTests(tests);

    console.log(`[RECEPTION] Admin ${userName} cleared ${count} test(s) from reception queues in bulk`);

    try {
      sseEmitter.emit('update', { action: 'clear_queues', time: nowIso });
    } catch (e) { console.warn('SSE emit for clear_queues failed', e); }

    req.flash('success_msg', `Successfully cleared all reception queues (${count} test(s) set to Released). Reception is ready for a fresh start!`);
    return res.redirect('/reception');
  } catch (err) {
    console.error('Error clearing reception queues:', err);
    req.flash('error_msg', 'Failed to clear reception queues');
    return res.redirect('/reception');
  }
});

// POST /reception/stash - Stash results when patient is unavailable
router.post('/stash', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const { patientId, testIds } = req.body;
    const user = req.session && req.session.user;
    const userName = user ? (user.name || user.username) : 'System';
    const nowIso = new Date().toISOString();

    const idsToStash = Array.isArray(testIds) ? testIds : (testIds ? String(testIds).split(',').map(s => s.trim()).filter(Boolean) : []);
    const allTests = await Test.find({});
    let count = 0;
    let patientName = '';

    for (const t of allTests) {
      const matchPatient = patientId && String(t.patient) === String(patientId);
      const matchId = idsToStash.includes(String(t.id)) || (t.testId && idsToStash.includes(String(t.testId)));
      if (matchPatient || matchId) {
        if (mapAreaForTest(t) === 'Releasing of Result' || t.status === 'Completed') {
          t.stashed = true;
          t.status = 'Stashed';
          t.updatedAt = nowIso;
          t.addStatusEntry({ from: 'Releasing of Result', to: 'Stashed', user: userName, area: 'Stashed', timestamp: nowIso });
          await t.save();
          count++;
          if (t.patient && !patientName) {
            const p = await Patient.findById(t.patient);
            if (p) patientName = `${p.firstName} ${p.lastName}`;
          }
        }
      }
    }

    try {
      sseEmitter.emit('update', { action: 'stash', count, patientName, time: nowIso });
    } catch (e) {}

    req.flash('success_msg', `Stashed ${count} result(s) for ${patientName || 'patient'}. Held in Reception Stashed section.`);
    return res.redirect('/reception/area/Releasing%20of%20Result');
  } catch (err) {
    console.error('Error stashing results:', err);
    req.flash('error_msg', 'Failed to stash results');
    return res.redirect('/reception');
  }
});

// GET /reception/stashed - Dedicated page for stashed results
router.get('/stashed', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const allTestsRaw = await Test.find({});
    const allTests = Array.isArray(allTestsRaw) ? allTestsRaw : [];
    const allPatients = global.db.getPatients() || [];
    const patientsById = Object.fromEntries((allPatients || []).map(p => [p.id, p]));

    const stashedByPatient = {};
    for (const t of allTests) {
      if (mapAreaForTest(t) === 'Stashed') {
        const pid = t.patient;
        if (!pid) continue;
        if (!stashedByPatient[pid]) {
          stashedByPatient[pid] = {
            patient: patientsById[pid] || { id: pid, firstName: 'Unknown', lastName: '' },
            testIds: [],
            testNames: [],
            stashedAt: t.updatedAt || t.testDate || new Date()
          };
        }
        stashedByPatient[pid].testIds.push(t.id);
        const tName = (t.testType || 'Test').toString().replace(/-/g,' ').replace(/\b\w/g, ch=>ch.toUpperCase());
        if (!stashedByPatient[pid].testNames.includes(tName)) {
          stashedByPatient[pid].testNames.push(tName);
        }
      }
    }

    const stashedList = Object.values(stashedByPatient);
    res.render('reception/stashed', {
      title: 'Stashed Results',
      stashedList: stashedList
    });
  } catch (err) {
    console.error('Error rendering stashed page:', err);
    req.flash('error_msg', 'Failed to load stashed results page');
    return res.redirect('/reception');
  }
});

// POST /reception/release-stashed - Release stashed results without triggering kiosk audio call
router.post('/release-stashed', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const { patientId, testIds, redirectUrl } = req.body;
    const user = req.session && req.session.user;
    const userName = user ? (user.name || user.username) : 'System';
    const nowIso = new Date().toISOString();

    const idsToRelease = Array.isArray(testIds) ? testIds : (testIds ? String(testIds).split(',').map(s => s.trim()).filter(Boolean) : []);
    const allTests = await Test.find({});
    let count = 0;
    let patientName = '';

    for (const t of allTests) {
      const matchPatient = patientId && String(t.patient) === String(patientId);
      const matchId = idsToRelease.includes(String(t.id)) || (t.testId && idsToRelease.includes(String(t.testId)));
      if (matchPatient || matchId) {
        t.stashed = false;
        t.status = 'Released';
        t.released = true;
        t.updatedAt = nowIso;
        t.addStatusEntry({ from: 'Stashed', to: 'Released', user: userName, area: 'Released', timestamp: nowIso });
        await t.save();
        count++;
        if (t.patient && !patientName) {
          const p = await Patient.findById(t.patient);
          if (p) patientName = `${p.firstName} ${p.lastName}`;
        }
      }
    }

    // Emit a quiet background SSE update (does NOT alert/ring the kiosk audio!)
    try {
      sseEmitter.emit('update', { action: 'release_stashed', quiet: true, count, patientName, time: nowIso });
    } catch (e) {}

    req.flash('success_msg', `Successfully released ${count} stashed result(s) for ${patientName || 'patient'}.`);
    return res.redirect(redirectUrl || '/reception/stashed');
  } catch (err) {
    console.error('Error releasing stashed results:', err);
    req.flash('error_msg', 'Failed to release stashed results');
    return res.redirect(redirectUrl || '/reception/stashed');
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
    // Prefetch patients once to avoid repeated synchronous disk reads
    const allPatients = global.db.getPatients() || [];
    const patientsById = Object.fromEntries((allPatients || []).map(p => [p.id, p]));
    const populated = tests.map((t) => {
      const patientRaw = t.patient ? patientsById[t.patient] : null;
      const patientObj = patientRaw ? patientRaw : null;
      return {
        ...t,
        patient: patientObj,
        patientEncoded: patientObj && patientObj.patientCode ? true : false
      };
    });

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

    // Get list of encoded patients for quick assign dropdown (use in-memory list)
    const allPatientsRaw = global.db.getPatients() || [];
    const encodedPatients = Array.isArray(allPatientsRaw) ? allPatientsRaw.filter(p => p.patientCode).map(p => p) : [];

    // Load available doctors for assignment dropdown
    const users = await User.find({ role: 'Doctor' });
    const AREAS = getAreas();

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

    let test = await Test.findById(testId);
    if (!test) test = await Test.findOne({ testId: testId });
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
    const AREAS = getAreas();
    if (Array.isArray(existingTests)) {
      const conflict = existingTests.find(t => t && t.status && AREAS.includes(t.status) && t.status !== 'Releasing of Result' && t.status !== area);
      if (conflict) {
        // Previously we blocked reassignment when a patient already had an active assignment.
        // Allow manual transfer: clear the conflicting active assignment (mark as Completed)
        // and proceed to assign the selected test to the requested area.
        console.warn('Assign conflict - clearing existing active assignment', { testId, conflict: conflict.testId, patient: patientObj.id });
        try {
          // record history with user info
          // When clearing an active assignment that is a doctor's check-up, mark as 'Checked'
          const isDoctorType = (conflict.testType === "Doctor's Check-up") || (conflict.testType && String(conflict.testType).toLowerCase().includes('doctor')) || (String(conflict.status || '').toLowerCase().includes('doctor'));
          const finalStatus = isDoctorType ? 'Checked' : 'Completed';
          conflict.addStatusEntry({ from: conflict.status, to: finalStatus, user: req.session && req.session.user ? req.session.user.username : null, area: finalStatus, timestamp: (new Date()).toISOString() });
          conflict.status = finalStatus;
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
    // Always load all tests belonging to this patient to ensure consistent progression across the entire pipeline
    let allPatientTests = [];
    try {
      allPatientTests = await Test.find({ patient: patientId }) || [];
    } catch (e) {
      console.warn('Failed loading patient tests in /reception/complete', e);
    }

    const AREAS = getAreas();

    if (area === 'Payment Area') {
      // Find all tests currently in Payment Area (or matching the submitted IDs)
      const testsToProcess = (allPatientTests || []).filter(t => {
        if (!t) return false;
        if (ids.length && (ids.includes(t.testId) || ids.includes(t.id))) return true;
        return t.status === 'Payment Area' || !t.status;
      });

      // Map each test to a candidate target area (null => Awaiting)
      const candidates = testsToProcess.map(t => ({ test: t, target: getTargetAreaForTest(t) }));
      console.log('DEBUG Payment Area candidates:', candidates.map(c => ({ testId: c.test && c.test.testId, target: c.target })));

      // Choose earliest area in AREAS order among non-null targets (preferring non-sendout)
      const nonNullTargets = candidates.map(c => c.target).filter(Boolean);
      let chosenTarget = null;
      if (nonNullTargets.length) {
        const nonSendout = nonNullTargets.filter(t => String(t || '').toLowerCase() !== 'sendout');
        const consider = nonSendout.length ? nonSendout : nonNullTargets;
        let bestIdx = Infinity;
        for (const tgt of consider) {
          const idx = AREAS.indexOf(tgt);
          if (idx >= 0 && idx < bestIdx) { bestIdx = idx; chosenTarget = tgt; }
        }
      }

      for (const c of candidates) {
        try {
          const t = c.test;
          const label = String(t.testType || '').toLowerCase();
          const isSampleOnDemand = /fecal|pregnan|fob|urinal|fecalysis|fecal-occult-blood|pregnancy/.test(label) ||
                                  (Array.isArray(t.requestedTests) && t.requestedTests.some(rr => rr && /(fecal|pregnan|fob|urinal|pregnancy|fecalysis)/i.test(String(rr.label || ''))));
          let targ;
          if (String(c.target || '').toLowerCase() === 'sendout') {
            targ = 'Sendout';
          } else if (chosenTarget && c.target === chosenTarget) {
            targ = chosenTarget;
          } else if (isSampleOnDemand) {
            targ = 'Awaiting';
          } else if (c.target) {
            targ = 'Pending';
          } else {
            targ = 'In Progress';
          }
          t.addStatusEntry({ from: t.status, to: targ, user: req.session && req.session.user ? req.session.user.username : null, area: targ, timestamp: (new Date()).toISOString() });
          t.status = targ;
          await t.save();
          processed.push(t.testId || t.id);
          try { sseEmitter.emit('update', { action: 'complete', testId: t.testId, status: t.status, patient: t.patient, time: (new Date()).toISOString() }); } catch (e) { console.warn('SSE emit failed', e); }
        } catch (e) { console.warn('Failed saving processed test in Payment Area complete', e); }
      }

      // Record payment amounts on the patient
      try {
        const patientObj = await Patient.findById(patientId);
        if (patientObj) {
          const clin = Number(amount_clinical || 0) || 0;
          const xray = Number(amount_xray || 0) || 0;
          const entry = {
            timestamp: (new Date()).toISOString(),
            area: 'Payment Area',
            clinical: clin,
            xray: xray,
            total: clin + xray,
            tests: ids.slice()
          };
          patientObj.paymentHistory = Array.isArray(patientObj.paymentHistory) ? patientObj.paymentHistory : [];
          patientObj.paymentHistory.push(entry);
          await patientObj.save();
        }
      } catch (e) { console.warn('Failed recording patient paymentHistory', e); }

    } else {
      // Non-payment area completion:
      // 1. Identify tests that belong to the currently completed area
      const currentAreaTests = [];
      const remainingTests = [];

      for (const t of allPatientTests) {
        if (!t) continue;
        const mapped = mapAreaForTest(t);
        const matchArea = mapped === area || t.status === area;

        if (matchArea) {
          currentAreaTests.push(t);
        } else {
          remainingTests.push(t);
        }
      }

      const isDoctorArea = String(area || '').toLowerCase().includes("doctor's check-up");
      const isReleasingArea = String(area || '') === 'Releasing of Result';

      // 2. Mark the current area tests as completed / in progress / released / checked
      for (const t of currentAreaTests) {
        try {
          let nextStatus;
          if (isReleasingArea) {
            nextStatus = 'Released';
            t.released = true;
            if (!t.completedAt) t.completedAt = (new Date()).toISOString();
          } else if (isDoctorArea) {
            nextStatus = 'Checked';
          } else {
            nextStatus = 'In Progress';
          }

          t.addStatusEntry({ from: t.status, to: nextStatus, user: req.session && req.session.user ? req.session.user.username : null, area: nextStatus, timestamp: (new Date()).toISOString() });
          t.status = nextStatus;
          await t.save();
          processed.push(t.testId || t.id);
          try {
            sseEmitter.emit('update', { action: isReleasingArea ? 'release' : 'complete', testId: t.testId, status: t.status, patient: t.patient, time: (new Date()).toISOString() });
          } catch (e) { console.warn('SSE emit failed', e); }
        } catch (e) { console.warn('Failed updating current area test', e); }
      }

      // 3. Inspect remaining active tests for this patient to advance to the next pipeline station
      const currentIdx = AREAS.indexOf(area);
      let chosenNextArea = null;
      let bestNextIdx = Infinity;

      for (const t of remainingTests) {
        if (!t || t.released || t.status === 'Released' || t.status === 'Checked' || t.status === 'Completed') continue;

        // Check target areas for this test
        const reqAreas = [];
        try {
          const directTarget = getTargetAreaForTest(t);
          if (directTarget) reqAreas.push(directTarget);
          const rlist = Array.isArray(t.requestedTests) ? t.requestedTests : [];
          for (const rr of rlist) {
            const a = getTargetAreaForRequest(rr);
            if (a) reqAreas.push(a);
          }
        } catch (e) {}

        const uniqAreas = Array.from(new Set(reqAreas));
        for (const cand of uniqAreas) {
          const idx = AREAS.indexOf(cand);
          if (idx > currentIdx && idx < bestNextIdx) {
            bestNextIdx = idx;
            chosenNextArea = cand;
          }
        }
      }

      // 4. If a subsequent area is found in the pipeline, advance candidate tests to that area
      for (const t of remainingTests) {
        if (!t || t.released || t.status === 'Released' || t.status === 'Checked' || t.status === 'Completed') continue;
        try {
          const label = String(t.testType || '').toLowerCase();
          const isSampleOnDemand = /fecal|pregnan|fob|urinal|fecalysis|fecal-occult-blood|pregnancy/.test(label) ||
                                  (Array.isArray(t.requestedTests) && t.requestedTests.some(rr => rr && /(fecal|pregnan|fob|urinal|pregnancy|fecalysis)/i.test(String(rr.label || ''))));
          const directTarget = getTargetAreaForTest(t);

          if (chosenNextArea && directTarget === chosenNextArea) {
            t.addStatusEntry({ from: t.status, to: chosenNextArea, user: req.session && req.session.user ? req.session.user.username : null, area: chosenNextArea, timestamp: (new Date()).toISOString() });
            t.status = chosenNextArea;
            await t.save();
            processed.push(t.testId || t.id);
            try { sseEmitter.emit('update', { action: 'complete', testId: t.testId, status: t.status, patient: t.patient, time: (new Date()).toISOString() }); } catch (e) {}
          } else if (t.status === 'Payment Area' || !t.status) {
            // Any lingering Payment Area tests are moved out of Payment Area so patient never gets stuck
            const fallbackStatus = isSampleOnDemand ? 'Awaiting' : (directTarget ? 'Pending' : 'In Progress');
            t.addStatusEntry({ from: t.status, to: fallbackStatus, user: req.session && req.session.user ? req.session.user.username : null, area: fallbackStatus, timestamp: (new Date()).toISOString() });
            t.status = fallbackStatus;
            await t.save();
            processed.push(t.testId || t.id);
            try { sseEmitter.emit('update', { action: 'complete', testId: t.testId, status: t.status, patient: t.patient, time: (new Date()).toISOString() }); } catch (e) {}
          }
        } catch (e) { console.warn('Failed advancing remaining test', e); }
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
    let deleted = await Test.findByIdAndDelete(testId);
    if (!deleted) {
      const found = await Test.findOne({ testId: testId });
      if (found) deleted = await Test.findByIdAndDelete(found.id);
    }
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
