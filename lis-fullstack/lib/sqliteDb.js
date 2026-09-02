/**
 * SQLite Database Adapter for Gezyne LIS
 * 
 * Drop-in replacement for the JSON file-based db object in server.js.
 * Exposes the identical synchronous API:
 *   read(), write(), getPatients(), savePatients(),
 *   getTests(), saveTests(), getUsers(), saveUsers(),
 *   getTemplates(), saveTemplates(), getCounters(), saveCounters().
 * 
 * Uses better-sqlite3 when available, and automatically falls back to sql.js
 * (WebAssembly SQLite) when running inside packaged binaries (pkg) or environments
 * without native C++ compilation. Both engines persist data to standard SQLite .db files.
 */

const path = require('path');
const fs = require('fs');

const SCHEMA_VERSION = 1;

let BetterSqlite3 = null;
try {
  // Only attempt better-sqlite3 outside of pkg snapshot to avoid N-API version mismatches
  if (!process.pkg) {
    BetterSqlite3 = require('better-sqlite3');
  }
} catch (e) {
  BetterSqlite3 = null;
}

let SqlJs = null;
let sqlJsInitPromise = null;

function getSqlJs() {
  if (SqlJs) return Promise.resolve(SqlJs);
  if (sqlJsInitPromise) return sqlJsInitPromise;

  const initSqlJs = require('sql.js');
  const isPkg = !!process.pkg;
  const execDir = isPkg ? path.dirname(process.execPath) : path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist');

  sqlJsInitPromise = initSqlJs({
    locateFile: file => {
      const candidates = [
        path.join(execDir, file),
        path.join(path.dirname(process.execPath || ''), file),
        path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', file),
        path.join(process.resourcesPath || '', 'server', file),
        path.join(process.resourcesPath || '', file)
      ];
      for (const c of candidates) {
        try { if (fs.existsSync(c)) return c; } catch (e) {}
      }
      return path.join(execDir, file);
    }
  }).then(SQL => {
    SqlJs = SQL;
    return SQL;
  });

  return sqlJsInitPromise;
}

// Pre-initialize sql.js immediately
try { getSqlJs().catch(() => {}); } catch (e) {}

/**
 * Helper: parse an array of rows containing a .json column
 */
function parseRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(r => {
    try {
      return typeof r === 'string' ? JSON.parse(r) : JSON.parse(r.json);
    } catch (e) {
      return null;
    }
  }).filter(Boolean);
}

function safeStr(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v;
  if (v instanceof Date) return v.toISOString();
  return String(v);
}

/**
 * Create a better-sqlite3 backed adapter
 */
function createBetterSqliteDb(dbPath, opts = {}) {
  const dir = path.dirname(dbPath);
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}

  const sqlite = new BetterSqlite3(dbPath, {
    verbose: opts.verbose ? console.log : undefined
  });

  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');

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

  const stmts = {
    getAllPatients: sqlite.prepare('SELECT json FROM patients ORDER BY createdAt DESC'),
    getPatientById: sqlite.prepare('SELECT json FROM patients WHERE id = ?'),
    upsertPatient: sqlite.prepare('INSERT OR REPLACE INTO patients (id, patientId, patientCode, firstName, lastName, createdAt, json) VALUES (@id, @patientId, @patientCode, @firstName, @lastName, @createdAt, @json)'),
    deletePatientById: sqlite.prepare('DELETE FROM patients WHERE id = ?'),
    deleteAllPatients: sqlite.prepare('DELETE FROM patients'),
    getAllTests: sqlite.prepare('SELECT json FROM tests ORDER BY createdAt DESC'),
    getTestById: sqlite.prepare('SELECT json FROM tests WHERE id = ?'),
    upsertTest: sqlite.prepare('INSERT OR REPLACE INTO tests (id, testId, patient, testType, status, updatedAt, createdAt, json) VALUES (@id, @testId, @patient, @testType, @status, @updatedAt, @createdAt, @json)'),
    deleteTestById: sqlite.prepare('DELETE FROM tests WHERE id = ?'),
    deleteAllTests: sqlite.prepare('DELETE FROM tests'),
    getAllUsers: sqlite.prepare('SELECT json FROM users ORDER BY rowid'),
    getUserById: sqlite.prepare('SELECT json FROM users WHERE id = ?'),
    getUserByEmail: sqlite.prepare('SELECT json FROM users WHERE email = ?'),
    upsertUser: sqlite.prepare('INSERT OR REPLACE INTO users (id, email, role, status, json) VALUES (@id, @email, @role, @status, @json)'),
    deleteUserById: sqlite.prepare('DELETE FROM users WHERE id = ?'),
    deleteAllUsers: sqlite.prepare('DELETE FROM users'),
    getAllTemplates: sqlite.prepare('SELECT json FROM templates ORDER BY rowid'),
    upsertTemplate: sqlite.prepare('INSERT OR REPLACE INTO templates (id, name, testType, isActive, json) VALUES (@id, @name, @testType, @isActive, @json)'),
    deleteTemplateById: sqlite.prepare('DELETE FROM templates WHERE id = ?'),
    deleteAllTemplates: sqlite.prepare('DELETE FROM templates'),
    getAllCounters: sqlite.prepare('SELECT key, value FROM counters'),
    upsertCounter: sqlite.prepare('INSERT OR REPLACE INTO counters (key, value) VALUES (?, ?)'),
    deleteAllCounters: sqlite.prepare('DELETE FROM counters'),
    getSettings: sqlite.prepare("SELECT json FROM settings WHERE key = 'main'"),
    upsertSettings: sqlite.prepare("INSERT OR REPLACE INTO settings (key, json) VALUES ('main', ?)")
  };

  return {
    _engine: 'better-sqlite3',
    _sqlite: sqlite,

    getPatients() { return parseRows(stmts.getAllPatients.all()); },
    getPatientById(id) {
      if (!id) return null;
      try {
        const row = stmts.getPatientById.get(id);
        return row && row.json ? JSON.parse(row.json) : null;
      } catch (e) { return null; }
    },
    upsertPatient(p) {
      if (!p || !p.id) return;
      stmts.upsertPatient.run({
        id: p.id,
        patientId: safeStr(p.patientId),
        patientCode: safeStr(p.patientCode),
        firstName: safeStr(p.firstName),
        lastName: safeStr(p.lastName),
        createdAt: safeStr(p.createdAt),
        json: JSON.stringify(p)
      });
    },
    deletePatient(id) {
      if (!id) return;
      stmts.deletePatientById.run(id);
    },
    savePatients(patients) {
      const arr = Array.isArray(patients) ? patients : [];
      sqlite.transaction(() => {
        const incomingIds = new Set(arr.filter(p => p && p.id).map(p => p.id));
        const existing = sqlite.prepare('SELECT id FROM patients').all();
        for (const row of existing) {
          if (!incomingIds.has(row.id)) stmts.deletePatientById.run(row.id);
        }
        for (const p of arr) {
          if (!p || !p.id) continue;
          this.upsertPatient(p);
        }
      })();
    },

    getTests() { return parseRows(stmts.getAllTests.all()); },
    getTestById(id) {
      if (!id) return null;
      try {
        const row = stmts.getTestById.get(id);
        return row && row.json ? JSON.parse(row.json) : null;
      } catch (e) { return null; }
    },
    upsertTest(t) {
      if (!t || !t.id) return;
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
    },
    deleteTest(id) {
      if (!id) return;
      stmts.deleteTestById.run(id);
    },
    saveTests(tests) {
      const arr = Array.isArray(tests) ? tests : [];
      sqlite.transaction(() => {
        const incomingIds = new Set(arr.filter(t => t && t.id).map(t => t.id));
        const existing = sqlite.prepare('SELECT id FROM tests').all();
        for (const row of existing) {
          if (!incomingIds.has(row.id)) stmts.deleteTestById.run(row.id);
        }
        for (const t of arr) {
          if (!t || !t.id) continue;
          this.upsertTest(t);
        }
      })();
    },

    getUsers() { return parseRows(stmts.getAllUsers.all()); },
    getUserById(id) {
      if (!id) return null;
      try {
        const row = stmts.getUserById.get(id);
        return row && row.json ? JSON.parse(row.json) : null;
      } catch (e) { return null; }
    },
    getUserByEmail(email) {
      if (!email) return null;
      try {
        const row = stmts.getUserByEmail.get(email);
        return row && row.json ? JSON.parse(row.json) : null;
      } catch (e) { return null; }
    },
    upsertUser(u) {
      if (!u || !u.id) return;
      stmts.upsertUser.run({
        id: u.id,
        email: safeStr(u.email),
        role: safeStr(u.role),
        status: safeStr(u.status),
        json: JSON.stringify(u)
      });
    },
    deleteUser(id) {
      if (!id) return;
      stmts.deleteUserById.run(id);
    },
    saveUsers(users) {
      const arr = Array.isArray(users) ? users : [];
      sqlite.transaction(() => {
        const incomingIds = new Set(arr.filter(u => u && u.id).map(u => u.id));
        const existing = sqlite.prepare('SELECT id FROM users').all();
        for (const row of existing) {
          if (!incomingIds.has(row.id)) stmts.deleteUserById.run(row.id);
        }
        for (const u of arr) {
          if (!u || !u.id) continue;
          this.upsertUser(u);
        }
      })();
    },

    getTemplates() { return parseRows(stmts.getAllTemplates.all()); },
    upsertTemplate(t) {
      if (!t || !t.id) return;
      stmts.upsertTemplate.run({
        id: t.id,
        name: safeStr(t.name),
        testType: safeStr(t.testType),
        isActive: t.isActive !== false ? 1 : 0,
        json: JSON.stringify(t)
      });
    },
    deleteTemplate(id) {
      if (!id) return;
      stmts.deleteTemplateById.run(id);
    },
    saveTemplates(templates) {
      const arr = Array.isArray(templates) ? templates : [];
      sqlite.transaction(() => {
        const incomingIds = new Set(arr.filter(t => t && t.id).map(t => t.id));
        const existing = sqlite.prepare('SELECT id FROM templates').all();
        for (const row of existing) {
          if (!incomingIds.has(row.id)) stmts.deleteTemplateById.run(row.id);
        }
        for (const t of arr) {
          if (!t || !t.id) continue;
          this.upsertTemplate(t);
        }
      })();
    },

    getCounters() {
      const rows = stmts.getAllCounters.all();
      const obj = {};
      for (const r of rows) obj[r.key] = r.value;
      return obj;
    },
    saveCounters(counters) {
      const obj = counters && typeof counters === 'object' ? counters : {};
      sqlite.transaction(() => {
        stmts.deleteAllCounters.run();
        for (const [k, v] of Object.entries(obj)) {
          stmts.upsertCounter.run(k, typeof v === 'number' ? v : (parseInt(v, 10) || 0));
        }
      })();
    },

    checkpoint() {
      try { sqlite.pragma('wal_checkpoint(TRUNCATE)'); } catch (e) {}
    },

    read() {
      let settings = {};
      try {
        const row = stmts.getSettings.get();
        if (row && row.json) settings = JSON.parse(row.json);
      } catch (e) {}
      return {
        patients: this.getPatients(),
        tests: this.getTests(),
        templates: this.getTemplates(),
        counters: this.getCounters(),
        settings
      };
    },

    write(data) {
      if (!data || typeof data !== 'object') return;
      sqlite.transaction(() => {
        if (Array.isArray(data.patients)) this.savePatients(data.patients);
        if (Array.isArray(data.tests)) this.saveTests(data.tests);
        if (Array.isArray(data.templates)) this.saveTemplates(data.templates);
        if (data.counters && typeof data.counters === 'object') this.saveCounters(data.counters);
        if (data.settings && typeof data.settings === 'object') {
          stmts.upsertSettings.run(JSON.stringify(data.settings));
        }
      })();
    },

    close() { try { sqlite.close(); } catch (e) {} }
  };
}

/**
 * Create a sql.js (WebAssembly) backed adapter
 */
function createSqlJsDb(SQL, dbPath) {
  const dir = path.dirname(dbPath);
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}

  let sqlite;
  if (fs.existsSync(dbPath)) {
    try {
      const fileBuffer = fs.readFileSync(dbPath);
      sqlite = new SQL.Database(fileBuffer);
    } catch (e) {
      console.warn('[sqliteDb] Failed to load existing .db via sql.js, creating fresh database:', e.message);
      sqlite = new SQL.Database();
    }
  } else {
    sqlite = new SQL.Database();
  }

  sqlite.run(`
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

  function persist() {
    try {
      const data = sqlite.export();
      const tmp = dbPath + '.tmp';
      fs.writeFileSync(tmp, Buffer.from(data));
      fs.renameSync(tmp, dbPath);
    } catch (e) {
      try {
        const data = sqlite.export();
        fs.writeFileSync(dbPath, Buffer.from(data));
      } catch (err) {
        console.error('[sqliteDb] persist to disk error:', err.message);
      }
    }
  }

  function queryAll(sql, params = []) {
    try {
      const stmt = sqlite.prepare(sql);
      if (params && params.length) stmt.bind(params);
      const rows = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      stmt.free();
      return rows;
    } catch (e) {
      return [];
    }
  }

  // Save initial structure to disk
  if (!fs.existsSync(dbPath)) {
    persist();
  }

  return {
    _engine: 'sql.js',
    _sqlite: sqlite,

    getPatients() {
      return parseRows(queryAll('SELECT json FROM patients ORDER BY createdAt DESC'));
    },

    getPatientById(id) {
      if (!id) return null;
      const rows = queryAll('SELECT json FROM patients WHERE id = ?', [id]);
      if (rows.length && rows[0].json) {
        try { return JSON.parse(rows[0].json); } catch (e) {}
      }
      return null;
    },

    upsertPatient(p) {
      if (!p || !p.id) return;
      sqlite.run(
        'INSERT OR REPLACE INTO patients (id, patientId, patientCode, firstName, lastName, createdAt, json) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [p.id, safeStr(p.patientId), safeStr(p.patientCode), safeStr(p.firstName), safeStr(p.lastName), safeStr(p.createdAt), JSON.stringify(p)]
      );
      persist();
    },

    deletePatient(id) {
      if (!id) return;
      sqlite.run('DELETE FROM patients WHERE id = ?', [id]);
      persist();
    },

    savePatients(patients) {
      const arr = Array.isArray(patients) ? patients : [];
      sqlite.run('BEGIN TRANSACTION;');
      try {
        const incomingIds = new Set(arr.filter(p => p && p.id).map(p => p.id));
        const existing = queryAll('SELECT id FROM patients');
        for (const row of existing) {
          if (!incomingIds.has(row.id)) sqlite.run('DELETE FROM patients WHERE id = ?', [row.id]);
        }
        for (const p of arr) {
          if (!p || !p.id) continue;
          sqlite.run(
            'INSERT OR REPLACE INTO patients (id, patientId, patientCode, firstName, lastName, createdAt, json) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [p.id, safeStr(p.patientId), safeStr(p.patientCode), safeStr(p.firstName), safeStr(p.lastName), safeStr(p.createdAt), JSON.stringify(p)]
          );
        }
        sqlite.run('COMMIT;');
      } catch (e) {
        sqlite.run('ROLLBACK;');
        throw e;
      }
      persist();
    },

    getTests() {
      return parseRows(queryAll('SELECT json FROM tests ORDER BY createdAt DESC'));
    },

    getTestById(id) {
      if (!id) return null;
      const rows = queryAll('SELECT json FROM tests WHERE id = ?', [id]);
      if (rows.length && rows[0].json) {
        try { return JSON.parse(rows[0].json); } catch (e) {}
      }
      return null;
    },

    upsertTest(t) {
      if (!t || !t.id) return;
      sqlite.run(
        'INSERT OR REPLACE INTO tests (id, testId, patient, testType, status, updatedAt, createdAt, json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [t.id, safeStr(t.testId), safeStr(t.patient), safeStr(t.testType), safeStr(t.status), safeStr(t.updatedAt), safeStr(t.createdAt), JSON.stringify(t)]
      );
      persist();
    },

    deleteTest(id) {
      if (!id) return;
      sqlite.run('DELETE FROM tests WHERE id = ?', [id]);
      persist();
    },

    saveTests(tests) {
      const arr = Array.isArray(tests) ? tests : [];
      sqlite.run('BEGIN TRANSACTION;');
      try {
        const incomingIds = new Set(arr.filter(t => t && t.id).map(t => t.id));
        const existing = queryAll('SELECT id FROM tests');
        for (const row of existing) {
          if (!incomingIds.has(row.id)) sqlite.run('DELETE FROM tests WHERE id = ?', [row.id]);
        }
        for (const t of arr) {
          if (!t || !t.id) continue;
          sqlite.run(
            'INSERT OR REPLACE INTO tests (id, testId, patient, testType, status, updatedAt, createdAt, json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [t.id, safeStr(t.testId), safeStr(t.patient), safeStr(t.testType), safeStr(t.status), safeStr(t.updatedAt), safeStr(t.createdAt), JSON.stringify(t)]
          );
        }
        sqlite.run('COMMIT;');
      } catch (e) {
        sqlite.run('ROLLBACK;');
        throw e;
      }
      persist();
    },

    getUsers() {
      return parseRows(queryAll('SELECT json FROM users ORDER BY rowid'));
    },

    getUserById(id) {
      if (!id) return null;
      const rows = queryAll('SELECT json FROM users WHERE id = ?', [id]);
      if (rows.length && rows[0].json) {
        try { return JSON.parse(rows[0].json); } catch (e) {}
      }
      return null;
    },

    getUserByEmail(email) {
      if (!email) return null;
      const rows = queryAll('SELECT json FROM users WHERE email = ?', [email]);
      if (rows.length && rows[0].json) {
        try { return JSON.parse(rows[0].json); } catch (e) {}
      }
      return null;
    },

    upsertUser(u) {
      if (!u || !u.id) return;
      sqlite.run(
        'INSERT OR REPLACE INTO users (id, email, role, status, json) VALUES (?, ?, ?, ?, ?)',
        [u.id, safeStr(u.email), safeStr(u.role), safeStr(u.status), JSON.stringify(u)]
      );
      persist();
    },

    deleteUser(id) {
      if (!id) return;
      sqlite.run('DELETE FROM users WHERE id = ?', [id]);
      persist();
    },

    saveUsers(users) {
      const arr = Array.isArray(users) ? users : [];
      sqlite.run('BEGIN TRANSACTION;');
      try {
        const incomingIds = new Set(arr.filter(u => u && u.id).map(u => u.id));
        const existing = queryAll('SELECT id FROM users');
        for (const row of existing) {
          if (!incomingIds.has(row.id)) sqlite.run('DELETE FROM users WHERE id = ?', [row.id]);
        }
        for (const u of arr) {
          if (!u || !u.id) continue;
          sqlite.run(
            'INSERT OR REPLACE INTO users (id, email, role, status, json) VALUES (?, ?, ?, ?, ?)',
            [u.id, safeStr(u.email), safeStr(u.role), safeStr(u.status), JSON.stringify(u)]
          );
        }
        sqlite.run('COMMIT;');
      } catch (e) {
        sqlite.run('ROLLBACK;');
        throw e;
      }
      persist();
    },

    getTemplates() {
      return parseRows(queryAll('SELECT json FROM templates ORDER BY rowid'));
    },

    upsertTemplate(t) {
      if (!t || !t.id) return;
      sqlite.run(
        'INSERT OR REPLACE INTO templates (id, name, testType, isActive, json) VALUES (?, ?, ?, ?, ?)',
        [t.id, safeStr(t.name), safeStr(t.testType), t.isActive !== false ? 1 : 0, JSON.stringify(t)]
      );
      persist();
    },

    deleteTemplate(id) {
      if (!id) return;
      sqlite.run('DELETE FROM templates WHERE id = ?', [id]);
      persist();
    },

    saveTemplates(templates) {
      const arr = Array.isArray(templates) ? templates : [];
      sqlite.run('BEGIN TRANSACTION;');
      try {
        const incomingIds = new Set(arr.filter(t => t && t.id).map(t => t.id));
        const existing = queryAll('SELECT id FROM templates');
        for (const row of existing) {
          if (!incomingIds.has(row.id)) sqlite.run('DELETE FROM templates WHERE id = ?', [row.id]);
        }
        for (const t of arr) {
          if (!t || !t.id) continue;
          sqlite.run(
            'INSERT OR REPLACE INTO templates (id, name, testType, isActive, json) VALUES (?, ?, ?, ?, ?)',
            [t.id, safeStr(t.name), safeStr(t.testType), t.isActive !== false ? 1 : 0, JSON.stringify(t)]
          );
        }
        sqlite.run('COMMIT;');
      } catch (e) {
        sqlite.run('ROLLBACK;');
        throw e;
      }
      persist();
    },

    getCounters() {
      const rows = queryAll('SELECT key, value FROM counters');
      const obj = {};
      for (const r of rows) obj[r.key] = r.value;
      return obj;
    },

    saveCounters(counters) {
      const obj = counters && typeof counters === 'object' ? counters : {};
      sqlite.run('BEGIN TRANSACTION;');
      try {
        sqlite.run('DELETE FROM counters;');
        for (const [k, v] of Object.entries(obj)) {
          sqlite.run(
            'INSERT OR REPLACE INTO counters (key, value) VALUES (?, ?)',
            [k, typeof v === 'number' ? v : (parseInt(v, 10) || 0)]
          );
        }
        sqlite.run('COMMIT;');
      } catch (e) {
        sqlite.run('ROLLBACK;');
        throw e;
      }
      persist();
    },

    checkpoint() {
      persist();
    },

    read() {
      let settings = {};
      try {
        const rows = queryAll("SELECT json FROM settings WHERE key = 'main'");
        if (rows.length && rows[0].json) settings = JSON.parse(rows[0].json);
      } catch (e) {}
      return {
        patients: this.getPatients(),
        tests: this.getTests(),
        templates: this.getTemplates(),
        counters: this.getCounters(),
        settings
      };
    },

    write(data) {
      if (!data || typeof data !== 'object') return;
      if (Array.isArray(data.patients)) this.savePatients(data.patients);
      if (Array.isArray(data.tests)) this.saveTests(data.tests);
      if (Array.isArray(data.templates)) this.saveTemplates(data.templates);
      if (data.counters && typeof data.counters === 'object') this.saveCounters(data.counters);
      if (data.settings && typeof data.settings === 'object') {
        sqlite.run("INSERT OR REPLACE INTO settings (key, json) VALUES ('main', ?)", [JSON.stringify(data.settings)]);
        persist();
      }
    },

    close() {
      persist();
      try { sqlite.close(); } catch (e) {}
    }
  };
}

/**
 * Async initialization of database adapter (preferred for full compatibility)
 */
async function initDb(dbPath, opts = {}) {
  if (BetterSqlite3 && !process.pkg) {
    try {
      return createBetterSqliteDb(dbPath, opts);
    } catch (e) {
      console.warn('[sqliteDb] better-sqlite3 init failed, falling back to sql.js:', e.message);
    }
  }

  const SQL = await getSqlJs();
  return createSqlJsDb(SQL, dbPath);
}

/**
 * Synchronous factory matching the legacy interface.
 * If better-sqlite3 is available, uses it immediately.
 * Otherwise uses pre-initialized sql.js instance or creates an in-memory queue.
 */
function createDb(dbPath, opts = {}) {
  if (BetterSqlite3 && !process.pkg) {
    try {
      return createBetterSqliteDb(dbPath, opts);
    } catch (e) {
      console.warn('[sqliteDb] better-sqlite3 init failed:', e.message);
    }
  }

  if (SqlJs) {
    return createSqlJsDb(SqlJs, dbPath);
  }

  // If sql.js is still resolving its promise, return a proxy adapter
  // that delegates to the underlying db once ready
  let underlyingDb = null;
  const readyPromise = getSqlJs().then(SQL => {
    underlyingDb = createSqlJsDb(SQL, dbPath);
    return underlyingDb;
  });

  const proxy = {
    _engine: 'sql.js (async-proxy)',
    _readyPromise: readyPromise,

    getPatients() { return underlyingDb ? underlyingDb.getPatients() : []; },
    getPatientById(id) { return underlyingDb ? underlyingDb.getPatientById(id) : null; },
    upsertPatient(p) { if (underlyingDb) underlyingDb.upsertPatient(p); else readyPromise.then(d => d.upsertPatient(p)); },
    deletePatient(id) { if (underlyingDb) underlyingDb.deletePatient(id); else readyPromise.then(d => d.deletePatient(id)); },
    savePatients(p) { if (underlyingDb) underlyingDb.savePatients(p); else readyPromise.then(d => d.savePatients(p)); },
    getTests() { return underlyingDb ? underlyingDb.getTests() : []; },
    getTestById(id) { return underlyingDb ? underlyingDb.getTestById(id) : null; },
    upsertTest(t) { if (underlyingDb) underlyingDb.upsertTest(t); else readyPromise.then(d => d.upsertTest(t)); },
    deleteTest(id) { if (underlyingDb) underlyingDb.deleteTest(id); else readyPromise.then(d => d.deleteTest(id)); },
    saveTests(t) { if (underlyingDb) underlyingDb.saveTests(t); else readyPromise.then(d => d.saveTests(t)); },
    getUsers() { return underlyingDb ? underlyingDb.getUsers() : []; },
    getUserById(id) { return underlyingDb ? underlyingDb.getUserById(id) : null; },
    getUserByEmail(email) { return underlyingDb ? underlyingDb.getUserByEmail(email) : null; },
    upsertUser(u) { if (underlyingDb) underlyingDb.upsertUser(u); else readyPromise.then(d => d.upsertUser(u)); },
    deleteUser(id) { if (underlyingDb) underlyingDb.deleteUser(id); else readyPromise.then(d => d.deleteUser(id)); },
    saveUsers(u) { if (underlyingDb) underlyingDb.saveUsers(u); else readyPromise.then(d => d.saveUsers(u)); },
    getTemplates() { return underlyingDb ? underlyingDb.getTemplates() : []; },
    upsertTemplate(t) { if (underlyingDb) underlyingDb.upsertTemplate(t); else readyPromise.then(d => d.upsertTemplate(t)); },
    deleteTemplate(id) { if (underlyingDb) underlyingDb.deleteTemplate(id); else readyPromise.then(d => d.deleteTemplate(id)); },
    saveTemplates(t) { if (underlyingDb) underlyingDb.saveTemplates(t); else readyPromise.then(d => d.saveTemplates(t)); },
    getCounters() { return underlyingDb ? underlyingDb.getCounters() : {}; },
    saveCounters(c) { if (underlyingDb) underlyingDb.saveCounters(c); else readyPromise.then(d => d.saveCounters(c)); },
    checkpoint() { if (underlyingDb) underlyingDb.checkpoint(); else readyPromise.then(d => d.checkpoint()); },
    read() { return underlyingDb ? underlyingDb.read() : { patients: [], tests: [], templates: [], counters: {}, settings: {} }; },
    write(d) { if (underlyingDb) underlyingDb.write(d); else readyPromise.then(db => db.write(d)); },
    close() { if (underlyingDb) underlyingDb.close(); }
  };

  return proxy;
}

module.exports = {
  createDb,
  initDb,
  SCHEMA_VERSION
};
