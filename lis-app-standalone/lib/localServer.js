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
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');
const { createOfflineDb } = require('./offlineDb');

function createLocalServer(pageCache, operationQueue, config, dataStore) {
  const app = express();

  /* ── View engine ──────────────────────────────────────────────── */
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));

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

  /* ── Make flash messages & user available to all views ─────────── */
  app.use((req, res, next) => {
    res.locals.success_msg = req.flash('success_msg');
    res.locals.error_msg = req.flash('error_msg');
    res.locals.user = req.session && req.session.user ? req.session.user : null;
    // Offline indicator for views
    res.locals.offlineMode = true;
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

  return server;
}

module.exports = { createLocalServer };
