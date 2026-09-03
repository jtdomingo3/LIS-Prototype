const express = require('express');
const router = express.Router();
const { canManageUsers, requireAuth } = require('../middleware/auth');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { dataFile } = require('../lib/dataPath');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const { encryptSecret, decryptSecret } = require('../lib/cryptoHelper');
const { testOpenRouterConnection, resolveApiKey, AVAILABLE_MODELS, DEFAULT_MODEL } = require('../lib/gezyneBotService');

const DEFAULT_BACKUP_DIR = path.join(os.homedir(), 'Documents', 'LIS', 'backup');

function getEnvFilePath() {
  // If running in packaged exe or DATA_DIR is set, use writable persistent location
  if (process.pkg) {
    const dataDir = process.env.DATA_DIR || path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'GezyneLIS');
    try { fs.mkdirSync(dataDir, { recursive: true }); } catch (_) {}
    return path.join(dataDir, '.env');
  }

  // Next check if .env exists in project root
  const rootEnv = path.join(__dirname, '..', '.env');
  if (fs.existsSync(rootEnv)) return rootEnv;

  // Fallback to DATA_DIR if set
  if (process.env.DATA_DIR) {
    return path.join(process.env.DATA_DIR, '.env');
  }

  return rootEnv;
}

function parseEnvContent(content) {
  const lines = String(content || '').split(/\r?\n/);
  // support optional spaces around the '=' so entries such as
  // "DISABLE_REPORT_GENERATION =1" are treated correctly.
  return lines.map((line) => {
    const m = line.match(/^([^#=\s]+)\s*=\s*(.*)$/);
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
    const envPath = getEnvFilePath();
    let raw = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    if (!raw && fs.existsSync(path.join(__dirname, '..', '.env'))) {
      try { raw = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8'); } catch (_) {}
    }
    return parseEnvContent(raw);
  } catch (e) {
    console.error('Failed to read .env:', e);
    return [];
  }
}

function writeEnvFile(updatedValues) {
  try {
    const envPath = getEnvFilePath();
    let raw = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
    if (!raw && fs.existsSync(path.join(__dirname, '..', '.env'))) {
      try { raw = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8'); } catch (_) {}
    }
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
    fs.mkdirSync(path.dirname(envPath), { recursive: true });
    fs.writeFileSync(envPath, outLines.join(os.EOL), 'utf8');
  } catch (e) {
    console.warn('[settings] writeEnvFile notice (non-fatal):', e && e.message);
  }
}

function performBackup(destDir) {
  const dir = destDir && String(destDir).length ? destDir : DEFAULT_BACKUP_DIR;
  fs.mkdirSync(dir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(dir, `backup_${ts}.json`);
  const data = global.db ? global.db.read() : {};
  fs.writeFileSync(dest, JSON.stringify(data, null, 2), 'utf8');

  // Also backup raw SQLite file if it exists
  try {
    const dbFile = dataFile('lis-data.db');
    if (fs.existsSync(dbFile)) {
      const dbDest = path.join(dir, `backup_db_${ts}.db`);
      fs.copyFileSync(dbFile, dbDest);
    }
  } catch (e) {}

  return dest;
}

function performUserBackup(destDir) {
  const dir = destDir && String(destDir).length ? destDir : DEFAULT_BACKUP_DIR;
  fs.mkdirSync(dir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(dir, `backup_users_${ts}.json`);
  const users = global.db ? global.db.getUsers() : [];
  fs.writeFileSync(dest, JSON.stringify(users, null, 2), 'utf8');
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

const { getRecentLogs, getLogPath, clearLogFile } = require('../lib/appLogger');

// Only allow authenticated users; editing flags restricted to Admins
router.get('/', requireAuth, (req, res) => {
  const featureFlags = req.app.locals.featureFlags || {};
  const backupConfig = req.app.locals.backupConfig || { enabled: false, frequency: 'daily', path: DEFAULT_BACKUP_DIR };
  // load persistent settings from data.json
  let settings = {};
  try {
    if (global.db && typeof global.db.getSettings === 'function') {
      settings = global.db.getSettings() || {};
    } else {
      const data = global.db.read();
      settings = data.settings || {};
    }
  } catch (e) { settings = {}; }
  const networkAddress = getPreferredNetworkAddress();
  const networkPort = (req && req.socket && req.socket.localPort) ? req.socket.localPort : (process.env.PORT || req.app && req.app.locals && req.app.locals.port || 3000);
  const networkUrl = `${networkAddress}:${networkPort}`;
  const HIDDEN_ENV_KEYS = new Set([
    'OPENROUTER_ENCRYPTED_KEY',
    'OPENROUTER_API_KEY',
    'OPENROUTER_DEFAULT_MODEL'
  ]);
  const envEntries = readEnvFileEntries().filter(e => e.type !== 'kv' || !HIDDEN_ENV_KEYS.has(e.key));
  const recentLogs = getRecentLogs(200);
  const logFilePath = getLogPath();

  // Determine if OpenRouter key is configured
  const currentKey = resolveApiKey();
  const hasOpenRouterKey = !!(currentKey && currentKey.startsWith('sk-or-'));
  const maskedKey = hasOpenRouterKey ? (currentKey.slice(0, 10) + '...' + currentKey.slice(-4)) : '';
  const currentModel = settings.openrouterModel || process.env.OPENROUTER_DEFAULT_MODEL || DEFAULT_MODEL;

  const requirePaymentAmount = (typeof settings.requirePaymentAmount !== 'undefined') ? !!settings.requirePaymentAmount : true;

  const sseConfig = settings.sseConfig || req.app.locals.sseConfig || {
    enabled: true,
    autoRefreshByDefault: true,
    allowedPages: ['/dashboard', '/patients', '/reception', '/tests', '/inventory'],
    connectDelaySec: 3,
    retryDelaySec: 3,
    refreshDebounceMs: 800
  };
  const printerName = settings.printerName || process.env.PRINTER_NAME || process.env.THERMAL_PRINTER_NAME || '';

  if (req.query.format === 'json' || req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
    return res.json({
      success: true,
      settings,
      sseConfig,
      printerName,
      featureFlags,
      backupConfig,
      hasOpenRouterKey,
      maskedKey,
      currentModel,
      requirePaymentAmount,
      doctor1Name: settings.doctor1Name || process.env.DOCTOR_1_NAME || 'Dr. Lorenzo',
      doctor2Name: settings.doctor2Name || process.env.DOCTOR_2_NAME || 'Dr. Arcilla',
      gezynePath: settings.gezynePath || process.env.GEZYNE_PATH || '',
      networkAddress,
      networkPort,
      networkUrl
    });
  }

  res.render('settings', {
    title: 'Settings',
    featureFlags,
    backupConfig,
    settings,
    networkAddress,
    networkPort,
    networkUrl,
    envEntries,
    recentLogs,
    logFilePath,
    hasOpenRouterKey,
    maskedKey,
    currentModel,
    availableModels: AVAILABLE_MODELS,
    requirePaymentAmount,
    sseConfig,
    printerName
  });
});

// POST /settings/test-print - Test printer connection and trigger test print
router.post('/test-print', requireAuth, (req, res) => {
  try {
    const { spawnSync } = require('child_process');
    const pathMod = require('path');
    const fsMod = require('fs');
    const scriptPath = pathMod.join(__dirname, '..', 'scripts', 'thermal_test.js');
    if (!fsMod.existsSync(scriptPath)) {
      return res.status(404).json({ success: false, error: 'Thermal printer script (scripts/thermal_test.js) not found.' });
    }

    const printType = (req.body && req.body.type) ? req.body.type : 'receipt';
    const args = [scriptPath];
    if (printType === 'barcode') args.push('--barcode');
    else args.push('--receipt');

    const printer = (req.body && req.body.printer) || (settings && settings.printerName) || process.env.PRINTER_NAME || process.env.THERMAL_PRINTER_NAME || '';
    if (printer) args.push('--printer', printer);

    const spawnEnv = Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1' });
    const proc = spawnSync(process.execPath, args, {
      cwd: pathMod.join(__dirname, '..'),
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      env: spawnEnv
    });

    if (proc.error) {
      return res.status(500).json({ success: false, error: proc.error.message || String(proc.error) });
    }

    if (proc.status !== 0) {
      const errMsg = proc.stderr || proc.stdout || `Printer process exited with code ${proc.status}`;
      return res.status(500).json({ success: false, error: errMsg });
    }

    return res.json({
      success: true,
      message: `Test print job (${printType.toUpperCase()}) successfully sent to ${printer || 'default system thermal printer'}!`,
      output: proc.stdout || ''
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Test OpenRouter AI Connection from settings page
router.post('/test-ai', requireAuth, canManageUsers, async (req, res) => {
  try {
    const { apiKey, model } = req.body || {};
    const keyToTest = (apiKey && apiKey.trim()) ? apiKey.trim() : resolveApiKey();
    const result = await testOpenRouterConnection(keyToTest, model);
    res.json(result);
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
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

    // Persist GEZYNE / analyzer path, doctor names, & GezyneBot AI OpenRouter key/model
    try {
      const doc1 = (flags.doctor1Name || '').trim() || 'Dr. Lorenzo';
      const doc2 = (flags.doctor2Name || '').trim() || 'Dr. Arcilla';
      const gezyne = flags.gezynePath || '';
      const rawAiKey = (flags.openrouterApiKey || '').trim();
      const aiModel = (flags.openrouterModel || '').trim() || DEFAULT_MODEL;

      let cur = {};
      if (global.db && typeof global.db.getSettings === 'function') {
        cur = global.db.getSettings() || {};
      } else {
        const data = global.db.read();
        cur = data.settings || {};
      }

      cur.doctor1Name = doc1;
      cur.doctor2Name = doc2;
      cur.gezynePath = gezyne;
      cur.openrouterModel = aiModel;
      cur.requirePaymentAmount = (flags.requirePaymentAmount === 'on' || flags.requirePaymentAmount === true || flags.requirePaymentAmount === 'true');

      // SSE Real-Time Configuration
      const sseAllowedPages = [];
      if (flags.sse_page_dashboard) sseAllowedPages.push('/dashboard');
      if (flags.sse_page_patients) sseAllowedPages.push('/patients');
      if (flags.sse_page_reception) sseAllowedPages.push('/reception');
      if (flags.sse_page_tests) sseAllowedPages.push('/tests');
      if (flags.sse_page_reports) sseAllowedPages.push('/reports');
      if (flags.sse_page_inventory) sseAllowedPages.push('/inventory');
      if (flags.sse_page_signatures) sseAllowedPages.push('/signatures');
      if (flags.sse_page_worksheet) sseAllowedPages.push('/reports/worksheet');
      if (flags.sse_page_templates) sseAllowedPages.push('/templates');
      if (flags.sse_page_users) sseAllowedPages.push('/users');
      if (flags.sse_page_settings) sseAllowedPages.push('/settings');
      if (flags.sse_page_chatbot) sseAllowedPages.push('/chatbot');

      const parsedConnectDelay = parseInt(flags.sseConnectDelaySec, 10);
      const parsedRetryDelay = parseInt(flags.sseRetryDelaySec, 10);
      const parsedRefreshDebounce = parseInt(flags.sseRefreshDebounceMs, 10);

      const sseConfigObj = {
        enabled: flags.sseEnabled === 'on' || flags.sseEnabled === true || flags.sseEnabled === 'true',
        autoRefreshByDefault: flags.sseAutoRefreshByDefault === 'on' || flags.sseAutoRefreshByDefault === true || flags.sseAutoRefreshByDefault === 'true',
        allowedPages: sseAllowedPages,
        connectDelaySec: !isNaN(parsedConnectDelay) ? Math.max(0, parsedConnectDelay) : 3,
        retryDelaySec: !isNaN(parsedRetryDelay) ? Math.max(1, parsedRetryDelay) : 3,
        refreshDebounceMs: !isNaN(parsedRefreshDebounce) ? Math.max(100, parsedRefreshDebounce) : 800
      };
      cur.sseConfig = sseConfigObj;
      req.app.locals.sseConfig = sseConfigObj;

      // Printer Settings
      const printer = (flags.printerName || '').trim();
      cur.printerName = printer;
      process.env.PRINTER_NAME = printer;
      process.env.THERMAL_PRINTER_NAME = printer;

      const envUpdates = {};
      if (printer) {
        envUpdates.PRINTER_NAME = printer;
      }
      envUpdates.OPENROUTER_DEFAULT_MODEL = aiModel;
      envUpdates.DOCTOR_1_NAME = doc1;
      envUpdates.DOCTOR_2_NAME = doc2;

      if (rawAiKey && rawAiKey.startsWith('sk-or-')) {
        const encryptedKey = encryptSecret(rawAiKey);
        cur.openrouterApiKeyEncrypted = encryptedKey;
        process.env.OPENROUTER_ENCRYPTED_KEY = encryptedKey;
        process.env.OPENROUTER_API_KEY = rawAiKey;
        envUpdates.OPENROUTER_ENCRYPTED_KEY = encryptedKey;
      }

      if (global.db && typeof global.db.setSettings === 'function') {
        global.db.setSettings(cur);
      } else {
        const data = global.db.read();
        data.settings = cur;
        global.db.write(data);
      }

      writeEnvFile(envUpdates);

      process.env.DOCTOR_1_NAME = doc1;
      process.env.DOCTOR_2_NAME = doc2;
      req.app.locals.DOCTOR_1_NAME = doc1;
      req.app.locals.DOCTOR_2_NAME = doc2;
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
      req.app.locals.featureFlags.inventory = true;
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

    // Manage timeout timer (store id in app.locals)
    if (req.app.locals.backupTimeoutId) {
      clearTimeout(req.app.locals.backupTimeoutId);
      req.app.locals.backupTimeoutId = null;
    }
    if (autoBackup) {
      function scheduleNextBackup() {
        const now = new Date();
        let target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 15, 0, 0, 0);
        if (now.getTime() >= target.getTime()) {
          target.setDate(target.getDate() + 1);
        }
        const msUntilNext = target.getTime() - now.getTime();
        req.app.locals.backupTimeoutId = setTimeout(() => {
          try {
            performBackup(backupPath);
            performUserBackup(backupPath);
            console.log(`[backup] Auto-backup completed successfully at ${new Date().toLocaleString()}`);
          } catch (e) {
            console.error('[backup] Auto-backup failed:', e);
          }
          scheduleNextBackup();
        }, msUntilNext);
        console.log(`[backup] Next auto-backup scheduled for ${target.toLocaleString()}`);
      }
      scheduleNextBackup();
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

    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.json({ success: true, message: 'Settings updated successfully' });
    }
    return res.redirect('/settings');
  } catch (e) {
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.status(500).json({ success: false, error: e && e.message ? e.message : 'Failed to update settings' });
    }
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
    // backup current before overwrite
    performBackup();
    global.db.write(parsed);
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
    // backup current before overwrite
    performUserBackup();
    global.db.saveUsers(Array.isArray(parsed) ? parsed : [parsed]);
    req.flash('success_msg', 'User restore completed (previous user data backed up)');
  } catch (e) {
    console.error('User restore error:', e);
    req.flash('error_msg', `User restore failed: ${e && e.message ? e.message : String(e)}`);
  }
  return res.redirect('/settings');
});

// Clear data endpoint (backs up current data, resets patients, tests, templates)
router.post('/clear', requireAuth, canManageUsers, (req, res) => {
  try {
    // backup current before clearing
    performBackup();
    const current = global.db.read();
    global.db.write({
      patients: [],
      tests: [],
      templates: [],
      counters: {},
      settings: current.settings || {}
    });
    req.flash('success_msg', 'Data cleared. Backup created.');
  } catch (e) {
    console.error('Clear data error:', e);
    req.flash('error_msg', `Clear data failed: ${e && e.message ? e.message : String(e)}`);
  }
  return res.redirect('/settings');
});

// Clear user data endpoint (backs up current users, preserves Admin users)
router.post('/clear-users', requireAuth, canManageUsers, (req, res) => {
  try {
    // backup current before clearing
    performUserBackup();
    const users = (global.db.getUsers() || []).filter(u => u && u.role === 'Admin');
    global.db.saveUsers(users);
    req.flash('success_msg', 'User data cleared (admin users preserved). Backup created.');
  } catch (e) {
    console.error('Clear user data error:', e);
    req.flash('error_msg', `Clear user data failed: ${e && e.message ? e.message : String(e)}`);
  }
  return res.redirect('/settings');
});

// GET /settings/export-logs - download application log file
router.get('/export-logs', requireAuth, (req, res) => {
  try {
    const p = getLogPath();
    if (!fs.existsSync(p)) {
      req.flash('error_msg', 'No log file found to download.');
      return res.redirect('/settings');
    }
    const filename = `gezyne-lis-logs-${new Date().toISOString().slice(0,10)}.log`;
    res.download(p, filename);
  } catch (e) {
    console.error('Export logs error:', e);
    req.flash('error_msg', 'Failed to export logs: ' + e.message);
    res.redirect('/settings');
  }
});

// POST /settings/clear-logs - clear the application log file
router.post('/clear-logs', requireAuth, canManageUsers, (req, res) => {
  try {
    clearLogFile();
    req.flash('success_msg', 'Application logs cleared successfully.');
  } catch (e) {
    req.flash('error_msg', 'Failed to clear logs: ' + e.message);
  }
  res.redirect('/settings');
});

module.exports = router;
