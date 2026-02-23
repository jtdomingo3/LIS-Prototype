const express = require('express');
const router = express.Router();
const { canManageUsers, requireAuth } = require('../middleware/auth');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { dataFile } = require('../lib/dataPath');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const DEFAULT_BACKUP_DIR = path.join(os.homedir(), 'Documents', 'LIS', 'backup');

const ENV_FILE = path.join(__dirname, '..', '.env');

function parseEnvContent(content) {
  const lines = String(content || '').split(/\r?\n/);
  return lines.map((line) => {
    const m = line.match(/^([^#=\s]+)=(.*)$/);
    if (m) {
      const key = m[1].trim();
      let value = m[2] || '';
      value = value.trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      return { type: 'kv', key, value, raw: line };
    }
    return { type: 'other', raw: line };
  });
}

function readEnvFileEntries() {
  try {
    const raw = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
    return parseEnvContent(raw);
  } catch (e) {
    console.error('Failed to read .env:', e);
    return [];
  }
}

function writeEnvFile(updatedValues) {
  try {
    const raw = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
    const entries = parseEnvContent(raw);
    const seen = new Set();
    const outLines = entries.map((entry) => {
      if (entry.type === 'kv') {
        const k = entry.key;
        if (Object.prototype.hasOwnProperty.call(updatedValues, k)) {
          seen.add(k);
          const v = String(updatedValues[k] || '');
          const needsQuotes = /\s/.test(v) || v.includes('#') || v.includes('"');
          const outV = needsQuotes ? `"${v.replace(/"/g, '\\"') }"` : v;
          return `${k}=${outV}`;
        }
        return entry.raw;
      }
      return entry.raw;
    });
    Object.keys(updatedValues).forEach((k) => {
      if (!seen.has(k)) {
        const v = String(updatedValues[k] || '');
        const needsQuotes = /\s/.test(v) || v.includes('#') || v.includes('"');
        const outV = needsQuotes ? `"${v.replace(/"/g, '\\"') }"` : v;
        outLines.push(`${k}=${outV}`);
      }
    });
    fs.writeFileSync(ENV_FILE, outLines.join(os.EOL), 'utf8');
  } catch (e) {
    throw e;
  }
}

function performBackup(destDir) {
  const DATA_FILE = dataFile('data.json');
  const dir = destDir && String(destDir).length ? destDir : DEFAULT_BACKUP_DIR;
  fs.mkdirSync(dir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(dir, `backup_${ts}.json`);
  fs.copyFileSync(DATA_FILE, dest);
  return dest;
}

function performUserBackup(destDir) {
  const USERS_FILE = dataFile('data-users.json');
  const dir = destDir && String(destDir).length ? destDir : DEFAULT_BACKUP_DIR;
  fs.mkdirSync(dir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(dir, `backup_users_${ts}.json`);
  if (fs.existsSync(USERS_FILE)) {
    fs.copyFileSync(USERS_FILE, dest);
  } else {
    // write an empty array backup if file missing
    fs.writeFileSync(dest, JSON.stringify([], null, 2), 'utf8');
  }
  return dest;
}

function getPreferredNetworkAddress() {
  try {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const iface of nets[name]) {
        if (iface && iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
  } catch (e) {
    console.error('Error getting network address:', e);
  }
  return '127.0.0.1';
}

// Only allow authenticated users; editing flags restricted to Admins
router.get('/', requireAuth, (req, res) => {
  const featureFlags = req.app.locals.featureFlags || {};
  const backupConfig = req.app.locals.backupConfig || { enabled: false, frequency: 'daily', path: DEFAULT_BACKUP_DIR };
  // load persistent settings from data.json
  let settings = {};
  try { const data = global.db.read(); settings = data.settings || {}; } catch (e) { settings = {}; }
  const networkAddress = getPreferredNetworkAddress();
  const networkPort = (req && req.socket && req.socket.localPort) ? req.socket.localPort : (process.env.PORT || req.app && req.app.locals && req.app.locals.port || 3000);
  const networkUrl = `${networkAddress}:${networkPort}`;
  const envEntries = readEnvFileEntries();
  res.render('settings', { title: 'Settings', featureFlags, backupConfig, settings, networkAddress, networkPort, networkUrl, envEntries });
});

router.post('/', requireAuth, canManageUsers, (req, res) => {
  try {
    // Checkboxes send 'on' when checked; ensure boolean flags
    const flags = req.body || {};
    req.app.locals.featureFlags.tests = !!flags.tests;
    req.app.locals.featureFlags.reports = !!flags.reports;
    req.app.locals.featureFlags.templates = !!flags.templates;
    req.app.locals.featureFlags.worksheet = !!flags.worksheet;
    req.app.locals.featureFlags.users = !!flags.users;

    // Backup settings: support frequency-based scheduling (daily/weekly/monthly)
    const autoBackup = !!flags.autoBackup;
    const frequency = flags.backupFrequency || 'daily';
    const backupPath = flags.backupPath || DEFAULT_BACKUP_DIR;
    req.app.locals.backupConfig = { enabled: autoBackup, frequency, path: backupPath };

    // Persist backup config into data.json so it survives restarts
    try {
      const data = global.db.read();
      data.backupConfig = { enabled: autoBackup, frequency, path: backupPath };
      global.db.write(data);
      req.app.locals.backupConfig = data.backupConfig;
    } catch (e) {
      console.error('Failed to persist backup config:', e);
    }

    // Persist GEZYNE / analyzer path in app data so it's preserved across restarts
    try {
      const data = global.db.read();
      data.settings = data.settings || {};
      data.settings.gezynePath = flags.gezynePath || '';
      global.db.write(data);
      req.app.locals.settings = data.settings;
    } catch (e) {
      console.error('Failed to persist settings:', e);
    }
    // Ensure feature flags remain enabled by default (UI visibility shouldn't be controlled here)
    try {
      req.app.locals.featureFlags = req.app.locals.featureFlags || {};
      req.app.locals.featureFlags.tests = true;
      req.app.locals.featureFlags.reports = true;
      req.app.locals.featureFlags.templates = true;
      req.app.locals.featureFlags.users = true;
      req.app.locals.featureFlags.worksheet = true;
    } catch (e) {}

    // Frequency -> milliseconds
    const frequencyToMs = (f) => {
      const day = 24 * 60 * 60 * 1000;
      switch ((f || '').toLowerCase()) {
        case 'daily': return day;
        case 'weekly': return 7 * day;
        case 'monthly': return 30 * day;
        default:
          // fallback: treat as minutes number
          const m = Number(f);
          return (isNaN(m) ? 60 : Math.max(1, m)) * 60 * 1000;
      }
    };

    // Manage interval timer (store id in app.locals)
    if (req.app.locals.backupIntervalId) {
      clearInterval(req.app.locals.backupIntervalId);
      req.app.locals.backupIntervalId = null;
    }
    if (autoBackup) {
      const ms = frequencyToMs(frequency);
      req.app.locals.backupIntervalId = setInterval(() => {
        try {
          performBackup(backupPath);
        } catch (e) {
          console.error('Auto-backup failed:', e);
        }
      }, ms);
    }

    req.flash('success_msg', 'Settings updated');
    // handle .env updates (fields named env_<KEY> in the form)
    try {
      const envUpdates = {};
      Object.keys(req.body || {}).forEach((k) => {
        if (k && k.indexOf('env_') === 0) {
          const key = k.slice(4);
          envUpdates[key] = req.body[k];
        }
      });
      if (Object.keys(envUpdates).length) {
        writeEnvFile(envUpdates);
        Object.keys(envUpdates).forEach((kk) => { process.env[kk] = envUpdates[kk]; });
        req.flash('success_msg', `${Object.keys(envUpdates).length} environment value(s) updated`);
      }
    } catch (e) {
      console.error('Failed to update .env:', e);
      req.flash('error_msg', 'Failed to update .env file');
    }

    return res.redirect('/settings');
  } catch (e) {
    req.flash('error_msg', 'Failed to update settings');
    return res.redirect('/settings');
  }
});

// Apply settings for this session only (no global change)
router.post('/apply', requireAuth, canManageUsers, (req, res) => {
  try {
    const flags = req.body || {};
    req.session.featureFlags = {
      tests: !!flags.tests,
      reports: !!flags.reports,
      templates: !!flags.templates,
      worksheet: !!flags.worksheet,
      users: !!flags.users
    };
    req.flash('success_msg', 'Settings applied for this session');
  } catch (e) {
    req.flash('error_msg', 'Failed to apply settings');
  }
  return res.redirect('/settings');
});

// Manual backup endpoint
router.post('/backup', requireAuth, canManageUsers, (req, res) => {
  try {
    const dest = performBackup(req.body && req.body.backupPath ? req.body.backupPath : null);
    req.flash('success_msg', `Backup saved: ${dest}`);
  } catch (e) {
    console.error('Manual backup error:', e);
    req.flash('error_msg', `Backup failed: ${e && e.message ? e.message : String(e)}`);
  }
  return res.redirect('/settings');
});

// Manual backup endpoint (user data)
router.post('/backup-users', requireAuth, canManageUsers, (req, res) => {
  try {
    const dest = performUserBackup(req.body && req.body.backupPath ? req.body.backupPath : null);
    req.flash('success_msg', `User backup saved: ${dest}`);
  } catch (e) {
    console.error('Manual user backup error:', e);
    req.flash('error_msg', `User backup failed: ${e && e.message ? e.message : String(e)}`);
  }
  return res.redirect('/settings');
});

// Restore endpoint (upload JSON file)
router.post('/restore', requireAuth, canManageUsers, upload.single('backupFile'), (req, res) => {
  try {
    if (!req.file) {
      req.flash('error_msg', 'No file uploaded');
      return res.redirect('/settings');
    }
    // Validate JSON first
    const parsed = JSON.parse(req.file.buffer.toString('utf8'));
    const DATA_FILE = dataFile('data.json');
    // backup current before overwrite
    performBackup();
    fs.writeFileSync(DATA_FILE, JSON.stringify(parsed, null, 2), 'utf8');
    req.flash('success_msg', 'Restore completed (previous data backed up)');
  } catch (e) {
    console.error('Restore error:', e);
    req.flash('error_msg', `Restore failed: ${e && e.message ? e.message : String(e)}`);
  }
  return res.redirect('/settings');
});

// Restore endpoint for user data (upload JSON file)
router.post('/restore-users', requireAuth, canManageUsers, upload.single('backupFileUsers'), (req, res) => {
  try {
    if (!req.file) {
      req.flash('error_msg', 'No file uploaded');
      return res.redirect('/settings');
    }
    const parsed = JSON.parse(req.file.buffer.toString('utf8'));
    const USERS_FILE = dataFile('data-users.json');
    // backup current before overwrite
    performUserBackup();
    // normalize to array/object as originally stored
    fs.writeFileSync(USERS_FILE, JSON.stringify(parsed, null, 2), 'utf8');
    req.flash('success_msg', 'User restore completed (previous user data backed up)');
  } catch (e) {
    console.error('User restore error:', e);
    req.flash('error_msg', `User restore failed: ${e && e.message ? e.message : String(e)}`);
  }
  return res.redirect('/settings');
});

// Clear data endpoint (backs up current data, preserves Admin users)
router.post('/clear', requireAuth, canManageUsers, (req, res) => {
  try {
    const DATA_FILE = dataFile('data.json');
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    // backup current before clearing
    performBackup();

    const newData = {};
    Object.keys(parsed).forEach((k) => {
      if (k === 'users') {
        newData.users = Array.isArray(parsed.users) ? parsed.users.filter(u => u && u.role === 'Admin') : [];
      } else if (Array.isArray(parsed[k])) {
        newData[k] = [];
      } else {
        newData[k] = {};
      }
    });
    fs.writeFileSync(DATA_FILE, JSON.stringify(newData, null, 2), 'utf8');
    req.flash('success_msg', 'Data cleared (admin users preserved). Backup created.');
  } catch (e) {
    console.error('Clear data error:', e);
    req.flash('error_msg', `Clear data failed: ${e && e.message ? e.message : String(e)}`);
  }
  return res.redirect('/settings');
});

// Clear user data endpoint (backs up current users, preserves Admin users)
router.post('/clear-users', requireAuth, canManageUsers, (req, res) => {
  try {
    const USERS_FILE = dataFile('data-users.json');
    const raw = fs.existsSync(USERS_FILE) ? fs.readFileSync(USERS_FILE, 'utf8') : '[]';
    let parsed;
    try { parsed = JSON.parse(raw || '[]'); } catch (e) { parsed = []; }
    // backup current before clearing
    performUserBackup();

    const filtered = Array.isArray(parsed) ? parsed.filter(u => u && u.role === 'Admin') : [];
    fs.writeFileSync(USERS_FILE, JSON.stringify(filtered, null, 2), 'utf8');
    req.flash('success_msg', 'User data cleared (admin users preserved). Backup created.');
  } catch (e) {
    console.error('Clear user data error:', e);
    req.flash('error_msg', `Clear user data failed: ${e && e.message ? e.message : String(e)}`);
  }
  return res.redirect('/settings');
});

module.exports = router;
