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

  /* ── Auto-login state (set by main process for seamless transitions) ── */
  let _autoLoginEmail = null;

  /* ── View engine ──────────────────────────────────────────────── */
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.use(expressLayouts);  // wraps views in layout.ejs (sidebar, CSS, etc.)
  app.set('layout', 'layout');
  app.set('layout extractScripts', true);
  app.set('layout extractStyles', true);

  /* ── Body parsers ─────────────────────────────────────────────── */
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  /* ── Static assets (served from copied server assets) ─────────── */
  app.use('/assets', express.static(path.join(__dirname, '..', 'server-assets')));
  app.use(express.static(path.join(__dirname, '..', 'server-public')));

  /* ── Session + flash ──────────────────────────────────────────── */
  app.use(session({
    secret: 'lis-offline-standalone-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 24 * 60 * 60 * 1000 }, // 24h
  }));
  app.use(flash());

  /* ── CORS middleware ──────────────────────────────────────────── */
  app.use((req, res, next) => {
    try {
      const origin = req.get('Origin') || '';
      const allowed = [];
      if (config && config.SERVER_URL) allowed.push(config.SERVER_URL.replace(/\/$/, ''));
      allowed.push(`http://127.0.0.1:${config.LOCAL_PORT}`);
      const allowOrigin = allowed.includes(origin) ? origin : '*';
      res.setHeader('Access-Control-Allow-Origin', allowOrigin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
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
  app.locals.featureFlags = { tests: true, reports: true, templates: true, users: true, worksheet: true };

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

  /* ── Auto-login middleware — seamlessly restore session on offline
   *  transition so the user doesn't see a login page when the server
   *  goes down. The main process sets _autoLoginEmail via
   *  server.setAutoLoginEmail(email). ──────────────────────────────── */
  app.use((req, res, next) => {
    try {
      if (_autoLoginEmail && req.session && !req.session.user) {
        const users = global.db && global.db.getUsers ? global.db.getUsers() : [];
        const user = users.find(u => u.email && u.email.toLowerCase() === _autoLoginEmail.toLowerCase());
        if (user) {
          req.session.user = {
            id: user.id || user.email,
            name: user.name || user.email,
            email: user.email,
            role: user.role || 'User',
            permissions: user.permissions || {},
            signature: user.signature || null,
            licenseNumber: user.licenseNumber || '',
          };
          console.log('[LocalServer] auto-login:', user.email);
        }
      }
    } catch (e) { /* ignore auto-login errors */ }
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
      // Skip export/sync endpoints
      if (reqPath.startsWith('/export/')) return next();

      // Build the real server URL for this request
      const base = config.SERVER_URL.replace(/\/$/, '');
      const serverUrl = base + reqPath;

      // Queue with the request body for later replay
      if (operationQueue) {
        operationQueue.add({
          method: 'POST', // HTML forms always POST with ?_method for PUT/DELETE
          url: serverUrl,
          body: req.body || {},
          timestamp: new Date().toISOString(),
        });
        console.log('[LocalServer] queued mutation for server:', req.method, reqPath);
      }
    } catch (e) {
      console.error('[LocalServer] mutation queue error:', e && e.message);
    }
    next();
  });

  /* ── Clear auto-login on explicit logout ───────────────────────── */
  app.post('/logout', (req, res, next) => {
    _autoLoginEmail = null;
    next(); // let the real logout route handle session destroy + redirect
  });

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
    // Read from environment or DataStore settings (fallback to empty)
    const d1 = process.env.DOCTOR_1_NAME || '';
    const d2 = process.env.DOCTOR_2_NAME || '';
    res.locals.DOCTOR_1_NAME = d1;
    res.locals.DOCTOR_2_NAME = d2;
    const areas = [];
    if (d1) areas.push("Doctor's Check-up - " + d1);
    if (d2) areas.push("Doctor's Check-up - " + d2);
    res.locals.DOCTOR_AREAS = areas;
    next();
  });

  /* ── Wire up global.db so route models can use it ─────────────── */
  if (dataStore) {
    const offlineDb = createOfflineDb(dataStore);
    global.db = offlineDb;
  }

  /* ── SSE shim (no-op while offline) ───────────────────────────── */
  app.get('/reception/assigned-events', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.write('data: {"type":"connected","offline":true}\n\n');
    // Keep connection open but don't send events
    const interval = setInterval(() => {
      try { res.write(': keepalive\n\n'); } catch (e) { clearInterval(interval); }
    }, 30000);
    req.on('close', () => clearInterval(interval));
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
        };
        return res.json(out);
      } catch (e) { return res.status(500).send('datastore-error'); }
    });
  }

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

  return server;
}

module.exports = { createLocalServer };
