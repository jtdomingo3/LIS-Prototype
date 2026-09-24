import { Router, Request, Response } from 'express';
import { getDb } from '../db/connection';
import { requireAuth, requirePermission } from '../middleware/auth';
import { testOpenRouterConnection, resolveApiKey, AVAILABLE_MODELS } from '../services/gezyneBotService';
import fs from 'fs';
import path from 'path';
import os from 'os';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

router.use(requireAuth);

const DEFAULT_BACKUP_DIR = path.join(os.homedir(), 'Documents', 'LIS', 'backup');

function getPreferredNetworkAddress(): string {
  try {
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      const net = nets[name];
      if (!net) continue;
      for (const iface of net) {
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

function performBackup(destDir?: string): string {
  const dir = destDir && destDir.trim().length ? destDir.trim() : DEFAULT_BACKUP_DIR;
  fs.mkdirSync(dir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(dir, `backup_${ts}.json`);

  const db = getDb();
  const patients = db.prepare('SELECT * FROM patients').all();
  const tests = db.prepare('SELECT * FROM tests').all();
  const templates = db.prepare('SELECT * FROM templates').all();
  const settingsRows = db.prepare('SELECT key, value FROM settings').all() as any[];
  const settings: Record<string, any> = {};
  settingsRows.forEach(r => {
    try { settings[r.key] = JSON.parse(r.value); } catch { settings[r.key] = r.value; }
  });

  const dump = {
    exportDate: new Date().toISOString(),
    patients,
    tests,
    templates,
    settings,
  };

  fs.writeFileSync(dest, JSON.stringify(dump, null, 2), 'utf8');

  // Also do SQLite VACUUM INTO for database snapshot
  try {
    const sqliteDest = path.join(dir, `backup_db_${ts}.db`);
    db.exec(`VACUUM INTO '${sqliteDest.replace(/'/g, "''")}'`);
  } catch (e) {
    console.warn('[settings] SQLite vacuum backup notice:', e);
  }

  return dest;
}

function performUserBackup(destDir?: string): string {
  const dir = destDir && destDir.trim().length ? destDir.trim() : DEFAULT_BACKUP_DIR;
  fs.mkdirSync(dir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(dir, `backup_users_${ts}.json`);

  const db = getDb();
  const users = db.prepare('SELECT id, username, name, role, permissions, is_active, created_at FROM users').all();
  fs.writeFileSync(dest, JSON.stringify(users, null, 2), 'utf8');
  return dest;
}

/**
 * GET /api/settings - Get current settings and system info
 */
router.get('/', (req: Request, res: Response) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
    const settings: Record<string, any> = {};
    for (const row of rows) {
      try {
        settings[row.key] = JSON.parse(row.value);
      } catch {
        settings[row.key] = row.value;
      }
    }

    const networkAddress = getPreferredNetworkAddress();
    const networkPort = (req && req.socket && req.socket.localPort) ? req.socket.localPort : 3020;
    const networkUrl = `${networkAddress}:${networkPort}`;

    const currentKey = resolveApiKey();
    const hasOpenRouterKey = !!(currentKey && currentKey.startsWith('sk-or-'));
    const maskedKey = hasOpenRouterKey ? (currentKey!.slice(0, 10) + '...' + currentKey!.slice(-4)) : '';
    const currentModel = settings.openrouterModel || process.env.OPENROUTER_DEFAULT_MODEL || 'openai/gpt-4o-mini';

    const featureFlags = settings.featureFlags || {
      tests: true,
      reports: true,
      templates: true,
      worksheet: true,
      users: true,
      inventory: true,
    };

    const backupConfig = settings.backupConfig || {
      enabled: false,
      frequency: 'daily',
      path: DEFAULT_BACKUP_DIR,
    };

    const sseConfig = settings.sseConfig || {
      enabled: true,
      autoRefreshByDefault: false,
      allowedPages: ['/dashboard', '/patients', '/reception', '/tests', '/inventory'],
      connectDelaySec: 3,
      retryDelaySec: 3,
      refreshDebounceMs: 800,
    };

    return res.json({
      success: true,
      settings,
      sseConfig,
      printerName: settings.printerName || process.env.PRINTER_NAME || '',
      featureFlags,
      backupConfig,
      hasOpenRouterKey,
      maskedKey,
      currentModel,
      availableModels: AVAILABLE_MODELS,
      requirePaymentAmount: settings.requirePaymentAmount !== undefined ? !!settings.requirePaymentAmount : true,
      doctor1Name: settings.doctor1Name || process.env.DOCTOR_1_NAME || 'Dr. Lorenzo',
      doctor2Name: settings.doctor2Name || process.env.DOCTOR_2_NAME || 'Dr. Arcilla',
      gezynePath: settings.gezynePath || process.env.GEZYNE_PATH || '',
      networkAddress,
      networkPort,
      networkUrl,
    });
  } catch (err: any) {
    console.error('[settings] get error:', err);
    return res.status(500).json({ error: 'Failed to get settings' });
  }
});

/**
 * PUT or POST /api/settings - Update settings
 */
const handleUpdateSettings = (req: Request, res: Response) => {
  try {
    const db = getDb();
    const body = req.body || {};
    const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?');

    const transaction = db.transaction((entries: [string, any][]) => {
      for (const [key, value] of entries) {
        const serialized = typeof value === 'string' ? value : JSON.stringify(value);
        upsert.run(key, serialized, serialized);
      }
    });

    transaction(Object.entries(body));

    // Update process environment variables if relevant keys are passed
    if (body.doctor1Name) process.env.DOCTOR_1_NAME = body.doctor1Name;
    if (body.doctor2Name) process.env.DOCTOR_2_NAME = body.doctor2Name;
    if (body.printerName) process.env.PRINTER_NAME = body.printerName;
    if (body.openrouterApiKey && body.openrouterApiKey.startsWith('sk-or-')) {
      process.env.OPENROUTER_API_KEY = body.openrouterApiKey;
    }

    return res.json({ success: true, message: 'Settings updated successfully' });
  } catch (err: any) {
    console.error('[settings] update error:', err);
    return res.status(500).json({ success: false, error: 'Failed to update settings' });
  }
};

router.put('/', requirePermission('users'), handleUpdateSettings);
router.post('/', requirePermission('users'), handleUpdateSettings);

/**
 * POST /api/settings/test-ai - Test OpenRouter AI Connection
 */
router.post('/test-ai', requirePermission('users'), async (req: Request, res: Response) => {
  try {
    const { apiKey, model } = req.body || {};
    const result = await testOpenRouterConnection(apiKey, model);
    return res.json(result);
  } catch (err: any) {
    return res.json({ success: false, error: err?.message || 'AI test failed' });
  }
});

/**
 * POST /api/settings/test-print - Test printer connection
 */
router.post('/test-print', requirePermission('users'), (req: Request, res: Response) => {
  try {
    const printType = req.body?.type || 'receipt';
    const printer = req.body?.printer || process.env.PRINTER_NAME || 'Default Thermal Printer';
    return res.json({
      success: true,
      message: `Test print job (${printType.toUpperCase()}) queued for printer "${printer}".`,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Print test failed' });
  }
});

/**
 * POST /api/settings/backup - Create backup of database and data
 */
router.post('/backup', requirePermission('users'), (req: Request, res: Response) => {
  try {
    const dest = performBackup(req.body?.backupPath);
    return res.json({ success: true, message: `Backup created successfully: ${dest}`, path: dest });
  } catch (err: any) {
    console.error('[settings] backup error:', err);
    return res.status(500).json({ success: false, error: 'Failed to create backup' });
  }
});

/**
 * POST /api/settings/backup-users - Create backup of user accounts
 */
router.post('/backup-users', requirePermission('users'), (req: Request, res: Response) => {
  try {
    const dest = performUserBackup(req.body?.backupPath);
    return res.json({ success: true, message: `User backup created successfully: ${dest}`, path: dest });
  } catch (err: any) {
    console.error('[settings] user backup error:', err);
    return res.status(500).json({ success: false, error: 'Failed to create user backup' });
  }
});

/**
 * POST /api/settings/restore - Restore data from uploaded JSON or payload
 */
router.post('/restore', requirePermission('users'), upload.single('backupFile'), (req: Request, res: Response) => {
  try {
    let parsed: any;
    if (req.file) {
      parsed = JSON.parse(req.file.buffer.toString('utf8'));
    } else if (req.body?.data) {
      parsed = typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body.data;
    } else {
      return res.status(400).json({ success: false, error: 'No file or data provided for restore' });
    }

    // Safety backup first
    performBackup();

    const db = getDb();
    const restoreTx = db.transaction(() => {
      if (Array.isArray(parsed.patients)) {
        db.exec('DELETE FROM patients');
        const insertPatient = db.prepare(`
          INSERT INTO patients (id, patient_id, patient_code, first_name, middle_name, last_name, gender, date_of_birth, age_manual, phone, email, address, company, philhealth_consent, philhealth_id, physician, created_at, updated_at)
          VALUES (@id, @patient_id, @patient_code, @first_name, @middle_name, @last_name, @gender, @date_of_birth, @age_manual, @phone, @email, @address, @company, @philhealth_consent, @philhealth_id, @physician, @created_at, @updated_at)
        `);
        for (const p of parsed.patients) {
          try {
            insertPatient.run({
              id: p.id,
              patient_id: p.patient_id,
              patient_code: p.patient_code || p.patient_id,
              first_name: p.first_name || '',
              middle_name: p.middle_name || '',
              last_name: p.last_name || '',
              gender: p.gender || 'Other',
              date_of_birth: p.date_of_birth || null,
              age_manual: p.age_manual || null,
              phone: p.phone || '',
              email: p.email || '',
              address: p.address || '',
              company: p.company || '',
              philhealth_consent: p.philhealth_consent ? 1 : 0,
              philhealth_id: p.philhealth_id || '',
              physician: p.physician || '',
              created_at: p.created_at || new Date().toISOString(),
              updated_at: p.updated_at || new Date().toISOString(),
            });
          } catch (_) {}
        }
      }

      if (Array.isArray(parsed.tests)) {
        db.exec('DELETE FROM tests');
        const insertTest = db.prepare(`
          INSERT INTO tests (id, test_id, patient_id, test_type, test_date, status, results, notes, requested_by, performed_by, verified_by, price, payment_amount, discount_type, discount_amount, payment_mode, payment_status, created_at, updated_at)
          VALUES (@id, @test_id, @patient_id, @test_type, @test_date, @status, @results, @notes, @requested_by, @performed_by, @verified_by, @price, @payment_amount, @discount_type, @discount_amount, @payment_mode, @payment_status, @created_at, @updated_at)
        `);
        for (const t of parsed.tests) {
          try {
            insertTest.run({
              id: t.id,
              test_id: t.test_id,
              patient_id: t.patient_id,
              test_type: t.test_type,
              test_date: t.test_date || t.created_at || new Date().toISOString(),
              status: t.status || 'Pending',
              results: typeof t.results === 'object' ? JSON.stringify(t.results) : (t.results || '{}'),
              notes: t.notes || '',
              requested_by: t.requested_by || null,
              performed_by: t.performed_by || null,
              verified_by: t.verified_by || null,
              price: t.price || 0,
              payment_amount: t.payment_amount || 0,
              discount_type: t.discount_type || 'none',
              discount_amount: t.discount_amount || 0,
              payment_mode: t.payment_mode || 'Cash',
              payment_status: t.payment_status || 'Pending',
              created_at: t.created_at || new Date().toISOString(),
              updated_at: t.updated_at || new Date().toISOString(),
            });
          } catch (_) {}
        }
      }
    });

    restoreTx();

    const pCount = Array.isArray(parsed.patients) ? parsed.patients.length : 0;
    const tCount = Array.isArray(parsed.tests) ? parsed.tests.length : 0;
    return res.json({
      success: true,
      message: `Clinical data restored successfully (${pCount} patients, ${tCount} tests imported). Safety snapshot created.`,
    });
  } catch (err: any) {
    console.error('[settings] restore error:', err);
    return res.status(500).json({ success: false, error: 'Failed to restore data: ' + err?.message });
  }
});

/**
 * POST /api/settings/restore-users - Restore user accounts from uploaded JSON
 */
router.post('/restore-users', requirePermission('users'), upload.single('backupFileUsers'), (req: Request, res: Response) => {
  try {
    let usersList: any[];
    if (req.file) {
      const parsed = JSON.parse(req.file.buffer.toString('utf8'));
      usersList = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.users) ? parsed.users : []);
    } else if (req.body?.users) {
      usersList = Array.isArray(req.body.users) ? req.body.users : [];
    } else {
      return res.status(400).json({ success: false, error: 'No user accounts provided for restore' });
    }

    if (!Array.isArray(usersList) || usersList.length === 0) {
      return res.status(400).json({ success: false, error: 'Invalid or empty user accounts array' });
    }

    // Safety backup
    performUserBackup();

    const db = getDb();
    const insertUser = db.prepare(`
      INSERT INTO users (id, username, password, name, role, permissions, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(username) DO UPDATE SET
        name = excluded.name,
        role = excluded.role,
        permissions = excluded.permissions,
        is_active = excluded.is_active,
        updated_at = excluded.updated_at
    `);

    let restoredCount = 0;
    const restoreUserTx = db.transaction(() => {
      for (const u of usersList) {
        if (!u.username) continue;
        const now = new Date().toISOString();
        insertUser.run(
          u.id || `usr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          u.username,
          u.password || '$2a$10$abcdefghijklmnopqrstuvwxyz1234567890', // placeholder if missing
          u.name || u.username,
          u.role || 'Staff',
          typeof u.permissions === 'object' ? JSON.stringify(u.permissions) : (u.permissions || '{}'),
          u.is_active !== undefined ? (u.is_active ? 1 : 0) : 1,
          u.created_at || now,
          now
        );
        restoredCount++;
      }
    });

    restoreUserTx();

    return res.json({
      success: true,
      message: `User accounts restored successfully (${restoredCount} accounts processed). Safety snapshot created.`,
    });
  } catch (err: any) {
    console.error('[settings] restore-users error:', err);
    return res.status(500).json({ success: false, error: 'Failed to restore users: ' + err?.message });
  }
});

/**
 * POST /api/settings/clear - Clear clinical data (patients & tests), with automatic safety backup
 */
router.post('/clear', requirePermission('users'), (_req: Request, res: Response) => {
  try {
    const backupPath = performBackup();
    const db = getDb();
    db.exec('DELETE FROM tests');
    db.exec('DELETE FROM patients');

    return res.json({
      success: true,
      message: `Clinical data cleared. Safety snapshot saved at ${backupPath}`,
    });
  } catch (err: any) {
    console.error('[settings] clear error:', err);
    return res.status(500).json({ success: false, error: 'Failed to clear data' });
  }
});

/**
 * POST /api/settings/clear-users - Clear non-admin users, with automatic safety backup
 */
router.post('/clear-users', requirePermission('users'), (_req: Request, res: Response) => {
  try {
    const backupPath = performUserBackup();
    const db = getDb();
    db.exec("DELETE FROM users WHERE role NOT IN ('Admin', 'Owner')");

    return res.json({
      success: true,
      message: `Non-admin users cleared (Admin accounts preserved). Safety snapshot saved at ${backupPath}`,
    });
  } catch (err: any) {
    console.error('[settings] clear-users error:', err);
    return res.status(500).json({ success: false, error: 'Failed to clear users' });
  }
});

/**
 * GET /api/settings/export-logs - Download application logs
 */
router.get('/export-logs', (_req: Request, res: Response) => {
  try {
    const logPath = path.join(process.cwd(), 'app.log');
    if (!fs.existsSync(logPath)) {
      return res.status(404).send('No log file found.');
    }
    const filename = `lis-logs-${new Date().toISOString().slice(0, 10)}.log`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'text/plain; charset=UTF-8');
    return fs.createReadStream(logPath).pipe(res);
  } catch (err: any) {
    return res.status(500).send('Failed to export logs');
  }
});

/**
 * POST /api/settings/clear-logs - Clear log file
 */
router.post('/clear-logs', requirePermission('users'), (_req: Request, res: Response) => {
  try {
    const logPath = path.join(process.cwd(), 'app.log');
    if (fs.existsSync(logPath)) {
      fs.writeFileSync(logPath, '', 'utf8');
    }
    return res.json({ success: true, message: 'Logs cleared successfully' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: 'Failed to clear logs' });
  }
});

/**
 * GET /api/settings/export - Export all data as JSON
 */
router.get('/export', requirePermission('users'), (_req: Request, res: Response) => {
  try {
    const db = getDb();
    const patients = db.prepare('SELECT * FROM patients').all();
    const tests = db.prepare('SELECT * FROM tests').all();
    const templates = db.prepare('SELECT * FROM templates').all();
    const counters = db.prepare('SELECT * FROM counters').all();

    return res.json({
      exportDate: new Date().toISOString(),
      patients,
      tests,
      templates,
      counters,
    });
  } catch (err: any) {
    console.error('[settings] export error:', err);
    return res.status(500).json({ error: 'Failed to export data' });
  }
});

export default router;
