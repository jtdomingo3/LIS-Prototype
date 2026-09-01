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
// helper for locating writable data files (data.json, data-users.json, etc.)
const { dataFile } = require('./lib/dataPath');

const app = express();
const PORT = process.env.PORT || 3000;
// Default host/IP for the server. Override with the HOST env var if needed.
// Default to listening on all interfaces so the server is reachable from other devices on the network.
// If you prefer localhost-only, set HOST=127.0.0.1 before starting.
const HOST = process.env.HOST || '0.0.0.0';
// data files live in a directory determined by dataPath.getDataDir();
const { initAppLogger } = require('./lib/appLogger');
const DATA_DIR = require('./lib/dataPath').getDataDir();
initAppLogger(DATA_DIR);
const SQLITE_FILE = path.join(DATA_DIR, 'lis-data.db');
// Legacy JSON paths (used for migration and backward compatibility)
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const USERS_FILE = path.join(DATA_DIR, 'data-users.json');
console.log('[server] using SQLITE_FILE', SQLITE_FILE, 'DATA_DIR', DATA_DIR);
const crypto = require('crypto');
const USER_DATA_KEY = process.env.DATA_USERS_KEY || process.env.USER_DATA_KEY || null;

// Encryption helpers (kept for migration of encrypted data-users.json)
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

// ---- SQLite Database ----
const { createDb } = require('./lib/sqliteDb');
const { migrateJsonToSqlite } = require('./lib/migrateJsonToSqlite');

// Ensure data directory exists
try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}

// Create the SQLite database adapter (tables are auto-created)
const db = createDb(SQLITE_FILE);

// Auto-migrate from JSON if this is first startup with SQLite
// (JSON files exist but SQLite DB has no data yet)
(function autoMigrate() {
  const hasJsonData = fs.existsSync(DATA_FILE);
  const hasJsonUsers = fs.existsSync(USERS_FILE);
  if (!hasJsonData && !hasJsonUsers) return; // fresh install, nothing to migrate

  // Check if SQLite already has data (skip migration if so)
  const existingPatients = db.getPatients();
  const existingUsers = db.getUsers();
  if (existingPatients.length > 0 || existingUsers.length > 0) {
    console.log('[server] SQLite database already has data, skipping JSON migration');
    return;
  }

  console.log('[server] Detected legacy JSON files, performing one-time migration to SQLite...');
  const result = migrateJsonToSqlite(db, {
    dataJsonPath: hasJsonData ? DATA_FILE : null,
    usersJsonPath: hasJsonUsers ? USERS_FILE : null,
    userDataKey: USER_DATA_KEY,
    renameAfter: true
  });

  if (result.success) {
    console.log('[server] JSON → SQLite migration completed successfully');
  } else {
    console.error('[server] JSON → SQLite migration had errors:', result.errors);
  }
})();

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
  if (!fs.existsSync(SQLITE_FILE)) optionalWarnings.push({ path: SQLITE_FILE, reason: 'SQLite database not found; will be created on first run' });
  if (!fs.existsSync(publicDir)) optionalWarnings.push({ path: publicDir, reason: 'static public folder not found; some static assets may be missing' });
  if (!fs.existsSync(assetsDir)) optionalWarnings.push({ path: assetsDir, reason: 'assets folder not found; logos/sounds may be missing' });

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
      console.warn('\nAction: these may be optional but can affect features.');
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

// ── Hash-based session bootstrap for standalone app sync requests ──
// If the request has X-LIS-Sync-Email + X-LIS-Sync-Hash headers and no
// active session, verify the hash against stored user passwords and
// create a session automatically.  This runs BEFORE any route-specific
// auth middleware so req.session.user is available everywhere.
app.use((req, res, next) => {
  try {
    // Skip if session already exists
    if (req.session && req.session.user) return next();
    const syncEmail = req.headers['x-lis-sync-email'];
    const syncHash  = req.headers['x-lis-sync-hash'];
    if (!syncEmail || !syncHash) return next();
    const allUsers = global.db && typeof global.db.getUsers === 'function' ? global.db.getUsers() : [];
    const matchUser = allUsers.find(u => u.email && u.email.toLowerCase() === syncEmail.toLowerCase());
    if (matchUser && matchUser.password && matchUser.password === syncHash) {
      req.session.user = {
        id: matchUser.id || matchUser.email,
        name: matchUser.name || matchUser.email,
        email: matchUser.email,
        role: matchUser.role || 'User',
        permissions: matchUser.permissions || {},
        signature: matchUser.signature || null,
        licenseNumber: matchUser.licenseNumber || '',
      };
      console.log('[auth] hash-based session bootstrap for', syncEmail);
    }
  } catch (e) { /* ignore */ }
  next();
});

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

// Expose configured doctor names and derived doctor area labels to views dynamically
app.use((req, res, next) => {
  try {
    let d1 = (process.env.DOCTOR_1_NAME || '').trim();
    let d2 = (process.env.DOCTOR_2_NAME || '').trim();
    try {
      const s = global.db && typeof global.db.getSettings === 'function' ? global.db.getSettings() : null;
      if (s && s.doctor1Name) d1 = s.doctor1Name.trim();
      if (s && s.doctor2Name) d2 = s.doctor2Name.trim();
    } catch (_) {}
    d1 = d1 || 'Dr. Lorenzo';
    d2 = d2 || 'Dr. Arcilla';
    res.locals.DOCTOR_1_NAME = d1;
    res.locals.DOCTOR_2_NAME = d2;
    const areas = [];
    if (d1) areas.push(`Doctor's Check-up - ${d1}`);
    if (d2 && d2 !== d1) areas.push(`Doctor's Check-up - ${d2}`);
    res.locals.DOCTOR_AREAS = areas;
  } catch (e) {
    res.locals.DOCTOR_1_NAME = 'Dr. Lorenzo';
    res.locals.DOCTOR_2_NAME = 'Dr. Arcilla';
    res.locals.DOCTOR_AREAS = [`Doctor's Check-up - Dr. Lorenzo`, `Doctor's Check-up - Dr. Arcilla`];
  }
  next();
});

// Pre-compute inline logo as base64 data URI so every view has it
// (ensures logo is embedded when page is saved to desktop or used offline)
try {
  const _logoBuffer = fs.readFileSync(path.join(__dirname, 'assets', 'gezyne-logo.png'));
  app.locals.inlineLogo = 'data:image/png;base64,' + _logoBuffer.toString('base64');
} catch (e) {
  console.warn('Could not inline logo:', e.message);
  app.locals.inlineLogo = '/assets/gezyne-logo.png'; // fallback to relative path
}

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
  // expose backupConfig from app.locals (may have been persisted)
  res.locals.backupConfig = app.locals.backupConfig || { enabled: true, frequency: 'daily', path: path.join(os.homedir(), 'Documents', 'LIS', 'backup') };
  next();
});

// Restore persisted backup config and start auto-backup interval if enabled
try {
  const data = global.db.read();
  const bc = data && data.backupConfig ? data.backupConfig : { enabled: true, frequency: 'daily', path: path.join(os.homedir(), 'Documents', 'LIS', 'backup') };
  app.locals.backupConfig = bc;
  if (bc.enabled) {
    const dir = bc.path && String(bc.path).length ? bc.path : path.join(os.homedir(), 'Documents', 'LIS', 'backup');
    
    function scheduleNextBackup() {
      const now = new Date();
      // Target 3:00 PM today (local time)
      let target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 15, 0, 0, 0);
      
      // If it's already past 3 PM, schedule for tomorrow 3 PM
      if (now.getTime() >= target.getTime()) {
        target.setDate(target.getDate() + 1);
      }
      
      const msUntilNext = target.getTime() - now.getTime();
      
      app.locals.backupTimeoutId = setTimeout(() => {
        try {
          fs.mkdirSync(dir, { recursive: true });
          const ts = new Date().toISOString().replace(/[:.]/g, '-');
          
          const DATA_FILE = dataFile('data.json');
          if (fs.existsSync(DATA_FILE)) {
            fs.copyFileSync(DATA_FILE, path.join(dir, `data_${ts}.json`));
          }
          
          const USERS_FILE = dataFile('data-users.json');
          if (fs.existsSync(USERS_FILE)) {
            fs.copyFileSync(USERS_FILE, path.join(dir, `users_${ts}.json`));
          }
          console.log(`[backup] Auto-backup completed successfully at ${new Date().toLocaleString()}`);
        } catch (e) {
          console.error('[backup] Auto-backup failed:', e);
        }
        // Reschedule the next one
        scheduleNextBackup();
      }, msUntilNext);
      
      console.log(`[backup] Next auto-backup scheduled for ${target.toLocaleString()}`);
    }
    
    scheduleNextBackup();
  }
} catch (e) { console.error('[backup] Startup backup error:', e); }

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

    // === allow public kiosk access to safe reception endpoints (kiosk mode) ===
    const kioskQuery = req.query && (req.query.kiosk === '1' || String(req.query.kiosk).toLowerCase() === 'true');
    const kioskEnv = (process.env.APP_KIOSK === '1' || String(process.env.APP_KIOSK || '').toLowerCase() === 'true');
    // If kiosk mode requested, allow GET requests under /reception/ to proceed without auth.
    // This lets the kiosk TV fetch the assigned view, SSE, data and TTS resources without login.
    if ((kioskQuery || kioskEnv) && req.method === 'GET' && path.indexOf('/reception/') === 0) {
      console.debug('[auth-guard] allowing kiosk GET access to reception path without auth', path);
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

    let perms = sessionUser.permissions || {};
    if (typeof perms === 'string') {
      try { perms = JSON.parse(perms); } catch (_) { perms = {}; }
    }
    const managementRoles = new Set(['Admin', 'Manager', 'Owner']);
    const isManagement = managementRoles.has(sessionUser.role);

    // Dashboard: only allow management roles or explicit perms.dashboard
    if (mapping.perm === 'dashboard') {
      if (isManagement || perms.dashboard) {
        console.debug('[auth-guard] allowing access to dashboard for management user');
        return next();
      }
      const { getUserHomeRoute } = require('./middleware/auth');
      const target = getUserHomeRoute(sessionUser);
      return res.redirect(target !== '/dashboard' ? target : '/reception');
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

    // Role-based baseline workflow access for laboratory personnel
    const labRoles = new Set(['Medical Technologist', 'MedTech', 'Technician', 'Doctor', 'Staff', 'Receptionist', 'Encoder']);
    if (labRoles.has(sessionUser.role)) {
      if (['reception', 'patients', 'tests', 'reports', 'worksheet', 'templates'].includes(mapping.perm)) {
        console.debug(`[auth-guard] allowing ${sessionUser.role} baseline workflow access to ${mapping.perm}`);
        return next();
      }
    }

    // Not allowed
    console.warn(`[auth-guard] denying ${sessionUser.email} access to ${path} (required=${mapping.perm})`);
    if (req.flash) req.flash('error_msg', 'You do not have permission to access that page');
    const { getUserHomeRoute } = require('./middleware/auth');
    const target = getUserHomeRoute(sessionUser);
    if (target === path) {
      return res.redirect('/users/profile');
    }
    return res.redirect(target);
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

// ---- Unauthenticated restore endpoints (for fresh installs with no user data) ----
const bcryptRestore = require('bcryptjs');
const { v4: uuidRestore } = require('uuid');

// POST /api/restore/users – seeds the default admin account
app.post('/api/restore/users', async (req, res) => {
  try {
    let existing = [];
    try { existing = db.getUsers(); if (!Array.isArray(existing)) existing = []; } catch (e) { existing = []; }

    let admin = existing.find(u => u.email === 'admin@lab.com');
    const hash = await bcryptRestore.hash('password123', 12);

    if (!admin) {
      admin = {
        id: uuidRestore(),
        name: 'Admin User',
        email: 'admin@lab.com',
        password: hash,
        role: 'Admin',
        licenseNumber: null,
        signature: null,
        autoSignature: { enabled: false, until: null },
        permissions: {
          dashboard: true, patients: true, reception: true,
          tests: true, reports: true, worksheet: true,
          templates: true, users: true, delete: true
        },
        status: 'Active',
        createdAt: new Date().toISOString(),
        lastLogin: null
      };
      existing.push(admin);
    } else {
      admin.password = hash;
      admin.role = 'Admin';
      admin.status = 'Active';
      admin.permissions = { dashboard: true, patients: true, reception: true, tests: true, reports: true, worksheet: true, templates: true, users: true, delete: true };
    }

    db.saveUsers(existing);
    console.log('[restore] Admin user seeded via /api/restore/users');
    res.json({ ok: true, message: 'Default admin user restored successfully.' });
  } catch (e) {
    console.error('[restore] /api/restore/users failed:', e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// POST /api/restore/data – resets data.json to empty initial structure
app.post('/api/restore/data', (req, res) => {
  try {
    // backup before reset
    try {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = dataFile(`data-backup-${ts}.json`);
      fs.copyFileSync(DATA_FILE, backupPath);
      console.log('[restore] backed up data.json to', backupPath);
    } catch (e) {}

    const initialData = { users: [], patients: [], tests: [], templates: [], counters: {} };
    db.write(initialData);
    console.log('[restore] data.json reset via /api/restore/data');
    res.json({ ok: true, message: 'Data reset to empty database' });
  } catch (e) {
    console.error('[restore] /api/restore/data failed:', e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// Export endpoint for full-sync (requires authenticated session or sync token)
app.get('/export/data.json', (req, res) => {
  try {
    // Primary auth: session-based or configured public export
    let authorized = !!(req.session && req.session.user) || (process.env.ALLOW_PUBLIC_DATA_EXPORT === '1');

    // Fallback auth: hash-based sync token from the standalone app.
    // The standalone app sends X-LIS-Sync-Email + X-LIS-Sync-Hash headers.
    // We verify the email exists and the stored bcrypt hash matches.
    if (!authorized) {
      const syncEmail = req.headers['x-lis-sync-email'];
      const syncHash  = req.headers['x-lis-sync-hash'];
      if (syncEmail && syncHash) {
        try {
          const allUsers = db.getUsers();
          const matchUser = allUsers.find(u => u.email && u.email.toLowerCase() === syncEmail.toLowerCase());
          if (matchUser && matchUser.password && matchUser.password === syncHash) {
            authorized = true;
            console.log('[export] hash-based auth accepted for', syncEmail);
          }
        } catch (e) { /* ignore auth check errors */ }
      }
    }

    if (!authorized) return res.status(401).send('Authentication required');
    const data = db.read();
    // Include user accounts WITH hashed passwords so the standalone app
    // can authenticate users offline.  Passwords are already bcrypt-hashed
    // so they are safe to transmit over the local network.
    // Users are stored in a separate file (data-users.json), so we always
    // pull them via getUsers() and merge them into the export.
    const allUsers = db.getUsers();
    data.users = allUsers.map(u => ({
      id: u.id || u.email,
      name: u.name || u.email,
      email: u.email,
      password: u.password,  // bcrypt hash — needed for offline auth
      role: u.role || '',
      status: u.status || 'Active',
      permissions: u.permissions || {},
      licenseNumber: u.licenseNumber || null,
      signature: u.signature || null,
      autoSignature: u.autoSignature || { enabled: false, until: null },
    }));
    res.json(data);
  } catch (e) {
    console.error('export/data.json failed:', e && e.message);
    res.status(500).send('Export failed');
  }
});

// Fullscreen persistent shell
app.get('/shell', (req, res) => {
  const targetUrl = req.query.url || '/dashboard';
  res.send(`<!DOCTYPE html>
<html lang="en" style="margin:0; padding:0; width:100%; height:100%; overflow:hidden; background:#000;">
<head>
  <meta charset="UTF-8">
  <title>Gezyne LIS - Fullscreen</title>
</head>
<body style="margin:0; padding:0; width:100%; height:100%; overflow:hidden; background:#000;">
  <iframe src="${escapeHtml(targetUrl)}" style="width:100%; height:100%; border:none; margin:0; padding:0; display:block;"></iframe>
  <script>
    function enterFS() {
      const el = document.documentElement;
      const p = el.requestFullscreen ? el.requestFullscreen() : (el.webkitRequestFullscreen ? el.webkitRequestFullscreen() : Promise.reject());
      if (p && p.catch) p.catch(() => {});
    }
    // Attempt immediately and on first click
    enterFS();
    document.addEventListener('click', enterFS, {once:true, capture:true});
    
    // Listen for fullscreen exit via Escape key to sync iframe location back to main window
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement) {
         try {
           const iframe = document.querySelector('iframe');
           if (iframe && iframe.contentWindow) {
             window.location.href = iframe.contentWindow.location.href;
           } else {
             window.location.href = '/dashboard';
           }
         } catch(e){ window.location.href = '/dashboard'; }
      }
    });
  </script>
</body>
</html>`);
});

// Shortcut for kiosk
app.get('/kiosk', (req, res) => {
  res.redirect('/reception/assigned?kiosk=1');
});

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

  // Background: generate any missing PDF reports into Documents/LIS/reports
  // Can be disabled in environments where report generation is unwanted (e.g. CI, headless
  // containers, or when the reports directory is mounted read‑only). To skip the startup scan
  // set either DISABLE_REPORT_GENERATION=1 or SKIP_REPORT_GENERATION=1 before launching.
  const skipReportStartup = (process.env.DISABLE_REPORT_GENERATION === '1') ||
                            (process.env.SKIP_REPORT_GENERATION === '1');
  if (!skipReportStartup) {
    try {
      const reportGenerator = require('./lib/reportGenerator');
      reportGenerator.generateAllMissing().catch(e => {
        console.error('[startup] report generation scan error:', e && e.message);
      });
    } catch (e) {
      console.warn('[startup] could not run report generation scan:', e && e.message);
    }
  } else {
    console.log('[startup] skipping report generation (DISABLE_REPORT_GENERATION=1)');
  }
});

// Development-friendly public data endpoint (ONLY enabled in development
// or when ALLOW_PUBLIC_DATA_EXPORT=1 is set). This is convenient for local
// electron clients during testing. Do NOT enable in production unless you
// understand the implications.
app.get('/data.json', (req, res) => {
  const allow = (process.env.NODE_ENV === 'development') || (process.env.ALLOW_PUBLIC_DATA_EXPORT === '1');
  if (!allow) return res.status(404).send('Not found');
  try {
    const data = db.read();
    console.log('[export] served /data.json public snapshot');
    res.json(data);
  } catch (e) {
    console.error('[export] public /data.json failed:', e && e.message);
    res.status(500).send('Export failed');
  }
});