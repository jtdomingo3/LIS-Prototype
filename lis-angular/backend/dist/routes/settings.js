"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const connection_1 = require("../db/connection");
const auth_1 = require("../middleware/auth");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const router = (0, express_1.Router)();
router.use(auth_1.requireAuth);
/**
 * GET /api/settings - Get current settings
 */
router.get('/', (0, auth_1.requirePermission)('users'), (req, res) => {
    try {
        const db = (0, connection_1.getDb)();
        const rows = db.prepare('SELECT key, value FROM settings').all();
        const settings = {};
        for (const row of rows) {
            try {
                settings[row.key] = JSON.parse(row.value);
            }
            catch {
                settings[row.key] = row.value;
            }
        }
        return res.json({ settings });
    }
    catch (err) {
        console.error('[settings] get error:', err);
        return res.status(500).json({ error: 'Failed to get settings' });
    }
});
/**
 * PUT /api/settings - Update settings
 */
router.put('/', (0, auth_1.requirePermission)('users'), (req, res) => {
    try {
        const db = (0, connection_1.getDb)();
        const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?');
        const transaction = db.transaction((entries) => {
            for (const [key, value] of entries) {
                const serialized = typeof value === 'string' ? value : JSON.stringify(value);
                upsert.run(key, serialized, serialized);
            }
        });
        transaction(Object.entries(req.body));
        return res.json({ message: 'Settings updated' });
    }
    catch (err) {
        console.error('[settings] update error:', err);
        return res.status(500).json({ error: 'Failed to update settings' });
    }
});
/**
 * POST /api/settings/backup - Create a backup of the database
 */
router.post('/backup', (0, auth_1.requirePermission)('users'), (req, res) => {
    try {
        const db = (0, connection_1.getDb)();
        const backupDir = req.body.path || path_1.default.join(process.env.USERPROFILE || '', 'Documents', 'LIS', 'backup');
        if (!fs_1.default.existsSync(backupDir)) {
            fs_1.default.mkdirSync(backupDir, { recursive: true });
        }
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path_1.default.join(backupDir, `lis-backup-${timestamp}.db`);
        // SQLite backup using VACUUM INTO
        db.exec(`VACUUM INTO '${backupPath.replace(/'/g, "''")}'`);
        return res.json({ message: 'Backup created', path: backupPath });
    }
    catch (err) {
        console.error('[settings] backup error:', err);
        return res.status(500).json({ error: 'Failed to create backup' });
    }
});
/**
 * POST /api/settings/restore - Restore from a backup file
 */
router.post('/restore', (0, auth_1.requirePermission)('users'), (req, res) => {
    try {
        // This would accept a file upload and replace the current DB
        return res.status(501).json({ message: 'Database restore via upload - to be implemented' });
    }
    catch (err) {
        console.error('[settings] restore error:', err);
        return res.status(500).json({ error: 'Failed to restore' });
    }
});
/**
 * GET /api/settings/export - Export all data as JSON
 */
router.get('/export', (0, auth_1.requirePermission)('users'), (req, res) => {
    try {
        const db = (0, connection_1.getDb)();
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
    }
    catch (err) {
        console.error('[settings] export error:', err);
        return res.status(500).json({ error: 'Failed to export data' });
    }
});
exports.default = router;
//# sourceMappingURL=settings.js.map