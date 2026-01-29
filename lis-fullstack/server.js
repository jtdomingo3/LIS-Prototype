const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const methodOverride = require('method-override');
const fs = require('fs');
const os = require('os');
const expressLayouts = require('express-ejs-layouts');
const { logReportError } = require('./lib/reportLogger');

const app = express();
const PORT = process.env.PORT || 3000;
// Default host/IP for the server. Override with the HOST env var if needed.
// Default to listening on all interfaces so the server is reachable from other devices on the network.
// If you prefer localhost-only, set HOST=127.0.0.1 before starting.
const HOST = process.env.HOST || '0.0.0.0';
const JSONStore = require('./lib/jsonStore');
// Instantiate JSON-backed store with default options. Set `DATA_ENCRYPTION_KEY` env var to enable AES-256-GCM at-rest encryption (base64 key, 32 bytes).
const store = new JSONStore({ dataDir: __dirname });

// Provide a thin compatibility wrapper matching the previous `db` functions used throughout the app.
const db = {
  // legacy read/write left for completeness (reads full lab+users in memory)
  read: async () => {
    const users = await store.getUsers();
    const lab = await store.getLab();
    return Object.assign({}, { users }, lab);
  },
  write: async (data) => {
    if (data.users) store.saveUsers(data.users);
    const lab = { patients: data.patients || [], tests: data.tests || [], templates: data.templates || [], counters: data.counters || {} };
    store.saveLab(lab);
  },
  // Synchronous getters for compatibility with existing models that expect arrays/objects
  getUsers: () => {
    try {
      const raw = store._readRaw(store.usersFile);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error('Failed to read users synchronously:', e);
      return [];
    }
  },
  getPatients: () => {
    try {
      const raw = store._readRaw(store.labFile);
      const lab = raw ? JSON.parse(raw) : {};
      return lab.patients || [];
    } catch (e) {
      console.error('Failed to read patients synchronously:', e);
      return [];
    }
  },
  getTests: () => {
    try {
      const raw = store._readRaw(store.labFile);
      const lab = raw ? JSON.parse(raw) : {};
      return lab.tests || [];
    } catch (e) {
      console.error('Failed to read tests synchronously:', e);
      return [];
    }
  },
  getTemplates: () => {
    try {
      const raw = store._readRaw(store.labFile);
      const lab = raw ? JSON.parse(raw) : {};
      return lab.templates || [];
    } catch (e) {
      console.error('Failed to read templates synchronously:', e);
      return [];
    }
  },
  getCounters: () => {
    try {
      const raw = store._readRaw(store.labFile);
      const lab = raw ? JSON.parse(raw) : {};
      return lab.counters || {};
    } catch (e) {
      console.error('Failed to read counters synchronously:', e);
      return {};
    }
  },
  saveUsers: (users) => store.saveUsers(users),
  savePatients: (patients) => store.savePatients(patients),
  saveTests: (tests) => store.saveTests(tests),
  saveTemplates: (templates) => store.saveTemplates(templates),
  saveCounters: (counters) => store.saveCounters(counters),
  // expose flush for clean shutdowns/tests
  flushAll: () => store.flushAll()
};

// Make db available globally
global.db = db;

// Startup validation to detect missing runtime files (helps packaged EXE diagnose common problems)
function verifyStartupRequirements() {
  const required = [];
  const optionalWarnings = [];

  const viewsDir = path.join(__dirname, 'views');
  const publicDir = path.join(__dirname, 'public');
  const assetsDir = path.join(__dirname, 'assets');

  if (!fs.existsSync(viewsDir)) required.push({ path: viewsDir, reason: 'EJS views are required to render pages (views folder missing)' });
  const usersFile = path.join(__dirname, 'data-users.json');
  const labFile = path.join(__dirname, 'data-lab.json');
  if (!fs.existsSync(usersFile) || !fs.existsSync(labFile)) required.push({ path: `${usersFile} & ${labFile}`, reason: 'data store files missing; data-users.json/data-lab.json expected (legacy data.json may be migrated)' });
  if (!fs.existsSync(publicDir)) optionalWarnings.push({ path: publicDir, reason: 'static public folder not found; some static assets may be missing' });
  if (!fs.existsSync(assetsDir)) optionalWarnings.push({ path: assetsDir, reason: 'assets folder not found; logos/sounds may be missing' });

  // Check for Puppeteer local Chromium (common packaging issue)
  try {
    const puppeteerPkg = require.resolve('puppeteer');
    const puppeteerChromium = path.join(__dirname, 'node_modules', 'puppeteer', '.local-chromium');
    if (!fs.existsSync(puppeteerChromium)) {
      optionalWarnings.push({ path: puppeteerChromium, reason: 'puppeteer installed but bundled Chromium not found; Puppeteer-based features will fail unless a system browser is used' });
    }
  } catch (e) {
    // puppeteer not installed - that's fine if you don't use it
  }

  if (required.length || optionalWarnings.length) {
    console.error('\n=== LIS Startup Validation ===');
    if (required.length) {
      console.error('\nMissing required files/folders:');
      required.forEach(r => console.error(` - ${r.path}: ${r.reason}`));
      console.error('\nAction: ensure these files/folders exist in the application directory.');
      console.error('If you packaged the app with `pkg`, make sure to include these paths in the `pkg.assets` array or distribute them alongside the EXE.');
    }
    if (optionalWarnings.length) {
      console.warn('\nWarnings:');
      optionalWarnings.forEach(w => console.warn(` - ${w.path}: ${w.reason}`));
      console.warn('\nAction: these may be optional but can affect features. For Puppeteer, install Chromium or configure Puppeteer to use a system browser.');
    }
    console.error('=== End validation ===\n');
  }

  if (required.length) {
    // Exit to avoid the packaged executable failing with an obscure error
    process.exit(1);
  }
}

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));
// Serve assets folder (for notification sounds, logos, etc.)
app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Simple request logger to help debug routes and payloads
app.use((req, res, next) => {
  const now = new Date().toISOString();
  // Redact sensitive fields before logging request bodies
  let safeBody = null;
  try {
    if (req.body && typeof req.body === 'object' && Object.keys(req.body).length) {
      safeBody = JSON.parse(JSON.stringify(req.body));
      const sensitive = ['password', 'pass', 'pwd', 'token', 'authorization', 'auth', 'pin'];
      sensitive.forEach((k) => {
        if (Object.prototype.hasOwnProperty.call(safeBody, k)) safeBody[k] = '[REDACTED]';
      });
    }
  } catch (e) {
    safeBody = '[UNSERIALIZABLE]';
  }

  console.log(
    `[${now}] ${req.method} ${req.originalUrl}` +
      (safeBody && typeof safeBody === 'object' && Object.keys(safeBody).length ? ` body=${JSON.stringify(safeBody)}` : '')
  );
  next();
});

// EJS Layouts - enable the global layout wrapper so views get the
// shared HTML, CSS and JS defined in `views/layout.ejs`.
app.use(expressLayouts);
app.set('layout', 'layout');
// Allow extracting scripts/styles from individual views into the layout
app.set('layout extractScripts', true);
app.set('layout extractStyles', true);

// Session configuration
app.use(session({
  secret: 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true in production with HTTPS
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

app.use(flash());

// Diagnostic: log when reception complete is hit at the top-level (after session is available)
app.use((req, res, next) => {
  try {
    if (req.method === 'POST' && req.originalUrl && req.originalUrl.indexOf('/reception/complete') === 0) {
      const now = new Date().toISOString();
      console.log(`[${now}] TOP-LEVEL capture: ${req.method} ${req.originalUrl} body=${JSON.stringify(req.body || {})}`);
      try { console.log('TOP-LEVEL headers.cookie: [REDACTED]'); } catch (e) {}
      try {
        // Log only minimal non-sensitive session user info
        if (req.session && req.session.user) {
          const su = req.session.user;
          console.log('TOP-LEVEL session.user:', { id: su.id, name: su.name, role: su.role });
        }
      } catch (e) {}
    }
  } catch (e) {}
  next();
});

// Global variables for flash messages
app.use((req, res, next) => {
  res.locals.success_msg = req.flash('success_msg');
  const errorMsgs = req.flash('error_msg');
  res.locals.error_msg = errorMsgs;
  // Log any flash error messages to the persistent report error log
  try {
    if (Array.isArray(errorMsgs) && errorMsgs.length) {
      errorMsgs.forEach((m) => {
        logReportError(m, `flash:error_msg ${req.method} ${req.originalUrl}`);
      });
    }
  } catch (e) {
    console.error('Failed to log flash error messages:', e);
  }
  const errors = req.flash('error');
  res.locals.error = errors;
  try {
    if (Array.isArray(errors) && errors.length) {
      errors.forEach((m) => {
        logReportError(m, `flash:error ${req.method} ${req.originalUrl}`);
      });
    }
  } catch (e) {
    console.error('Failed to log flash error messages (error):', e);
  }
  res.locals.user = req.session.user || null;
  next();
});

// Feature flags (temporary toggles for UI visibility)
app.locals.featureFlags = {
  tests: true,
  reports: true,
  templates: true,
  users: true,
  worksheet: true
};

// Expose current feature flags to all views via res.locals
app.use((req, res, next) => {
  // Allow session-level overrides for temporary (Apply) changes
  const sessionFlags = (req.session && req.session.featureFlags) ? req.session.featureFlags : {};
  res.locals.featureFlags = Object.assign({}, app.locals.featureFlags, sessionFlags);
  next();
});

// Set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Routes
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const patientRoutes = require('./routes/patients');
const testRoutes = require('./routes/tests');
const reportRoutes = require('./routes/reports');
const templateRoutes = require('./routes/templates');
const userRoutes = require('./routes/users');
const profileRoutes = require('./routes/profile');
const receptionRoutes = require('./routes/reception');
const settingsRoutes = require('./routes/settings');

app.use('/', authRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/patients', patientRoutes);
app.use('/tests', testRoutes);
app.use('/reports', reportRoutes);
app.use('/templates', templateRoutes);
app.use('/users', userRoutes);
app.use('/profile', profileRoutes);
app.use('/reception', receptionRoutes);
app.use('/settings', settingsRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).render('404', { title: 'Page Not Found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err && err.stack ? err.stack : err);
  try { logReportError(err, `express error ${req.method} ${req.originalUrl}`); } catch (e) { console.error('Failed to write express error to log:', e); }
  // Show the error details in development, otherwise show generic message
  res.status(500).render('500', { title: 'Server Error', error: process.env.NODE_ENV === 'development' ? err : {} });
});

// Global process-level error handlers to ensure persistent logging
process.on('unhandledRejection', (reason, promise) => {
  try {
    logReportError(reason, 'unhandledRejection');
  } catch (e) { console.error('Failed to log unhandledRejection:', e); }
});

process.on('uncaughtException', (err) => {
  try {
    logReportError(err, 'uncaughtException');
  } catch (e) { console.error('Failed to log uncaughtException:', e); }
  // Print stack to console for debugging, then exit so the process can be restarted by external supervisor
  try {
    console.error('Uncaught exception:', err && err.stack ? err.stack : err);
  } catch (e) {
    console.error('Failed to print uncaught exception stack:', e);
  }
  process.exit(1);
});

// Run startup checks before listening - helpful for packaged EXE diagnostics
verifyStartupRequirements();

app.listen(PORT, HOST, () => {
  const now = new Date();
  const url = `http://${HOST}:${PORT}`;
  // Gather non-internal IPv4 addresses for helpful network links
  let ips = [];
  try {
    ips = Object.values(os.networkInterfaces())
      .flat()
      .filter(i => i && i.family === 'IPv4' && !i.internal)
      .map(i => i.address);
  } catch (e) {
    ips = [];
  }

  const lines = [];
  lines.push('='.repeat(72));
  lines.push('Welcome to Gezyne Clinical Laboratory - Laboratory Information System (LIS)');
  lines.push('');
  lines.push('Access the LIS:');
  lines.push(` • Local: ${url}`);
  if (ips && ips.length) {
    ips.forEach((ip) => {
      lines.push(` • On your network: http://${ip}:${PORT}`);
    });
  }
  lines.push('');
  lines.push('Please do not close this terminal while the server is running.');
  lines.push('To access the LIS, open one of the links above in your browser.');
  lines.push('');
  lines.push(`Started: ${now.toLocaleString()}`);
  lines.push(`HOST env override: ${process.env.HOST || '(not set)'}   PORT env override: ${process.env.PORT || '(not set)'} `);
  lines.push('To override the default host, set the HOST environment variable before starting.');
  lines.push('='.repeat(72));

  console.log(lines.join('\n'));
});