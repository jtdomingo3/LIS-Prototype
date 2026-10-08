/**
 * LocalServer — Full offline Express server for the standalone Electron app.
 *
 * When the real server is unreachable, this local server renders the same
 * EJS views using data from the DataStore (Documents/LIS/app_sync/data.json).
 * It supports:
 *   - Session-based authentication (login/logout using downloaded user accounts)
 *   - All main routes: dashboard, patients, reception, tests, reports, etc.
 *   - Mutation queueing: POST/PUT/DELETE operations are saved to the
 *     OperationQueue for replay when the connection is restored.
 */
const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');
const { createOfflineDb } = require('./offlineDb');

function createLocalServer(pageCache, operationQueue, config, dataStore) {
  const app = express();
  app.locals.config = config;
  app.locals.dataStore = dataStore;
  app.locals.operationQueue = operationQueue;

  /* ── Auto-login state (set by main process for seamless transitions) ── */
  let _autoLoginEmail = null;

  /* ── View engine ──────────────────────────────────────────────── */
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.use(expressLayouts);  // wraps views in layout.ejs (sidebar, CSS, etc.)
  app.set('layout', 'layout');
  app.set('layout extractScripts', true);
  app.set('layout extractStyles', true);

  /* ── Body parsers (50mb limit for large sync payloads and signatures) ─ */
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));
  app.use(express.json({ limit: '50mb' }));

  // Support HTML form method overrides (POST with ?_method=PUT/DELETE or hidden _method field)
  try {
    const methodOverride = require('method-override');
    app.use(methodOverride('_method'));
  } catch (e) {
    console.warn('[LocalServer] method-override not available:', e && e.message);
  }

  /* ── Static assets (served from copied server assets) ─────────── */
  const staticCacheOpts = {
    maxAge: '1d',
    etag: true,
    lastModified: true
  };
  app.use('/assets', express.static(path.join(__dirname, '..', 'server-assets'), staticCacheOpts));
  app.use('/assets', express.static(path.join(__dirname, '..', 'assets'), staticCacheOpts));
  app.use(express.static(path.join(__dirname, '..', 'public'), staticCacheOpts));
  app.use(express.static(path.join(__dirname, '..', 'server-public'), staticCacheOpts));
  try {
    const hrDocsDir = path.join(require('./dataPath').getDataDir(), 'hr-documents');
    app.use('/hr-documents', express.static(hrDocsDir, staticCacheOpts));
  } catch (e) {}

  /* ── Session + flash ──────────────────────────────────────────── */
  app.use(session({
    secret: 'lis-offline-standalone-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }, // 24h
  }));
  app.use(flash());

  /* ── Sensitive payload sanitizer for logging ──────────────────── */
  function maskSensitive(obj) {
    const SENSITIVE = new Set([
      'password','pwd','pass','confirmpassword','confirm_password','passwordconfirm',
      'token','authtoken','bearer','authorization','hash','synchash','x-lis-sync-hash','secret'
    ]);
    if (obj == null) return obj;
    if (Array.isArray(obj)) return obj.map(v => maskSensitive(v));
    if (typeof obj === 'object') {
      const out = {};
      for (const k of Object.keys(obj)) {
        if (SENSITIVE.has(k.toLowerCase())) out[k] = '[FILTERED]';
        else out[k] = maskSensitive(obj[k]);
      }
      return out;
    }
    return obj;
  }

  /* ── Security headers & CORS middleware ────────────────────────── */
  app.use((req, res, next) => {
    // Standard defensive HTTP security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-Download-Options', 'noopen');
    res.setHeader('X-XSS-Protection', '1; mode=block');

    try {
      const origin = req.get('Origin') || '';
      const allowed = [];
      if (config && config.SERVER_URL) allowed.push(config.SERVER_URL.replace(/\/$/, ''));
      allowed.push(`http://127.0.0.1:${config.LOCAL_PORT}`);
      allowed.push(`http://localhost:${config.LOCAL_PORT}`);

      if (origin && allowed.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
      }
      if (req.method === 'OPTIONS') return res.sendStatus(204);
    } catch (e) { /* ignore */ }
    next();
  });

  /* ── Pre-compute inline logo as base64 data URI ───────────────── */
  try {
    const _logoBuffer = require('fs').readFileSync(path.join(__dirname, '..', 'server-assets', 'gezyne-logo.png'));
    app.locals.inlineLogo = 'data:image/png;base64,' + _logoBuffer.toString('base64');
  } catch (e) {
    app.locals.inlineLogo = '/assets/gezyne-logo.png';
  }

  /* ── Feature flags (match server defaults) ─────────────────────── */
  app.locals.featureFlags = { tests: true, reports: true, templates: true, users: true, worksheet: true, inventory: true, equipment: true };

  // Expose useful objects to route handlers (operationQueue, dataStore, config)
  try {
    app.locals.operationQueue = operationQueue;
  } catch (e) {}
  try {
    app.locals.dataStore = dataStore;
  } catch (e) {}
  try {
    app.locals.config = config;
  } catch (e) {}

  /* ── Result highlighting helper (used by report templates) ─────── */
  function escapeHtml(str) {
    if (str == null) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function highlightResult(text) {
    if (text == null) return '';
    var s = String(text);
    var containsTags = /<\/?[a-z][\s\S]*>/i.test(s);
    if (!containsTags) {
      var out = escapeHtml(s);
      out = out.replace(/\b(Positive|Reactive|trace)\b/gi, function(m){ return '<span class="result-highlight">'+m+'</span>'; });
      out = out.replace(/(\+{1,4})/g, function(m){ return '<span class="result-highlight">'+m+'</span>'; });
      return out;
    }
    var escaped = s;
    escaped = escaped.replace(/\b(Positive|Reactive|trace)\b/gi, function(m){ return '<span class="result-highlight">'+m+'</span>'; });
    escaped = escaped.replace(/(\+{1,4})/g, function(m){ return '<span class="result-highlight">'+m+'</span>'; });
    return escaped;
  }

  /* ── Universal Philippine date formatter (MM/DD/YYYY) ───────────── */
  function formatMMDDYYYY(d) {
    if (!d) return '';
    if (typeof d === 'string') {
      const s = d.trim();
      const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (m) {
        return String(m[2]).padStart(2, '0') + '/' + String(m[3]).padStart(2, '0') + '/' + m[1];
      }
    }
    const dt = (d instanceof Date) ? d : new Date(d);
    if (isNaN(dt.getTime())) return String(d);
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return mm + '/' + dd + '/' + dt.getFullYear();
  }
  app.locals.formatMMDDYYYY = formatMMDDYYYY;
  app.locals.formatMMDDYY = formatMMDDYYYY;
  app.locals.formatDate = formatMMDDYYYY;

  /* ── User session bridge for active logged-in user ────────────────── */
  app.use((req, res, next) => {
    try {
      const p = req.path || '';
      // NEVER auto-login on authentication endpoints, root login page, or logout
      if (p === '/' || p === '/login' || p === '/logout' || p.startsWith('/api/auth')) {
        return next();
      }
      if (_autoLoginEmail && req.session && !req.session.user) {
        const users = global.db && global.db.getUsers ? global.db.getUsers() : [];
        const user = users.find(u => u.email && u.email.toLowerCase() === _autoLoginEmail.toLowerCase());
        if (user) {
          req.session.user = {
            id: user.id || user.email,
            name: user.name || user.email,
            email: user.email,
            password: user.password || null,
            role: user.role || 'User',
            permissions: user.permissions || {},
            signature: user.signature || null,
            licenseNumber: user.licenseNumber || '',
          };
        }
      }
    } catch (e) { }
    next();
  });

  /* ── Mutation queueing middleware ─────────────────────────────────
   *  When the user makes changes on the local server (offline), we
   *  need to queue the same mutation for replay to the real server
   *  when connectivity is restored.  This captures POST/PUT/DELETE
   *  requests (excluding auth routes) and adds them to the operation
   *  queue with the real server URL.
   * ──────────────────────────────────────────────────────────────── */
  app.use((req, res, next) => {
    try {
      // Only queue mutations (POST/PUT/DELETE)
      if (req.method === 'GET' || req.method === 'OPTIONS' || req.method === 'HEAD') return next();
      // Need a server URL to construct the replay target
      if (!config || !config.SERVER_URL) return next();
      // Skip auth routes — login/logout are local-only
      const reqPath = req.path || req.url || '';
      if (reqPath === '/' || reqPath === '/login' || reqPath === '/logout') return next();
      // Skip API endpoints — authentication tokens, signature sync, and security probes must never be queued
      if (reqPath.startsWith('/api/')) return next();
      // Skip export/sync endpoints
      if (reqPath.startsWith('/export/')) return next();
      // Skip local settings sync-from-server trigger (it pulls from server, not an outbound mutation)
      if (reqPath === '/settings/sync-from-server') return next();
      // Skip print operations (thermal receipts, printer tests) - physical hardware actions on local client
      if (reqPath.endsWith('/print') || reqPath.includes('/thermal-print') || reqPath.includes('/test-print')) return next();
      // Skip report generation/download/preview operations — read-only export triggers
      if (reqPath.startsWith('/reports/') && (reqPath.includes('/download') || reqPath.includes('/preview'))) return next();
      // Skip settings tests and maintenance operations
      if (reqPath.startsWith('/settings/') && (reqPath.includes('test-') || reqPath.includes('backup') || reqPath.includes('restore') || reqPath.includes('clear'))) return next();
      // Skip chatbot routes — interactive AI queries are live-proxied to server directly
      if (reqPath.startsWith('/chatbot')) return next();

      // Build the real server URL for this request preserving query parameters
      const base = config.SERVER_URL.replace(/\/$/, '');
      const queryString = (req.originalUrl && req.originalUrl.includes('?')) ? ('?' + req.originalUrl.split('?')[1]) : '';
      const serverUrl = base + req.path + queryString;
      const effectiveMethod = (req.query && req.query._method) ? req.query._method.toUpperCase() : (req.method || 'POST');

      // Ensure a deterministic client-generated id and UUID for offline-created records
      if (req.body) {
        if (!req.body.id && reqPath === '/patients' && req.method === 'POST') {
          try { req.body.id = require('crypto').randomUUID(); } catch (e) { req.body.id = 'pat-' + Date.now(); }
        }
        if (!req.body.id && (reqPath === '/inventory' || /^\/inventory\/[^/]+\/batch$/.test(reqPath)) && req.method === 'POST') {
          try { req.body.id = require('crypto').randomUUID(); } catch (e) { req.body.id = 'inv-' + Date.now(); }
        }
        if (!req.body.id && (reqPath === '/equipment' || /^\/equipment\//.test(reqPath)) && req.method === 'POST') {
          try { req.body.id = require('crypto').randomUUID(); } catch (e) { req.body.id = 'eq-' + Date.now(); }
        }
        if (!req.body.id && reqPath.startsWith('/consultations') && req.method === 'POST') {
          try { req.body.id = require('crypto').randomUUID(); } catch (e) { req.body.id = 'con-' + Date.now(); }
        }
        if (!req.body.id && (reqPath.startsWith('/costing') || reqPath.startsWith('/hr')) && req.method === 'POST') {
          try { req.body.id = require('crypto').randomUUID(); } catch (e) { req.body.id = 'rec-' + Date.now(); }
        }
        if (!req.body.id && reqPath.startsWith('/philhealth') && req.method === 'POST') {
          try { req.body.id = require('crypto').randomUUID(); } catch (e) { req.body.id = 'ph-' + Date.now(); }
        }
        if (!req.body.id && reqPath.startsWith('/healthcard') && req.method === 'POST') {
          try { req.body.id = require('crypto').randomUUID(); } catch (e) { req.body.id = 'hc-' + Date.now(); }
        }
        if (!req.body.client_id) {
          try { req.body.client_id = require('crypto').randomUUID(); } catch (e) { req.body.client_id = 'cli-' + Date.now(); }
        }
      }
      // Queue with the request body for later replay
      if (operationQueue) {
        const entry = operationQueue.add({
          method: effectiveMethod,
          url: serverUrl,
          body: req.body || {},
          timestamp: new Date().toISOString(),
        });
        console.log('[LocalServer] queued mutation for server:', effectiveMethod, serverUrl, req.body && req.body.id ? ('id=' + req.body.id) : '');

        // If creating tests, hook response finish to attach created test definitions to the queued op
        if (reqPath === '/tests' && req.method === 'POST' && entry) {
          const patientIdForTests = req.body && req.body.patient;
          const origEnd = res.end;
          res.end = function(...args) {
            try {
              if (global.db && patientIdForTests) {
                const allTests = (typeof global.db.getTests === 'function' ? global.db.getTests() : []) || [];
                const patientTests = allTests.filter(t => t && String(t.patient) === String(patientIdForTests));
                if (patientTests.length) {
                  entry.body.createdTests = JSON.stringify(patientTests.map(t => ({
                    id: t.id,
                    testId: t.testId,
                    testType: t.testType,
                    status: t.status,
                    patient: t.patient,
                    requestedTests: t.requestedTests,
                    specimenNumbers: t.specimenNumbers,
                    assignedDoctorId: t.assignedDoctorId,
                    assignedDoctorName: t.assignedDoctorName,
                    priority: t.priority,
                    notes: t.notes,
                    results: t.results,
                    client_id: t.client_id || t.id
                  })));
                  operationQueue._save();
                }
              }
            } catch (e) {}
            return origEnd.apply(this, args);
          };
        }
      }
    } catch (e) {
      console.error('[LocalServer] mutation queue error:', e && e.message);
    }
    next();
  });

  /* ── Clear auto-login on explicit logout ───────────────────────── */
  const clearAutoLogin = (req, res, next) => {
    _autoLoginEmail = null;
    next();
  };
  app.get('/logout', clearAutoLogin);
  app.post('/logout', clearAutoLogin);
  app.all('/logout', clearAutoLogin);
  app.locals.clearAutoLogin = () => { _autoLoginEmail = null; };

  /* ── Make flash messages & user available to all views ─────────── */
  app.use((req, res, next) => {
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg = req.flash('error_msg');
    res.locals.error = req.flash('error');
    const sessionUser = req.session && req.session.user ? req.session.user : null;
    res.locals.user = sessionUser;
    // layout.ejs checks `sessionUser` for the sidebar navigation
    res.locals.sessionUser = sessionUser;
    // Offline indicator for views
    res.locals.offlineMode = true;
    // Feature flags
    const sessionFlags = (req.session && req.session.featureFlags) ? req.session.featureFlags : {};
    res.locals.featureFlags = Object.assign({}, app.locals.featureFlags, sessionFlags);
    res.locals.backupConfig = { enabled: false, frequency: 'daily', path: '' };
    // expose highlight helper used by report templates
    try { res.locals.hl = highlightResult; } catch (e) { /* ignore */ }
    res.locals.formatMMDDYYYY = formatMMDDYYYY;
    res.locals.formatMMDDYY = formatMMDDYYYY;
    res.locals.formatDate = formatMMDDYYYY;
    next();
  });

  /* ── Expose all users to views (for signatory dropdowns etc.) ──── */
  app.use((req, res, next) => {
    try {
      const users = global.db && global.db.getUsers ? global.db.getUsers() : [];
      res.locals.allUsers = (users || []).map(u => ({
        id: u.id || u.email, name: u.name || u.email, email: u.email,
        role: u.role || '', licenseNumber: u.licenseNumber || ''
      }));
    } catch (e) { res.locals.allUsers = []; }
    next();
  });

  /* ── Expose doctor names & areas to views ──────────────────────── */
  app.use((req, res, next) => {
    // Read from environment or DataStore settings (fallback to clean defaults)
    let d1 = (process.env.DOCTOR_1_NAME || '').trim();
    let d2 = (process.env.DOCTOR_2_NAME || '').trim();
    try {
      const s = (dataStore && typeof dataStore.getSettings === 'function' ? dataStore.getSettings() : (global.db && typeof global.db.getSettings === 'function' ? global.db.getSettings() : null)) || null;
      if (s && s.doctor1Name) d1 = s.doctor1Name.trim();
      if (s && s.doctor2Name) d2 = s.doctor2Name.trim();
    } catch (_) {}
    d1 = d1 || 'Dr. Lorenzo';
    d2 = d2 || 'Dr. Arcilla';
    res.locals.DOCTOR_1_NAME = d1;
    res.locals.DOCTOR_2_NAME = d2;
    const areas = [];
    if (d1) areas.push("Doctor's Check-up - " + d1);
    if (d2 && d2 !== d1) areas.push("Doctor's Check-up - " + d2);
    res.locals.DOCTOR_AREAS = areas;
    next();
  });

  /* ── Wire up global.db so route models can use it ─────────────── */
  if (dataStore) {
    const offlineDb = createOfflineDb(dataStore);
    global.db = offlineDb;
  }

  /* ── Active SSE Broadcaster for local windows & kiosk ───────── */
  const localSseClients = new Set();

  function broadcastEvent(eventData) {
    if (!eventData) return;
    const payload = `data: ${JSON.stringify(eventData)}\n\n`;
    for (const client of localSseClients) {
      try {
        client.write(payload);
      } catch (e) {
        localSseClients.delete(client);
      }
    }
  }

  // Attach global broadcaster and wire sseEmitter so route actions trigger local SSE
  global.broadcastLocalEvent = broadcastEvent;
  try {
    const sseEmitter = require('./sseEmitter');
    sseEmitter.on('update', (payload) => {
      broadcastEvent(payload);
    });
  } catch (e) {
    console.warn('[LocalServer] failed to wire sseEmitter:', e && e.message);
  }

  app.get('/reception/assigned-events', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });

    localSseClients.add(res);
    res.write(': sse-connected-local\n\n');
    res.write('data: {"init":true,"connected":true}\n\n');

    // Keep connection alive with periodic heartbeat
    const interval = setInterval(() => {
      try { res.write(': keepalive\n\n'); } catch (e) { clearInterval(interval); }
    }, 25000);

    req.on('close', () => {
      clearInterval(interval);
      localSseClients.delete(res);
    });
  });

  /* ── Export endpoint (JSON API for DataStore data) ────────────── */
  if (dataStore) {
    app.get('/export/data.json', (req, res) => {
      try {
        const out = {
          users: dataStore.getCollection('users') || [],
          patients: dataStore.getCollection('patients') || [],
          tests: dataStore.getCollection('tests') || [],
          templates: dataStore.getCollection('templates') || [],
          counters: dataStore._data.counters || {},
          inventory: dataStore.getCollection('inventory') || [],
          inventory_batches: dataStore.getCollection('inventory_batches') || [],
          inventory_transactions: dataStore.getCollection('inventory_transactions') || [],
          equipment: dataStore.getCollection('equipment') || [],
          equipment_logs: dataStore.getCollection('equipment_logs') || [],
          qc_controls: dataStore.getCollection('qc_controls') || [],
          qc_entries: dataStore.getCollection('qc_entries') || [],
          neqas_records: dataStore.getCollection('neqas_records') || [],
          consultations: dataStore.getCollection('consultations') || (typeof global.db.getConsultations === 'function' ? global.db.getConsultations() : []) || [],
          expenses: dataStore.getCollection('expenses') || [],
          revenue_entries: dataStore.getCollection('revenue_entries') || [],
          cost_per_test: dataStore.getCollection('cost_per_test') || [],
          employees: dataStore.getCollection('employees') || [],
          payroll_records: dataStore.getCollection('payroll_records') || [],
          hr_documents: dataStore.getCollection('hr_documents') || [],
          leave_records: dataStore.getCollection('leave_records') || [],
          dtr_records: dataStore.getCollection('dtr_records') || [],
          philhealth_records: dataStore.getCollection('philhealth_records') || (typeof global.db.getPhilhealthRecords === 'function' ? global.db.getPhilhealthRecords() : []) || [],
          healthcard_records: dataStore.getCollection('healthcard_records') || (typeof global.db.getHealthCardRecords === 'function' ? global.db.getHealthCardRecords() : []) || []
        };
        return res.json(out);
      } catch (e) { return res.status(500).send('datastore-error'); }
    });
  }

  /* ══════════════════════════════════════════════════════════════
   *  Authorization & Route Permission Guard
   * ══════════════════════════════════════════════════════════════ */
  const routePermissionMap = [
    { prefix: '/dashboard', perm: 'dashboard' },
    { prefix: '/patients', perm: 'patients' },
    { prefix: '/reception', perm: 'reception' },
    { prefix: '/philhealth', perm: 'philhealth' },
    { prefix: '/healthcard', perm: 'philhealth' },
    { prefix: '/consultations', perm: 'reception' },
    { prefix: '/tests', perm: 'tests' },
    { prefix: '/reports', perm: 'reports' },
    { prefix: '/templates', perm: 'templates' },
    { prefix: '/inventory', perm: 'inventory' },
    { prefix: '/equipment', perm: 'equipment' },
    { prefix: '/users', perm: 'users' },
    { prefix: '/worksheet', perm: 'worksheet' },
    { prefix: '/costing', perm: 'costing' },
    { prefix: '/hr', perm: 'hr' }
  ];

  app.use((req, res, next) => {
    try {
      const path = req.originalUrl || req.url || '';
      const mapping = routePermissionMap.find(m => path.indexOf(m.prefix) === 0);

      if (!mapping) return next();

      // Allow users to access their own profile
      if (path.indexOf('/users/profile') === 0) return next();

      // Allow authenticated users to check critical inventory alerts for global notification
      if (path.indexOf('/inventory/critical-check') === 0) return next();

      // Allow public auth routes
      if (path === '/' || path.indexOf('/login') === 0) return next();

      const sessionUser = req.session && req.session.user;
      if (!sessionUser) {
        req.flash('error_msg', 'Please login to access that page');
        return res.redirect('/');
      }

      let perms = sessionUser.permissions || {};
      if (typeof perms === 'string') {
        try { perms = JSON.parse(perms); } catch (_) { perms = {}; }
      }
      const managementRoles = new Set(['Admin', 'Manager', 'Owner']);
      const isManagement = managementRoles.has(sessionUser.role);

      if (mapping.perm === 'dashboard') {
        if (isManagement || perms.dashboard) return next();
        const { getUserHomeRoute } = require('../middleware/auth');
        const target = getUserHomeRoute(sessionUser);
        return res.redirect(target !== '/dashboard' ? target : '/reception');
      }

      if (sessionUser.role === 'Admin') return next();

      if (perms[mapping.perm] || (mapping.perm === 'equipment' && perms.inventory) || (mapping.perm === 'philhealth' && (perms.philhealth || perms.healthcard || perms.reception))) return next();

      // Role-based baseline workflow access for laboratory personnel (templates and inventory require explicit permission)
      const labRoles = new Set(['Medical Technologist', 'MedTech', 'Technician', 'Doctor', 'Staff', 'Receptionist', 'Encoder']);
      if (labRoles.has(sessionUser.role)) {
        if (['reception', 'patients', 'tests', 'reports', 'worksheet', 'equipment', 'philhealth'].includes(mapping.perm)) {
          return next();
        }
      }

      if (req.flash) req.flash('error_msg', 'You do not have permission to access that page');
      const { getUserHomeRoute } = require('../middleware/auth');
      const target = getUserHomeRoute(sessionUser);
      return res.redirect(target === path ? '/users/profile' : target);
    } catch (e) {
      return next();
    }
  });

  /* ══════════════════════════════════════════════════════════════
   *  Mount the real server routes
   *  They use global.db + models (which read global.db) so they
   *  work transparently with our DataStore-backed shim.
   * ══════════════════════════════════════════════════════════════ */
  try {
    const authRoutes = require('../routes/auth');
    app.use('/', authRoutes);
  } catch (e) { console.error('[LocalServer] failed to load auth routes:', e && e.message); }

  try {
    const dashboardRoutes = require('../routes/dashboard');
    app.use('/dashboard', dashboardRoutes);
  } catch (e) { console.error('[LocalServer] failed to load dashboard routes:', e && e.message); }

  try {
    const patientRoutes = require('../routes/patients');
    app.use('/patients', patientRoutes);
  } catch (e) { console.error('[LocalServer] failed to load patient routes:', e && e.message); }

  try {
    const receptionRoutes = require('../routes/reception');
    app.use('/reception', receptionRoutes);
  } catch (e) { console.error('[LocalServer] failed to load reception routes:', e && e.message); }

  try {
    const philhealthRoutes = require('../routes/philhealth');
    app.use('/philhealth', philhealthRoutes);
  } catch (e) { console.error('[LocalServer] failed to load philhealth routes:', e && e.message); }

  try {
    const healthcardRoutes = require('../routes/healthcard');
    app.use('/healthcard', healthcardRoutes);
  } catch (e) { console.error('[LocalServer] failed to load healthcard routes:', e && e.message); }

  try {
    const consultationRoutes = require('../routes/consultations');
    app.use('/consultations', consultationRoutes);
  } catch (e) { console.error('[LocalServer] failed to load consultation routes:', e && e.message); }

  try {
    const testRoutes = require('../routes/tests');
    app.use('/tests', testRoutes);
  } catch (e) { console.error('[LocalServer] failed to load test routes:', e && e.message); }

  try {
    const reportRoutes = require('../routes/reports');
    app.use('/reports', reportRoutes);
  } catch (e) { console.error('[LocalServer] failed to load report routes:', e && e.message); }

  try {
    const templateRoutes = require('../routes/templates');
    app.use('/templates', templateRoutes);
  } catch (e) { console.error('[LocalServer] failed to load template routes:', e && e.message); }

  try {
    const inventoryRoutes = require('../routes/inventory');
    app.use('/inventory', inventoryRoutes);
  } catch (e) { console.error('[LocalServer] failed to load inventory routes:', e && e.message); }

  try {
    const equipmentRoutes = require('../routes/equipment');
    app.use('/equipment', equipmentRoutes);
    app.use('/api/equipment', equipmentRoutes);
  } catch (e) { console.error('[LocalServer] failed to load equipment routes:', e && e.message); }

  try {
    const userRoutes = require('../routes/users');
    app.use('/users', userRoutes);
  } catch (e) { console.error('[LocalServer] failed to load user routes:', e && e.message); }

  try {
    const settingsRoutes = require('../routes/settings');
    app.use('/settings', settingsRoutes);
  } catch (e) { console.error('[LocalServer] failed to load settings routes:', e && e.message); }

  try {
    const signaturesRoutes = require('../routes/signatures');
    app.use('/signatures', signaturesRoutes);
  } catch (e) { console.error('[LocalServer] failed to load signatures routes:', e && e.message); }

  try {
    const chatbotRoutes = require('../routes/chatbot');
    app.use('/chatbot', chatbotRoutes);
  } catch (e) { console.error('[LocalServer] failed to load chatbot routes:', e && e.message); }

  try {
    const manualRoutes = require('../routes/manual');
    app.use('/manual', manualRoutes);
  } catch (e) { console.error('[LocalServer] failed to load manual routes:', e && e.message); }

  try {
    const costingRoutes = require('../routes/costing');
    app.use('/costing', costingRoutes);
  } catch (e) { console.error('[LocalServer] failed to load costing routes:', e && e.message); }

  try {
    const hrRoutes = require('../routes/hr');
    app.use('/hr', hrRoutes);
  } catch (e) { console.error('[LocalServer] failed to load hr routes:', e && e.message); }

  /* ── 404 handler ──────────────────────────────────────────────── */
  app.use((req, res) => {
    try {
      res.status(404).render('404', { title: 'Page Not Found' });
    } catch (e) {
      res.status(404).send('Page not found');
    }
  });

  /* ── Error handler ────────────────────────────────────────────── */
  app.use((err, req, res, next) => {
    console.error('[LocalServer] unhandled error:', err && err.stack ? err.stack : err);
    try {
      res.status(500).render('500', { title: 'Server Error', error: err || {} });
    } catch (e) {
      res.status(500).send('Internal Server Error');
    }
  });

  /* ── Start listening (loopback only) ──────────────────────────── */
  const server = app.listen(config.LOCAL_PORT, '127.0.0.1', () => {
    console.log(`[LocalServer] offline server on http://127.0.0.1:${config.LOCAL_PORT}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[LocalServer] port ${config.LOCAL_PORT} in use — retrying on ${config.LOCAL_PORT + 1}`);
      config.LOCAL_PORT++;
      server.listen(config.LOCAL_PORT, '127.0.0.1');
    } else {
      console.error('[LocalServer] error:', err);
    }
  });

  /* ── Expose auto-login setter for main process ────────────────── */
  server.setAutoLoginEmail = (email) => { _autoLoginEmail = email || null; };
  server.getAutoLoginEmail = () => _autoLoginEmail;
  /* ── Expose operationQueue getter for status checks ────────────── */
  server.getOperationQueue = () => operationQueue;
  /* ── Expose live event broadcaster for main/syncEngine ─────────── */
  server.broadcastEvent = broadcastEvent;

  return server;
}

module.exports = { createLocalServer };
