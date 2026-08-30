/**
 * SQLite Database Adapter for Gezyne LIS
 * 
 * Drop-in replacement for the JSON file-based db object in server.js.
 * Exposes the identical API: read(), write(), getPatients(), savePatients(),
 * getTests(), saveTests(), getUsers(), saveUsers(), getTemplates(),
 * saveTemplates(), getCounters(), saveCounters().
 * 
 * Uses better-sqlite3 for synchronous operations (matching the existing
 * synchronous API contract) with WAL mode for crash safety and performance.
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const SCHEMA_VERSION = 1;

function getNativeBindingPath() {
  const isPkg = !!process.pkg;
  const execDir = isPkg ? path.dirname(process.execPath) : path.join(__dirname, '..');
  
  const candidates = [
    path.join(execDir, 'better_sqlite3.node'),
    path.join(execDir, 'server', 'better_sqlite3.node'),
    path.join(execDir, 'node_modules', 'better-sqlite3', 'prebuilds', `win32-${process.arch}.node`),
    path.join(__dirname, '..', 'node_modules', 'better-sqlite3', 'prebuilds', `win32-${process.arch}.node`),
    path.join(process.resourcesPath || '', 'server', 'better_sqlite3.node'),
    path.join(process.resourcesPath || '', 'better_sqlite3.node')
  ];

  for (const c of candidates) {
    try { if (c && fs.existsSync(c)) return c; } catch (e) {}
  }
  return undefined;
}

/**
 * Create and return a db adapter backed by SQLite.
 * @param {string} dbPath - Absolute path to the .db file
 * @param {object} [opts] - Options
 * @param {boolean} [opts.verbose] - Log SQL operations
 * @returns {object} db adapter with the standard API
 */
function createDb(dbPath, opts = {}) {
  // Ensure parent directory exists
  const dir = path.dirname(dbPath);
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { /* ignore */ }

  const dbOptions = {
    verbose: opts.verbose ? console.log : undefined
  };

  const nativeBinding = getNativeBindingPath();
  if (nativeBinding) {
    dbOptions.nativeBinding = nativeBinding;
  }

  const sqlite = new Database(dbPath, dbOptions);

  // Performance & safety pragmas
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');

  // Create tables
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS patients (
      id TEXT PRIMARY KEY,
      patientId TEXT,
      patientCode TEXT,
      firstName TEXT,
      lastName TEXT,
      createdAt TEXT,
      json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_patients_patientId ON patients(patientId);
    CREATE INDEX IF NOT EXISTS idx_patients_code ON patients(patientCode);

    CREATE TABLE IF NOT EXISTS tests (
      id TEXT PRIMARY KEY,
      testId TEXT,
      patient TEXT,
      testType TEXT,
      status TEXT,
      updatedAt TEXT,
      createdAt TEXT,
      json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tests_testId ON tests(testId);
    CREATE INDEX IF NOT EXISTS idx_tests_patient ON tests(patient);
    CREATE INDEX IF NOT EXISTS idx_tests_status ON tests(status);

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      role TEXT,
      status TEXT,
      json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      name TEXT,
      testType TEXT,
      isActive INTEGER DEFAULT 1,
      json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS counters (
      key TEXT PRIMARY KEY,
      value INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY DEFAULT 'main',
      json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Store schema version
  const metaUpsert = sqlite.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)');
  const metaGet = sqlite.prepare('SELECT value FROM meta WHERE key = ?');
  const currentVersion = metaGet.get('schema_version');
  if (!currentVersion) {
    metaUpsert.run('schema_version', String(SCHEMA_VERSION));
  }

  // ---- Prepared statements ----

  // Patients
  const stmts = {};
  stmts.getAllPatients = sqlite.prepare('SELECT json FROM patients ORDER BY createdAt DESC');
  stmts.upsertPatient = sqlite.prepare(`
    INSERT OR REPLACE INTO patients (id, patientId, patientCode, firstName, lastName, createdAt, json)
    VALUES (@id, @patientId, @patientCode, @firstName, @lastName, @createdAt, @json)
  `);
  stmts.deleteAllPatients = sqlite.prepare('DELETE FROM patients');

  // Tests
  stmts.getAllTests = sqlite.prepare('SELECT json FROM tests ORDER BY createdAt DESC');
  stmts.getTestById = sqlite.prepare('SELECT json FROM tests WHERE id = ?');
  stmts.upsertTest = sqlite.prepare(`
    INSERT OR REPLACE INTO tests (id, testId, patient, testType, status, updatedAt, createdAt, json)
    VALUES (@id, @testId, @patient, @testType, @status, @updatedAt, @createdAt, @json)
  `);
  stmts.deleteTest = sqlite.prepare('DELETE FROM tests WHERE id = ?');
  stmts.deleteAllTests = sqlite.prepare('DELETE FROM tests');

  // Users
  stmts.getAllUsers = sqlite.prepare('SELECT json FROM users ORDER BY rowid');
  stmts.upsertUser = sqlite.prepare(`
    INSERT OR REPLACE INTO users (id, email, role, status, json)
    VALUES (@id, @email, @role, @status, @json)
  `);
  stmts.deleteAllUsers = sqlite.prepare('DELETE FROM users');

  // Templates
  stmts.getAllTemplates = sqlite.prepare('SELECT json FROM templates ORDER BY rowid');
  stmts.upsertTemplate = sqlite.prepare(`
    INSERT OR REPLACE INTO templates (id, name, testType, isActive, json)
    VALUES (@id, @name, @testType, @isActive, @json)
  `);
  stmts.deleteAllTemplates = sqlite.prepare('DELETE FROM templates');

  // Counters
  stmts.getAllCounters = sqlite.prepare('SELECT key, value FROM counters');
  stmts.upsertCounter = sqlite.prepare('INSERT OR REPLACE INTO counters (key, value) VALUES (?, ?)');
  stmts.deleteAllCounters = sqlite.prepare('DELETE FROM counters');

  // Settings
  stmts.getSettings = sqlite.prepare("SELECT json FROM settings WHERE key = 'main'");
  stmts.upsertSettings = sqlite.prepare("INSERT OR REPLACE INTO settings (key, json) VALUES ('main', ?)");

  // ---- Helper functions ----

  function parseRows(rows) {
    return rows.map(r => {
      try { return JSON.parse(r.json); } catch (e) { return null; }
    }).filter(Boolean);
  }

  function safeStr(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'string') return v;
    if (v instanceof Date) return v.toISOString();
    return String(v);
  }

  // ---- The db API object ----

  const db = {
    /** Get the underlying better-sqlite3 Database instance */
    _sqlite: sqlite,

    // -- Patients --
    getPatients() {
      return parseRows(stmts.getAllPatients.all());
    },

    savePatients(patients) {
      const arr = Array.isArray(patients) ? patients : [];
      const tx = sqlite.transaction(() => {
        // Build set of incoming IDs
        const incomingIds = new Set(arr.filter(p => p && p.id).map(p => p.id));
        // Delete patients not in incoming set (handles deletions)
        const existing = sqlite.prepare('SELECT id FROM patients').all();
        for (const row of existing) {
          if (!incomingIds.has(row.id)) {
            sqlite.prepare('DELETE FROM patients WHERE id = ?').run(row.id);
          }
        }
        // Upsert all incoming
        for (const p of arr) {
          if (!p || !p.id) continue;
          stmts.upsertPatient.run({
            id: p.id,
            patientId: safeStr(p.patientId),
            patientCode: safeStr(p.patientCode),
            firstName: safeStr(p.firstName),
            lastName: safeStr(p.lastName),
            createdAt: safeStr(p.createdAt),
            json: JSON.stringify(p)
          });
        }
      });
      tx();
    },

    // -- Tests --
    getTests() {
      return parseRows(stmts.getAllTests.all());
    },

    saveTests(tests) {
      const arr = Array.isArray(tests) ? tests : [];
      const tx = sqlite.transaction(() => {
        // Merge-aware save (mirrors the existing saveTests logic from server.js)
        // Build map of incoming tests
        const incomingMap = new Map();
        for (const t of arr) {
          if (t && t.id) incomingMap.set(t.id, t);
        }

        // Get current disk state
        const existing = parseRows(stmts.getAllTests.all());
        const mergedMap = new Map();

        // Seed with existing
        for (const t of existing) {
          if (t && t.id) mergedMap.set(t.id, t);
        }

        // Overlay with incoming when newer (or absent on disk)
        for (const t of arr) {
          if (!t || !t.id) continue;
          const cur = mergedMap.get(t.id);
          const curTs = cur && cur.updatedAt ? Date.parse(cur.updatedAt) : 0;
          const incomingTs = t.updatedAt ? Date.parse(t.updatedAt) : 0;
          if (!cur || incomingTs >= curTs) {
            mergedMap.set(t.id, t);
          }
        }

        // If the incoming array is smaller and we detect explicit removals,
        // handle deletion: if a test was in existing but not in incoming AND
        // not in mergedMap from a newer source, remove it.
        // For the typical "pass full array" pattern, incoming IS the truth.
        // We check: if incoming array length < existing and explicitly doesn't
        // include an id, that means deletion.
        if (arr.length < existing.length) {
          for (const t of existing) {
            if (t && t.id && !incomingMap.has(t.id)) {
              mergedMap.delete(t.id);
            }
          }
        }

        // Write all merged tests
        stmts.deleteAllTests.run();
        for (const t of mergedMap.values()) {
          stmts.upsertTest.run({
            id: t.id,
            testId: safeStr(t.testId),
            patient: safeStr(t.patient),
            testType: safeStr(t.testType),
            status: safeStr(t.status),
            updatedAt: safeStr(t.updatedAt),
            createdAt: safeStr(t.createdAt),
            json: JSON.stringify(t)
          });
        }
      });
      tx();
    },

    // -- Users --
    getUsers() {
      return parseRows(stmts.getAllUsers.all());
    },

    saveUsers(users) {
      const arr = Array.isArray(users) ? users : [];
      const tx = sqlite.transaction(() => {
        stmts.deleteAllUsers.run();
        for (const u of arr) {
          if (!u || !u.id) continue;
          stmts.upsertUser.run({
            id: u.id,
            email: safeStr(u.email),
            role: safeStr(u.role),
            status: safeStr(u.status),
            json: JSON.stringify(u)
          });
        }
      });
      tx();
    },

    // -- Templates --
    getTemplates() {
      return parseRows(stmts.getAllTemplates.all());
    },

    saveTemplates(templates) {
      const arr = Array.isArray(templates) ? templates : [];
      const tx = sqlite.transaction(() => {
        stmts.deleteAllTemplates.run();
        for (const t of arr) {
          if (!t || !t.id) continue;
          stmts.upsertTemplate.run({
            id: t.id,
            name: safeStr(t.name),
            testType: safeStr(t.testType),
            isActive: t.isActive !== false ? 1 : 0,
            json: JSON.stringify(t)
          });
        }
      });
      tx();
    },

    // -- Counters --
    getCounters() {
      const rows = stmts.getAllCounters.all();
      const obj = {};
      for (const r of rows) {
        obj[r.key] = r.value;
      }
      return obj;
    },

    saveCounters(counters) {
      const tx = sqlite.transaction(() => {
        stmts.deleteAllCounters.run();
        if (counters && typeof counters === 'object') {
          for (const [key, value] of Object.entries(counters)) {
            stmts.upsertCounter.run(key, typeof value === 'number' ? value : parseInt(value, 10) || 0);
          }
        }
      });
      tx();
    },

    // -- Bulk read/write (compatibility with db.read() / db.write()) --

    /**
     * Read the entire database as a single object, matching the
     * structure of the old data.json: { patients, tests, templates, counters, settings, ... }
     */
    read() {
      const patients = db.getPatients();
      const tests = db.getTests();
      const templates = db.getTemplates();
      const counters = db.getCounters();

      // Settings
      let settings = {};
      try {
        const row = stmts.getSettings.get();
        if (row && row.json) settings = JSON.parse(row.json);
      } catch (e) {}

      return {
        patients,
        tests,
        templates,
        counters,
        settings
      };
    },

    /**
     * Write an entire data object back. This is used by routes/settings.js
     * and a few places that do db.read() → mutate → db.write(data).
     * We selectively update only the collections that are present.
     */
    write(data) {
      if (!data || typeof data !== 'object') return;
      const tx = sqlite.transaction(() => {
        if (Array.isArray(data.patients)) {
          stmts.deleteAllPatients.run();
          for (const p of data.patients) {
            if (!p || !p.id) continue;
            stmts.upsertPatient.run({
              id: p.id,
              patientId: safeStr(p.patientId),
              patientCode: safeStr(p.patientCode),
              firstName: safeStr(p.firstName),
              lastName: safeStr(p.lastName),
              createdAt: safeStr(p.createdAt),
              json: JSON.stringify(p)
            });
          }
        }

        if (Array.isArray(data.tests)) {
          stmts.deleteAllTests.run();
          for (const t of data.tests) {
            if (!t || !t.id) continue;
            stmts.upsertTest.run({
              id: t.id,
              testId: safeStr(t.testId),
              patient: safeStr(t.patient),
              testType: safeStr(t.testType),
              status: safeStr(t.status),
              updatedAt: safeStr(t.updatedAt),
              createdAt: safeStr(t.createdAt),
              json: JSON.stringify(t)
            });
          }
        }

        if (Array.isArray(data.templates)) {
          stmts.deleteAllTemplates.run();
          for (const t of data.templates) {
            if (!t || !t.id) continue;
            stmts.upsertTemplate.run({
              id: t.id,
              name: safeStr(t.name),
              testType: safeStr(t.testType),
              isActive: t.isActive !== false ? 1 : 0,
              json: JSON.stringify(t)
            });
          }
        }

        if (data.counters && typeof data.counters === 'object' && !Array.isArray(data.counters)) {
          stmts.deleteAllCounters.run();
          for (const [key, value] of Object.entries(data.counters)) {
            stmts.upsertCounter.run(key, typeof value === 'number' ? value : parseInt(value, 10) || 0);
          }
        }

        if (data.settings && typeof data.settings === 'object') {
          stmts.upsertSettings.run(JSON.stringify(data.settings));
        }
      });
      tx();
    },

    /**
     * Close the database connection gracefully
     */
    close() {
      try { sqlite.close(); } catch (e) {}
    },

    /**
     * Get the path to the database file
     */
    get path() {
      return dbPath;
    }
  };

  return db;
}

module.exports = { createDb };
