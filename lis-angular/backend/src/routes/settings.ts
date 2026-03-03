import { Router, Request, Response } from 'express';
import { getDb } from '../db/connection';
import { requireAuth, requirePermission } from '../middleware/auth';
import fs from 'fs';
import path from 'path';

const router = Router();

router.use(requireAuth);

/**
 * GET /api/settings - Get current settings
 */
router.get('/', requirePermission('users'), (req: Request, res: Response) => {
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
    return res.json({ settings });
  } catch (err: any) {
    console.error('[settings] get error:', err);
    return res.status(500).json({ error: 'Failed to get settings' });
  }
});

/**
 * PUT /api/settings - Update settings
 */
router.put('/', requirePermission('users'), (req: Request, res: Response) => {
  try {
    const db = getDb();
    const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?');
    const transaction = db.transaction((entries: [string, any][]) => {
      for (const [key, value] of entries) {
        const serialized = typeof value === 'string' ? value : JSON.stringify(value);
        upsert.run(key, serialized, serialized);
      }
    });

    transaction(Object.entries(req.body));
    return res.json({ message: 'Settings updated' });
  } catch (err: any) {
    console.error('[settings] update error:', err);
    return res.status(500).json({ error: 'Failed to update settings' });
  }
});

/**
 * POST /api/settings/backup - Create a backup of the database
 */
router.post('/backup', requirePermission('users'), (req: Request, res: Response) => {
  try {
    const db = getDb();
    const backupDir = req.body.path || path.join(process.env.USERPROFILE || '', 'Documents', 'LIS', 'backup');

    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(backupDir, `lis-backup-${timestamp}.db`);

    // SQLite backup using VACUUM INTO
    db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);

    return res.json({ message: 'Backup created', path: backupPath });
  } catch (err: any) {
    console.error('[settings] backup error:', err);
    return res.status(500).json({ error: 'Failed to create backup' });
  }
});

/**
 * POST /api/settings/restore - Restore from a backup file
 */
router.post('/restore', requirePermission('users'), (req: Request, res: Response) => {
  try {
    // This would accept a file upload and replace the current DB
    return res.status(501).json({ message: 'Database restore via upload - to be implemented' });
  } catch (err: any) {
    console.error('[settings] restore error:', err);
    return res.status(500).json({ error: 'Failed to restore' });
  }
});

/**
 * GET /api/settings/export - Export all data as JSON
 */
router.get('/export', requirePermission('users'), (req: Request, res: Response) => {
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
