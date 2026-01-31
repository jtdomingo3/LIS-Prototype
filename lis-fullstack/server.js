const express = require('express');
// Load environment variables from .env when present
try { require('dotenv').config({ path: require('path').join(__dirname, '.env') }); } catch (e) {}
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
const DATA_FILE = path.join(__dirname, 'data.json');
const USERS_FILE = path.join(__dirname, 'data-users.json');
const crypto = require('crypto');
const USER_DATA_KEY = process.env.DATA_USERS_KEY || process.env.USER_DATA_KEY || null;

// Initialize data file if it doesn't exist
if (!fs.existsSync(DATA_FILE)) {
  const initialData = {
    users: [],
    patients: [],
    tests: [],
    templates: [],
    // persistent counters for per-test-type IDs
    counters: {}
  };
  fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
}

// Ensure users file exists
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, USER_DATA_KEY ? JSON.stringify([]) : JSON.stringify([], null, 2));
}

function deriveKey(secret) {
  return crypto.createHash('sha256').update(String(secret)).digest();
}

function encryptJson(obj) {
  if (!USER_DATA_KEY) return JSON.stringify(obj, null, 2);
  const key = deriveKey(USER_DATA_KEY);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(obj));
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({ v: 1, iv: iv.toString('base64'), tag: tag.toString('base64'), data: encrypted.toString('base64') }, null, 2);
}

function decryptJson(raw) {
  if (!raw) return [];
  if (!USER_DATA_KEY) return JSON.parse(raw);
  let parsed;

  try { parsed = JSON.parse(raw); } catch (e) { return JSON.parse(raw || '[]'); }
  if (!parsed || !parsed.data) return parsed;
  const key = deriveKey(USER_DATA_KEY);
  const iv = Buffer.from(parsed.iv, 'base64');
  const tag = Buffer.from(parsed.tag, 'base64');
  const encrypted = Buffer.from(parsed.data, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(dec.toString('utf8'));
}

// Simple file-based database functions with atomic write and merge protection
const db = {
  read: () => JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')),
  write: (data) => {
    try {
      const dir = path.dirname(DATA_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const tmp = `${DATA_FILE}.tmp-${process.pid}-${Date.now()}`;
      // create a timestamp on top-level to help detect staleness when needed
      if (data && typeof data === 'object') data.__lastWrite = (new Date()).toISOString();
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
      try { fs.renameSync(tmp, DATA_FILE); } catch (e) {
        // fallback to copy+unlink on platforms that behave differently
        try { fs.copyFileSync(tmp, DATA_FILE); fs.unlinkSync(tmp); } catch (e2) { throw e2; }
      }
    } catch (e) {
      console.error('DB write failed:', e);
      throw e;
    }
  },
  // Users stored separately in data-users.json (optional encrypted)
  getUsers: () => {
    try {
      const raw = fs.readFileSync(USERS_FILE, 'utf8');
      return decryptJson(raw);
    } catch (e) {
      return [];
    }
  },
  saveUsers: (users) => {
    try {
      fs.writeFileSync(USERS_FILE, encryptJson(users), 'utf8');
    } catch (e) {
      console.error('Failed to write users file:', e);
    }
  },
  getPatients: () => db.read().patients,
  getTests: () => db.read().tests,
  getTemplates: () => db.read().templates,
  getCounters: () => db.read().counters || {},
  savePatients: (patients) => { const data = db.read(); data.patients = patients; db.write(data); },
  // saveTests now merges incoming tests with on-disk tests using `updatedAt` to avoid
  // older writes overwriting newer changes when concurrent requests are processed.
  saveTests: (tests) => {
    try {
      const disk = db.read();
      const existing = Array.isArray(disk.tests) ? disk.tests : [];
      const mergedMap = new Map();

      // seed with existing
      for (const t of existing) {
        if (t && t.id) mergedMap.set(t.id, t);
      }

      // overlay with incoming tests when newer (or absent on disk)
      for (const t of (Array.isArray(tests) ? tests : [])) {
        if (!t || !t.id) continue;
        const cur = mergedMap.get(t.id);
        const curTs = cur && cur.updatedAt ? Date.parse(cur.updatedAt) : 0;
        const incomingTs = t.updatedAt ? Date.parse(t.updatedAt) : 0;
        if (!cur || incomingTs >= curTs) {
          mergedMap.set(t.id, t);
        } else {
          console.log(`[DB] skipping stale write for test id=${t.id} incoming=${new Date(incomingTs).toISOString()} disk=${new Date(curTs).toISOString()}`);
        }
      }

      // Preserve any tests that existed on disk but were omitted from the incoming payload
      const merged = Array.from(mergedMap.values());
      const data = disk || { users: [], patients: [], tests: [], templates: [], counters: {} };
      data.tests = merged;
      db.write(data);
    } catch (e) {
      console.error('saveTests failed:', e);
      // fallback to naive write if merge fails
      const data = db.read(); data.tests = tests; db.write(data);
    }
  },
  saveTemplates: (templates) => { const data = db.read(); data.templates = templates; db.write(data); },
  saveCounters: (counters) => { const data = db.read(); data.counters = counters; db.write(data); }
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
  if (!fs.existsSync(DATA_FILE)) required.push({ path: DATA_FILE, reason: 'data.json missing; used as the simple file DB' });
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
function maskSensitive(obj) {
  const SENSITIVE = new Set(['password','pwd','pass','confirmPassword','confirm_password','passwordConfirm']);
  if (obj == null) return obj;
  if (Array.isArray(obj)) return obj.map(v => maskSensitive(v));
  if (typeof obj === 'object') {
    const out = {};
    for (const k of Object.keys(obj)) {
      if (SENSITIVE.has(k)) out[k] = '[FILTERED]';
      else out[k] = maskSensitive(obj[k]);
    }
    return out;
  }
  return obj;
}

app.use((req, res, next) => {
  const now = new Date().toISOString();
  let bodyPart = '';
  try {
    const b = req.body || {};
    if (Object.keys(b).length) {
      const masked = maskSensitive(b);
      bodyPart = ` body=${JSON.stringify(masked)}`;
    }
  } catch (e) { bodyPart = ' body=[unserializable]'; }
  console.log(`[${now}] ${req.method} ${req.originalUrl}` + bodyPart);
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
      try { console.log('TOP-LEVEL headers.cookie:', req.headers && req.headers.cookie ? req.headers.cookie : null); } catch (e) {}
      try { console.log('TOP-LEVEL session.user:', req.session && req.session.user ? req.session.user : null); } catch (e) {}
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
  // Also expose the session's user under `sessionUser` so layout can rely on the
  // logged-in user even when a view passes a `user` variable for other purposes
  res.locals.sessionUser = req.session.user || null;
  next();
});

// Expose all users to views for signatory dropdowns
app.use((req, res, next) => {
  try {
    const users = global.db && global.db.getUsers ? global.db.getUsers() : [];
    // Map to minimal fields used in the UI
    res.locals.allUsers = (users || []).map(u => ({ id: u.id || u.email, name: u.name || u.email, email: u.email, role: u.role || '', licenseNumber: u.licenseNumber || '' }));
  } catch (e) {
    res.locals.allUsers = [];
  }
  next();
});

// Expose configured doctor names and derived doctor area labels to views
const DOCTOR_1_NAME = process.env.DOCTOR_1_NAME || '';
const DOCTOR_2_NAME = process.env.DOCTOR_2_NAME || '';
app.use((req, res, next) => {
  try {
    res.locals.DOCTOR_1_NAME = DOCTOR_1_NAME;
    res.locals.DOCTOR_2_NAME = DOCTOR_2_NAME;
    const areas = [];
    if (DOCTOR_1_NAME) areas.push(`Doctor's Check-up - ${DOCTOR_1_NAME}`);
    if (DOCTOR_2_NAME) areas.push(`Doctor's Check-up - ${DOCTOR_2_NAME}`);
    res.locals.DOCTOR_AREAS = areas;
  } catch (e) {
    res.locals.DOCTOR_1_NAME = '';
    res.locals.DOCTOR_2_NAME = '';
    res.locals.DOCTOR_AREAS = [];
  }
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

// Server-side result highlighting helper (for PDFs / serverside renders where client JS may not run)
function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function highlightResult(text) {
  if (text == null) return '';
  var s = String(text);
  // If it already contains HTML tags, assume it's intentionally formatted and perform replacements on HTML-safe content
  var containsTags = /<\/?[a-z][\s\S]*>/i.test(s);
  if (!containsTags) {
    var out = escapeHtml(s);
    // highlight words
    out = out.replace(/\b(Positive|Reactive|trace)\b/gi, function(m){ return '<span class="result-highlight">'+m+'</span>'; });
    // highlight plus groups
    out = out.replace(/(\+{1,4})/g, function(m){ return '<span class="result-highlight">'+m+'</span>'; });
    return out;
  }
  // If HTML present, do safer replacements: replace <br> with itself, then wrap matches inside text nodes by simple replace
  // This is best-effort — avoid full HTML parse for simplicity
  var escaped = s;
  escaped = escaped.replace(/\b(Positive|Reactive|trace)\b/gi, function(m){ return '<span class="result-highlight">'+m+'</span>'; });
  escaped = escaped.replace(/(\+{1,4})/g, function(m){ return '<span class="result-highlight">'+m+'</span>'; });
  return escaped;
}

// expose helper to all views as `hl`
app.use((req, res, next) => { res.locals.hl = highlightResult; next(); });

// Authorization: enforce per-user permissions stored in session.user.permissions
const routePermissionMap = [
  { prefix: '/dashboard', perm: 'dashboard' },
  { prefix: '/patients', perm: 'patients' },
  { prefix: '/reception', perm: 'reception' },
  { prefix: '/tests', perm: 'tests' },
  { prefix: '/reports', perm: 'reports' },
  { prefix: '/templates', perm: 'templates' },
  { prefix: '/users', perm: 'users' },
  { prefix: '/worksheet', perm: 'worksheet' }
];

app.use((req, res, next) => {
  try {
    const path = req.originalUrl || req.url || '';
    const mapping = routePermissionMap.find(m => path.indexOf(m.prefix) === 0);

    console.debug(`[auth-guard] incoming ${req.method} ${path} mapping=${mapping ? mapping.prefix+'=>'+mapping.perm : '<none>'}`);

    // === allow public kiosk access to the assigned kiosk view ===
    const kioskQuery = req.query && (req.query.kiosk === '1' || String(req.query.kiosk).toLowerCase() === 'true');
    const kioskEnv = (process.env.APP_KIOSK === '1' || String(process.env.APP_KIOSK || '').toLowerCase() === 'true');
    if ((kioskQuery || kioskEnv) && path.indexOf('/reception/assigned') === 0) {
      console.debug('[auth-guard] allowing kiosk access to /reception/assigned without auth');
      return next();
    }

    if (!mapping) return next();

    // Allow users to access their own profile regardless of broader '/users' permission
    if (path.indexOf('/users/profile') === 0) {
      console.debug('[auth-guard] allowing /users/profile for authenticated users');
      return next();
    }

    // allow public auth routes (login/register)
    if (path === '/' || path.indexOf('/login') === 0) return next();

    const sessionUser = req.session && req.session.user;
    if (!sessionUser) {
      console.warn(`[auth-guard] blocked ${req.method} ${path} - no session user`);
      req.flash('error_msg', 'Please login to access that page');
      return res.redirect('/');
    }

    const perms = sessionUser.permissions || {};
    console.debug(`[auth-guard] sessionUser=${sessionUser.email} role=${sessionUser.role} perms=${JSON.stringify(perms)}`);

    // Dashboard: allow any authenticated user (temporary easy fix)
    if (mapping.perm === 'dashboard') {
      console.debug('[auth-guard] allowing access to dashboard for authenticated user');
      return next();
    }

    // Allow Admin role everywhere
    if (sessionUser.role === 'Admin') {
      console.debug('[auth-guard] allowing Admin user');
      return next();
    }

    if (perms[mapping.perm]) {
      console.debug(`[auth-guard] allowing via permission ${mapping.perm}`);
      return next();
    }

    // Not allowed
    console.warn(`[auth-guard] denying ${sessionUser.email} access to ${path} (required=${mapping.perm})`);
    req.flash('error_msg', 'You do not have permission to access that page');
    return res.redirect('/dashboard');
  } catch (e) {
    return next();
  }
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
const receptionRoutes = require('./routes/reception');
const settingsRoutes = require('./routes/settings');
const signaturesRoutes = require('./routes/signatures');

app.use('/', authRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/patients', patientRoutes);
app.use('/tests', testRoutes);
app.use('/reports', reportRoutes);
app.use('/templates', templateRoutes);
app.use('/users', userRoutes);
app.use('/reception', receptionRoutes);
app.use('/settings', settingsRoutes);
app.use('/signatures', signaturesRoutes);

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