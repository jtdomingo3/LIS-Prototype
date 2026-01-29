const express = require('express');
const router = express.Router();
const { canManageUsers, requireAuth } = require('../middleware/auth');
const fs = require('fs');
const path = require('path');
const os = require('os');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const DEFAULT_BACKUP_DIR = path.join(os.homedir(), 'Documents', 'LIS', 'backup');

function performBackup(destDir) {
  const dir = destDir && String(destDir).length ? destDir : DEFAULT_BACKUP_DIR;
  fs.mkdirSync(dir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(dir, `backup_${ts}.json`);
  // Build combined snapshot from split store files (users + lab)
  try {
    const users = (global.db && typeof global.db.getUsers === 'function') ? global.db.getUsers() : [];
    const patients = (global.db && typeof global.db.getPatients === 'function') ? global.db.getPatients() : [];
    const tests = (global.db && typeof global.db.getTests === 'function') ? global.db.getTests() : [];
    const templates = (global.db && typeof global.db.getTemplates === 'function') ? global.db.getTemplates() : [];
    const counters = (global.db && typeof global.db.getCounters === 'function') ? global.db.getCounters() : {};
    const combined = { users, patients, tests, templates, counters };
    fs.writeFileSync(dest, JSON.stringify(combined, null, 2), 'utf8');
    return dest;
  } catch (e) {
    // Fallback: attempt to copy legacy data.json if present
    const DATA_FILE = path.join(__dirname, '..', 'data.json');
    if (fs.existsSync(DATA_FILE)) {
      fs.copyFileSync(DATA_FILE, dest);
      return dest;
    }
    throw e;
  }
}

// Only allow authenticated users; editing flags restricted to Admins
router.get('/', requireAuth, (req, res) => {
  const featureFlags = req.app.locals.featureFlags || {};
  const backupConfig = req.app.locals.backupConfig || { enabled: false, frequency: 'daily', path: DEFAULT_BACKUP_DIR };
  res.render('settings', { title: 'Settings', featureFlags, backupConfig });
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

// Restore endpoint (upload JSON file)
router.post('/restore', requireAuth, canManageUsers, upload.single('backupFile'), async (req, res) => {
  try {
    if (!req.file) {
      req.flash('error_msg', 'No file uploaded');
      return res.redirect('/settings');
    }
    // Validate JSON first
    const parsed = JSON.parse(req.file.buffer.toString('utf8'));
    // Backup current before overwrite
    performBackup();

    // If parsed looks like combined snapshot (users + patients/tests/templates/counters)
    if (parsed && (parsed.users || parsed.patients || parsed.tests || parsed.templates || parsed.counters)) {
      try {
        // Use global.db.write if available (it will save users and lab split)
        if (global.db && typeof global.db.write === 'function') {
          await global.db.write(parsed);
        } else {
          // Fallback: write files directly
          const usersFile = path.join(__dirname, '..', 'data-users.json');
          const labFile = path.join(__dirname, '..', 'data-lab.json');
          fs.writeFileSync(usersFile, JSON.stringify(parsed.users || [], null, 2), 'utf8');
          const lab = { patients: parsed.patients || [], tests: parsed.tests || [], templates: parsed.templates || [], counters: parsed.counters || {} };
          fs.writeFileSync(labFile, JSON.stringify(lab, null, 2), 'utf8');
        }
        req.flash('success_msg', 'Restore completed (previous data backed up)');
      } catch (e) {
        console.error('Restore write error:', e);
        req.flash('error_msg', `Restore failed while writing data: ${e && e.message ? e.message : String(e)}`);
      }
    } else {
      // Unknown format: write to combined data.json for compatibility
      const DATA_FILE = path.join(__dirname, '..', 'data.json');
      fs.writeFileSync(DATA_FILE, JSON.stringify(parsed, null, 2), 'utf8');
      req.flash('success_msg', 'Restore completed (written to legacy data.json)');
    }
  } catch (e) {
    console.error('Restore error:', e);
    req.flash('error_msg', `Restore failed: ${e && e.message ? e.message : String(e)}`);
  }
  return res.redirect('/settings');
});

// Clear data endpoint (backs up current data, preserves Admin users)
router.post('/clear', requireAuth, canManageUsers, (req, res) => {
  try {
    // Backup current before clearing
    performBackup();

    // Preserve Admin users only, clear lab data
    const users = (global.db && typeof global.db.getUsers === 'function') ? global.db.getUsers() : [];
    const adminUsers = Array.isArray(users) ? users.filter(u => u && u.role === 'Admin') : [];
    if (global.db && typeof global.db.saveUsers === 'function') {
      global.db.saveUsers(adminUsers);
    } else {
      const usersFile = path.join(__dirname, '..', 'data-users.json');
      fs.writeFileSync(usersFile, JSON.stringify(adminUsers, null, 2), 'utf8');
    }

    // Clear lab data
    if (global.db && typeof global.db.savePatients === 'function') global.db.savePatients([]);
    if (global.db && typeof global.db.saveTests === 'function') global.db.saveTests([]);
    if (global.db && typeof global.db.saveTemplates === 'function') global.db.saveTemplates([]);
    if (global.db && typeof global.db.saveCounters === 'function') global.db.saveCounters({});

    req.flash('success_msg', 'Data cleared (admin users preserved). Backup created.');
  } catch (e) {
    console.error('Clear data error:', e);
    req.flash('error_msg', `Clear data failed: ${e && e.message ? e.message : String(e)}`);
  }
  return res.redirect('/settings');
});

module.exports = router;
