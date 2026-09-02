/**
 * JSON → SQLite Migration Utility
 * 
 * Imports existing data.json and data-users.json into a SQLite database.
 * Run automatically on first server startup when lis-data.db doesn't exist
 * but JSON files do. Also callable from the tray app for manual imports.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Migrate data from JSON files into an existing SQLite db adapter.
 * 
 * @param {object} db - The SQLite db adapter (from sqliteDb.createDb)
 * @param {object} opts
 * @param {string} opts.dataJsonPath - Path to data.json
 * @param {string} opts.usersJsonPath - Path to data-users.json
 * @param {string} [opts.userDataKey] - Encryption key for data-users.json (if encrypted)
 * @param {boolean} [opts.renameAfter=true] - Rename JSON files to .migrated after import
 * @param {function} [opts.log] - Logging function (defaults to console.log)
 * @returns {{ success: boolean, counts: object, errors: string[] }}
 */
function migrateJsonToSqlite(db, opts = {}) {
  const log = opts.log || console.log;
  const errors = [];
  const counts = { patients: 0, tests: 0, users: 0, templates: 0, counters: 0 };
  const renameAfter = opts.renameAfter !== false;

  log('[migration] Starting JSON → SQLite migration...');

  // -- Import data.json --
  if (opts.dataJsonPath && fs.existsSync(opts.dataJsonPath)) {
    try {
      const raw = fs.readFileSync(opts.dataJsonPath, 'utf8');
      const data = JSON.parse(raw);

      if (data && typeof data === 'object') {
        // Patients
        if (Array.isArray(data.patients) && data.patients.length > 0) {
          db.savePatients(data.patients);
          counts.patients = data.patients.length;
          log(`[migration] Imported ${counts.patients} patients`);
        }

        // Tests
        if (Array.isArray(data.tests) && data.tests.length > 0) {
          // Use write() to bypass merge logic on fresh import
          const currentData = db.read();
          currentData.tests = data.tests;
          db.write(currentData);
          counts.tests = data.tests.length;
          log(`[migration] Imported ${counts.tests} tests`);
        }

        // Templates
        if (Array.isArray(data.templates) && data.templates.length > 0) {
          db.saveTemplates(data.templates);
          counts.templates = data.templates.length;
          log(`[migration] Imported ${counts.templates} templates`);
        }

        // Counters
        if (data.counters && typeof data.counters === 'object' && !Array.isArray(data.counters)) {
          db.saveCounters(data.counters);
          counts.counters = Object.keys(data.counters).length;
          log(`[migration] Imported ${counts.counters} counters`);
        }

        // Settings
        if (data.settings && typeof data.settings === 'object') {
          const full = db.read();
          full.settings = data.settings;
          db.write(full);
          log(`[migration] Imported settings`);
        }
      }

      // Rename source file
      if (renameAfter) {
        const dest = opts.dataJsonPath + '.migrated';
        try {
          // Don't overwrite existing .migrated backup
          if (!fs.existsSync(dest)) {
            fs.renameSync(opts.dataJsonPath, dest);
            log(`[migration] Renamed ${path.basename(opts.dataJsonPath)} → ${path.basename(dest)}`);
          } else {
            log(`[migration] Backup already exists: ${path.basename(dest)}, skipping rename`);
          }
        } catch (e) {
          log(`[migration] Warning: could not rename ${path.basename(opts.dataJsonPath)}: ${e.message}`);
        }
      }
    } catch (e) {
      errors.push(`data.json import failed: ${e.message}`);
      log(`[migration] ERROR importing data.json: ${e.message}`);
    }
  } else {
    log('[migration] No data.json found, skipping data import');
  }

  // -- Import data-users.json --
  if (opts.usersJsonPath && fs.existsSync(opts.usersJsonPath)) {
    try {
      const raw = fs.readFileSync(opts.usersJsonPath, 'utf8');
      let users;

      // Try to decrypt if key is provided
      if (opts.userDataKey) {
        try {
          users = decryptJson(raw, opts.userDataKey);
        } catch (e) {
          // Maybe it's not encrypted, try plain parse
          users = JSON.parse(raw);
        }
      } else {
        users = JSON.parse(raw);
      }

      if (Array.isArray(users) && users.length > 0) {
        db.saveUsers(users);
        counts.users = users.length;
        log(`[migration] Imported ${counts.users} users`);
      }

      // Rename source file
      if (renameAfter) {
        const dest = opts.usersJsonPath + '.migrated';
        try {
          if (!fs.existsSync(dest)) {
            fs.renameSync(opts.usersJsonPath, dest);
            log(`[migration] Renamed ${path.basename(opts.usersJsonPath)} → ${path.basename(dest)}`);
          }
        } catch (e) {
          log(`[migration] Warning: could not rename ${path.basename(opts.usersJsonPath)}: ${e.message}`);
        }
      }
    } catch (e) {
      errors.push(`data-users.json import failed: ${e.message}`);
      log(`[migration] ERROR importing data-users.json: ${e.message}`);
    }
  } else {
    log('[migration] No data-users.json found, skipping users import');
  }

  const success = errors.length === 0;
  log(`[migration] Migration complete. Success=${success} Patients=${counts.patients} Tests=${counts.tests} Users=${counts.users} Templates=${counts.templates} Counters=${counts.counters}`);

  return { success, counts, errors };
}

// -- Decrypt helper (mirrors server.js logic) --
function decryptJson(raw, key) {
  if (!raw) return [];
  if (!key) return JSON.parse(raw);

  let parsed;
  try { parsed = JSON.parse(raw); } catch (e) { return JSON.parse(raw || '[]'); }

  if (!parsed || !parsed.data) return parsed;

  const derivedKey = crypto.createHash('sha256').update(String(key)).digest();
  const iv = Buffer.from(parsed.iv, 'base64');
  const tag = Buffer.from(parsed.tag, 'base64');
  const encrypted = Buffer.from(parsed.data, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(dec.toString('utf8'));
}

/**
 * Import a JSON file (data.json or data-users.json format) into an existing
 * SQLite database. Used by the tray app Upload feature.
 * 
 * @param {object} db - The SQLite db adapter
 * @param {string} jsonFilePath - Path to the JSON file
 * @param {'data'|'users'} type - Type of import
 * @param {string} [userDataKey] - Encryption key for users file
 */
function importJsonFile(db, jsonFilePath, type, userDataKey) {
  return migrateJsonToSqlite(db, {
    dataJsonPath: type === 'data' ? jsonFilePath : null,
    usersJsonPath: type === 'users' ? jsonFilePath : null,
    userDataKey,
    renameAfter: false, // Don't rename uploaded files
    log: console.log
  });
}

module.exports = { migrateJsonToSqlite, importJsonFile };
