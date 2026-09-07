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
  // Only attempt better-sqlite3 outside of pkg snapshot to avoid fatal N-API version mismatch (node18 pkg vs host node)
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

function createEntityCache(maxSize = 1000) {
  const cache = new Map();
  return {
    get(key) {
      if (!key) return null;
      const k = String(key);
      const item = cache.get(k);
      if (!item) return null;
      cache.delete(k);
      cache.set(k, item);
      return item;
    },
    set(key, val) {
      if (!key || val == null) return;
      const k = String(key);
      if (cache.has(k)) cache.delete(k);
      else if (cache.size >= maxSize) {
        const firstKey = cache.keys().next().value;
        if (firstKey !== undefined) cache.delete(firstKey);
      }
      cache.set(k, val);
    },
    delete(key) {
      if (!key) return;
      cache.delete(String(key));
    },
    clear() {
      cache.clear();
    }
  };
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

    CREATE TABLE IF NOT EXISTS chatbot_conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      title TEXT,
      last_model TEXT,
      created_at TEXT,
      updated_at TEXT,
      json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chat_conv_user ON chatbot_conversations(user_id);

    CREATE TABLE IF NOT EXISTS chatbot_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT,
      user_id TEXT,
      role TEXT,
      content TEXT,
      sources TEXT,
      created_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_chat_msg_conv ON chatbot_messages(conversation_id);

    CREATE TABLE IF NOT EXISTS inventory (
      id TEXT PRIMARY KEY,
      sku TEXT UNIQUE,
      name TEXT,
      category TEXT,
      area TEXT,
      createdAt TEXT,
      updatedAt TEXT,
      json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_inventory_sku ON inventory(sku);
    CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory(category);
    CREATE INDEX IF NOT EXISTS idx_inventory_area ON inventory(area);

    CREATE TABLE IF NOT EXISTS inventory_batches (
      id TEXT PRIMARY KEY,
      inventoryId TEXT,
      lotNumber TEXT,
      expirationDate TEXT,
      createdAt TEXT,
      updatedAt TEXT,
      json TEXT NOT NULL,
      FOREIGN KEY(inventoryId) REFERENCES inventory(id)
    );
    CREATE INDEX IF NOT EXISTS idx_inv_batch_inventory ON inventory_batches(inventoryId);
    CREATE INDEX IF NOT EXISTS idx_inv_batch_lot ON inventory_batches(lotNumber);
    CREATE INDEX IF NOT EXISTS idx_inv_batch_expiration ON inventory_batches(expirationDate);

    CREATE TABLE IF NOT EXISTS inventory_transactions (
      id TEXT PRIMARY KEY,
      inventoryId TEXT,
      batchId TEXT,
      transactionType TEXT,
      performedBy TEXT,
      createdAt TEXT,
      json TEXT NOT NULL,
      FOREIGN KEY(inventoryId) REFERENCES inventory(id),
      FOREIGN KEY(batchId) REFERENCES inventory_batches(id)
    );
    CREATE INDEX IF NOT EXISTS idx_inv_trans_inventory ON inventory_transactions(inventoryId);
    CREATE INDEX IF NOT EXISTS idx_inv_trans_batch ON inventory_transactions(batchId);
    CREATE INDEX IF NOT EXISTS idx_inv_trans_type ON inventory_transactions(transactionType);
    CREATE INDEX IF NOT EXISTS idx_inv_trans_date ON inventory_transactions(createdAt);
  `);

  const stmts = {
    getAllPatients: sqlite.prepare('SELECT json FROM patients ORDER BY createdAt DESC'),
    getPatientById: sqlite.prepare('SELECT json FROM patients WHERE id = ?'),
    getPatientByCode: sqlite.prepare('SELECT json FROM patients WHERE patientCode = ?'),
    getPatientByPatientId: sqlite.prepare('SELECT json FROM patients WHERE patientId = ?'),
    upsertPatient: sqlite.prepare('INSERT OR REPLACE INTO patients (id, patientId, patientCode, firstName, lastName, createdAt, json) VALUES (@id, @patientId, @patientCode, @firstName, @lastName, @createdAt, @json)'),
    deletePatientById: sqlite.prepare('DELETE FROM patients WHERE id = ?'),
    deleteAllPatients: sqlite.prepare('DELETE FROM patients'),
    countPatients: sqlite.prepare('SELECT COUNT(*) as cnt FROM patients'),

    getAllTests: sqlite.prepare('SELECT json FROM tests ORDER BY createdAt DESC'),
    getTestById: sqlite.prepare('SELECT json FROM tests WHERE id = ?'),
    getTestByTestId: sqlite.prepare('SELECT json FROM tests WHERE testId = ?'),
    getTestsByPatient: sqlite.prepare('SELECT json FROM tests WHERE patient = ? ORDER BY createdAt DESC'),
    getTestsByStatus: sqlite.prepare('SELECT json FROM tests WHERE status = ? ORDER BY createdAt DESC'),
    upsertTest: sqlite.prepare('INSERT OR REPLACE INTO tests (id, testId, patient, testType, status, updatedAt, createdAt, json) VALUES (@id, @testId, @patient, @testType, @status, @updatedAt, @createdAt, @json)'),
    deleteTestById: sqlite.prepare('DELETE FROM tests WHERE id = ?'),
    deleteAllTests: sqlite.prepare('DELETE FROM tests'),
    countTests: sqlite.prepare('SELECT COUNT(*) as cnt FROM tests'),

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
    upsertSettings: sqlite.prepare("INSERT OR REPLACE INTO settings (key, json) VALUES ('main', ?)"),

    getChatConversationsByUser: sqlite.prepare('SELECT json FROM chatbot_conversations WHERE user_id = ? ORDER BY updated_at DESC'),
    getAllChatConversations: sqlite.prepare('SELECT json FROM chatbot_conversations ORDER BY updated_at DESC'),
    getChatConversationById: sqlite.prepare('SELECT json FROM chatbot_conversations WHERE id = ?'),
    upsertChatConversation: sqlite.prepare('INSERT OR REPLACE INTO chatbot_conversations (id, user_id, title, last_model, created_at, updated_at, json) VALUES (@id, @user_id, @title, @last_model, @created_at, @updated_at, @json)'),
    deleteChatConversationById: sqlite.prepare('DELETE FROM chatbot_conversations WHERE id = ?'),
    deleteChatMessagesByConvId: sqlite.prepare('DELETE FROM chatbot_messages WHERE conversation_id = ?'),
    getChatMessagesByConvId: sqlite.prepare('SELECT id, conversation_id, user_id, role, content, sources, created_at FROM chatbot_messages WHERE conversation_id = ? ORDER BY created_at ASC'),
    insertChatMessage: sqlite.prepare('INSERT INTO chatbot_messages (id, conversation_id, user_id, role, content, sources, created_at) VALUES (@id, @conversation_id, @user_id, @role, @content, @sources, @created_at)'),

    getAllInventory: sqlite.prepare("SELECT json FROM inventory WHERE json_extract(json, '$.isActive') IS NULL OR json_extract(json, '$.isActive') != 0 ORDER BY createdAt DESC"),
    getInventoryById: sqlite.prepare('SELECT json FROM inventory WHERE id = ?'),
    getInventoryBySku: sqlite.prepare('SELECT json FROM inventory WHERE sku = ?'),
    getInventoryByCategory: sqlite.prepare("SELECT json FROM inventory WHERE category = ? AND (json_extract(json, '$.isActive') IS NULL OR json_extract(json, '$.isActive') != 0) ORDER BY name"),
    getInventoryByArea: sqlite.prepare("SELECT json FROM inventory WHERE area = ? AND (json_extract(json, '$.isActive') IS NULL OR json_extract(json, '$.isActive') != 0) ORDER BY name"),
    upsertInventory: sqlite.prepare('INSERT OR REPLACE INTO inventory (id, sku, name, category, area, createdAt, updatedAt, json) VALUES (@id, @sku, @name, @category, @area, @createdAt, @updatedAt, @json)'),
    deleteInventoryById: sqlite.prepare('DELETE FROM inventory WHERE id = ?'),
    
    getAllInventoryBatches: sqlite.prepare('SELECT json FROM inventory_batches ORDER BY createdAt DESC'),
    getInventoryBatchesByItemId: sqlite.prepare('SELECT json FROM inventory_batches WHERE inventoryId = ? ORDER BY createdAt DESC'),
    getInventoryBatchById: sqlite.prepare('SELECT json FROM inventory_batches WHERE id = ?'),
    getInventoryBatchByLot: sqlite.prepare('SELECT json FROM inventory_batches WHERE lotNumber = ?'),
    upsertInventoryBatch: sqlite.prepare('INSERT OR REPLACE INTO inventory_batches (id, inventoryId, lotNumber, expirationDate, createdAt, updatedAt, json) VALUES (@id, @inventoryId, @lotNumber, @expirationDate, @createdAt, @updatedAt, @json)'),
    deleteInventoryBatchById: sqlite.prepare('DELETE FROM inventory_batches WHERE id = ?'),
    deleteInventoryBatchesByItemId: sqlite.prepare('DELETE FROM inventory_batches WHERE inventoryId = ?'),
    
    getAllInventoryTransactions: sqlite.prepare('SELECT json FROM inventory_transactions ORDER BY createdAt DESC'),
    getInventoryTransactionsByItemId: sqlite.prepare('SELECT json FROM inventory_transactions WHERE inventoryId = ? ORDER BY createdAt DESC'),
    getInventoryTransactionsByBatchId: sqlite.prepare('SELECT json FROM inventory_transactions WHERE batchId = ? ORDER BY createdAt DESC'),
    insertInventoryTransaction: sqlite.prepare('INSERT INTO inventory_transactions (id, inventoryId, batchId, transactionType, performedBy, createdAt, json) VALUES (@id, @inventoryId, @batchId, @transactionType, @performedBy, @createdAt, @json)'),
    deleteInventoryTransactionsByItemId: sqlite.prepare('DELETE FROM inventory_transactions WHERE inventoryId = ?')
  };

  const patientCache = createEntityCache(1000);
  const testCache = createEntityCache(1000);
  const userCache = createEntityCache(200);

  let cachedPatientsList = null;
  let cachedTestsList = null;
  let cachedUsersList = null;
  let cachedTemplatesList = null;
  let cachedCounters = null;
  let cachedSettings = null;

  return {
    _engine: 'better-sqlite3',
    _sqlite: sqlite,

    getPatients() {
      if (cachedPatientsList) return cachedPatientsList;
      cachedPatientsList = parseRows(stmts.getAllPatients.all());
      return cachedPatientsList;
    },
    getPatientById(id) {
      if (!id) return null;
      const cached = patientCache.get(id);
      if (cached) return cached;
      try {
        const row = stmts.getPatientById.get(id);
        const parsed = row && row.json ? JSON.parse(row.json) : null;
        if (parsed) {
          patientCache.set(id, parsed);
          if (parsed.patientCode) patientCache.set(parsed.patientCode, parsed);
          if (parsed.patientId) patientCache.set(parsed.patientId, parsed);
        }
        return parsed;
      } catch (e) { return null; }
    },
    getPatientByCode(code) {
      if (!code) return null;
      const cached = patientCache.get(code);
      if (cached) return cached;
      try {
        const row = stmts.getPatientByCode.get(code);
        const parsed = row && row.json ? JSON.parse(row.json) : null;
        if (parsed) {
          patientCache.set(code, parsed);
          if (parsed.id) patientCache.set(parsed.id, parsed);
        }
        return parsed;
      } catch (e) { return null; }
    },
    getPatientByPatientId(patientId) {
      if (!patientId) return null;
      const cached = patientCache.get(patientId);
      if (cached) return cached;
      try {
        const row = stmts.getPatientByPatientId.get(patientId);
        const parsed = row && row.json ? JSON.parse(row.json) : null;
        if (parsed) {
          patientCache.set(patientId, parsed);
          if (parsed.id) patientCache.set(parsed.id, parsed);
        }
        return parsed;
      } catch (e) { return null; }
    },
    queryPatients(filter = {}, opts = {}) {
      const clauses = [];
      const params = {};
      if (filter.id) { clauses.push('id = @id'); params.id = filter.id; }
      if (filter.patientId) { clauses.push('patientId = @patientId'); params.patientId = filter.patientId; }
      if (filter.patientCode) { clauses.push('patientCode = @patientCode'); params.patientCode = filter.patientCode; }
      if (filter.search) {
        clauses.push('(firstName LIKE @search OR lastName LIKE @search OR patientId LIKE @search OR patientCode LIKE @search)');
        params.search = `%${filter.search}%`;
      }
      
      let sql = 'SELECT json FROM patients';
      if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
      sql += ' ORDER BY createdAt DESC';
      if (opts.limit) {
        sql += ` LIMIT ${Number(opts.limit)}`;
        if (opts.offset) sql += ` OFFSET ${Number(opts.offset)}`;
      }
      try {
        const rows = sqlite.prepare(sql).all(params);
        return parseRows(rows);
      } catch (e) {
        return this.getPatients();
      }
    },
    countPatients() {
      try {
        const row = stmts.countPatients.get();
        return row ? row.cnt : 0;
      } catch (e) { return 0; }
    },
    upsertPatient(p) {
      if (!p || !p.id) return;
      cachedPatientsList = null;
      if (p.id) patientCache.delete(p.id);
      if (p.patientCode) patientCache.delete(p.patientCode);
      if (p.patientId) patientCache.delete(p.patientId);
      stmts.upsertPatient.run({
        id: p.id,
        patientId: safeStr(p.patientId),
        patientCode: safeStr(p.patientCode),
        firstName: safeStr(p.firstName),
        lastName: safeStr(p.lastName),
        createdAt: safeStr(p.createdAt),
        json: JSON.stringify(p)
      });
      patientCache.set(p.id, p);
      if (p.patientCode) patientCache.set(p.patientCode, p);
      if (p.patientId) patientCache.set(p.patientId, p);
    },
    deletePatient(id) {
      if (!id) return;
      cachedPatientsList = null;
      patientCache.delete(id);
      stmts.deletePatientById.run(id);
    },
    savePatients(patients) {
      const arr = Array.isArray(patients) ? patients : [];
      cachedPatientsList = null;
      patientCache.clear();
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

    getTests() {
      if (cachedTestsList) return cachedTestsList;
      cachedTestsList = parseRows(stmts.getAllTests.all());
      return cachedTestsList;
    },
    getTestById(id) {
      if (!id) return null;
      const cached = testCache.get(id);
      if (cached) return cached;
      try {
        const row = stmts.getTestById.get(id);
        const parsed = row && row.json ? JSON.parse(row.json) : null;
        if (parsed) {
          testCache.set(id, parsed);
          if (parsed.testId) testCache.set(parsed.testId, parsed);
        }
        return parsed;
      } catch (e) { return null; }
    },
    getTestByTestId(testId) {
      if (!testId) return null;
      const cached = testCache.get(testId);
      if (cached) return cached;
      try {
        const row = stmts.getTestByTestId.get(testId);
        const parsed = row && row.json ? JSON.parse(row.json) : null;
        if (parsed) {
          testCache.set(testId, parsed);
          if (parsed.id) testCache.set(parsed.id, parsed);
        }
        return parsed;
      } catch (e) { return null; }
    },
    queryTests(filter = {}, opts = {}) {
      const clauses = [];
      const params = {};
      if (filter.id) { clauses.push('id = @id'); params.id = filter.id; }
      if (filter.testId) { clauses.push('testId = @testId'); params.testId = filter.testId; }
      if (filter.patient) { clauses.push('patient = @patient'); params.patient = filter.patient; }
      if (filter.status) { clauses.push('status = @status'); params.status = filter.status; }
      if (filter.testType) { clauses.push('testType = @testType'); params.testType = filter.testType; }
      
      let sql = 'SELECT json FROM tests';
      if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
      sql += ' ORDER BY createdAt DESC';
      if (opts.limit) {
        sql += ` LIMIT ${Number(opts.limit)}`;
        if (opts.offset) sql += ` OFFSET ${Number(opts.offset)}`;
      }
      try {
        const rows = sqlite.prepare(sql).all(params);
        return parseRows(rows);
      } catch (e) {
        return this.getTests();
      }
    },
    countTests(filter = {}) {
      const clauses = [];
      const params = {};
      if (filter.patient) { clauses.push('patient = @patient'); params.patient = filter.patient; }
      if (filter.status) { clauses.push('status = @status'); params.status = filter.status; }
      let sql = 'SELECT COUNT(*) as cnt FROM tests';
      if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
      try {
        const row = sqlite.prepare(sql).get(params);
        return row ? row.cnt : 0;
      } catch (e) { return 0; }
    },
    upsertTest(t) {
      if (!t || !t.id) return;
      cachedTestsList = null;
      if (t.id) testCache.delete(t.id);
      if (t.testId) testCache.delete(t.testId);
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
      testCache.set(t.id, t);
      if (t.testId) testCache.set(t.testId, t);
    },
    deleteTest(id) {
      if (!id) return;
      cachedTestsList = null;
      testCache.delete(id);
      stmts.deleteTestById.run(id);
    },
    saveTests(tests) {
      const arr = Array.isArray(tests) ? tests : [];
      cachedTestsList = null;
      testCache.clear();
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

    getUsers() {
      if (cachedUsersList) return cachedUsersList;
      cachedUsersList = parseRows(stmts.getAllUsers.all());
      return cachedUsersList;
    },
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
      cachedUsersList = null;
      const pwd = u.password || (typeof u.toRawObject === 'function' ? u.toRawObject().password : null) || (this.getUserById(u.id) || {}).password;
      const userObj = (typeof u.toRawObject === 'function')
        ? u.toRawObject()
        : (typeof u.toJSON === 'function' ? { ...u.toJSON(), password: pwd } : { ...u, password: pwd });
      if (!userObj.password && pwd) userObj.password = pwd;
      stmts.upsertUser.run({
        id: userObj.id,
        email: safeStr(userObj.email),
        role: safeStr(userObj.role),
        status: safeStr(userObj.status),
        json: JSON.stringify(userObj)
      });
    },
    deleteUser(id) {
      if (!id) return;
      cachedUsersList = null;
      stmts.deleteUserById.run(id);
    },
    saveUsers(users) {
      const arr = Array.isArray(users) ? users : [];
      cachedUsersList = null;
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

    getTemplates() {
      if (cachedTemplatesList) return cachedTemplatesList;
      cachedTemplatesList = parseRows(stmts.getAllTemplates.all());
      return cachedTemplatesList;
    },
    upsertTemplate(t) {
      if (!t || !t.id) return;
      cachedTemplatesList = null;
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
      cachedTemplatesList = null;
      stmts.deleteTemplateById.run(id);
    },
    saveTemplates(templates) {
      const arr = Array.isArray(templates) ? templates : [];
      cachedTemplatesList = null;
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
      if (cachedCounters) return cachedCounters;
      const rows = stmts.getAllCounters.all();
      const obj = {};
      for (const r of rows) obj[r.key] = r.value;
      cachedCounters = obj;
      return obj;
    },
    saveCounters(counters) {
      const obj = counters && typeof counters === 'object' ? counters : {};
      cachedCounters = null;
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

    getSettings() {
      if (cachedSettings) return cachedSettings;
      try {
        const row = stmts.getSettings.get();
        cachedSettings = (row && row.json) ? JSON.parse(row.json) : {};
      } catch (e) {
        cachedSettings = {};
      }
      return cachedSettings;
    },
    setSettings(settings) {
      cachedSettings = null;
      if (!settings || typeof settings !== 'object') return;
      stmts.upsertSettings.run(JSON.stringify(settings));
    },

    getMeta(key) {
      if (!key) return undefined;
      const s = this.getSettings() || {};
      return (s.__meta && s.__meta[key] !== undefined) ? s.__meta[key] : undefined;
    },
    setMeta(key, value) {
      if (!key) return;
      const s = this.getSettings() || {};
      s.__meta = s.__meta || {};
      s.__meta[key] = value;
      this.setSettings(s);
    },
    getAllMeta() {
      const s = this.getSettings() || {};
      return s.__meta || {};
    },

    write(data) {
      if (!data || typeof data !== 'object') return;
      cachedPatientsList = null;
      cachedTestsList = null;
      cachedUsersList = null;
      cachedTemplatesList = null;
      cachedCounters = null;
      cachedSettings = null;
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

    getChatbotConversations(userId) {
      try {
        const rows = userId ? stmts.getChatConversationsByUser.all(String(userId)) : stmts.getAllChatConversations.all();
        return parseRows(rows);
      } catch (e) {
        return [];
      }
    },
    getChatbotConversation(id, userId) {
      if (!id) return null;
      try {
        const row = stmts.getChatConversationById.get(String(id));
        if (!row || !row.json) return null;
        const conv = JSON.parse(row.json);
        if (userId && conv.user_id && String(conv.user_id) !== String(userId)) return null;
        return conv;
      } catch (e) { return null; }
    },
    saveChatbotConversation(conv) {
      if (!conv || !conv.id) return null;
      try {
        const data = {
          id: String(conv.id),
          user_id: safeStr(conv.user_id || 'default'),
          title: safeStr(conv.title || 'New Conversation'),
          last_model: safeStr(conv.last_model || 'openai/gpt-4o-mini'),
          created_at: safeStr(conv.created_at || new Date().toISOString()),
          updated_at: safeStr(conv.updated_at || new Date().toISOString()),
          json: JSON.stringify(conv)
        };
        stmts.upsertChatConversation.run(data);
        return conv;
      } catch (e) {
        console.error('[sqliteDb] saveChatbotConversation error:', e.message);
        return conv;
      }
    },
    deleteChatbotConversation(id, userId) {
      if (!id) return false;
      try {
        const conv = this.getChatbotConversation(id, userId);
        if (!conv) return false;
        sqlite.transaction(() => {
          stmts.deleteChatConversationById.run(String(id));
          stmts.deleteChatMessagesByConvId.run(String(id));
        })();
        return true;
      } catch (e) {
        return false;
      }
    },
    getChatbotMessages(conversationId) {
      if (!conversationId) return [];
      try {
        const rows = stmts.getChatMessagesByConvId.all(String(conversationId));
        return (rows || []).map(r => ({
          id: r.id,
          conversation_id: r.conversation_id,
          user_id: r.user_id,
          role: r.role,
          content: r.content,
          sources: r.sources ? (typeof r.sources === 'string' ? JSON.parse(r.sources) : r.sources) : [],
          created_at: r.created_at
        }));
      } catch (e) { return []; }
    },
    addChatbotMessage(msg) {
      if (!msg || !msg.conversation_id) return null;
      try {
        const id = msg.id || ('msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7));
        const data = {
          id,
          conversation_id: String(msg.conversation_id),
          user_id: safeStr(msg.user_id || 'default'),
          role: safeStr(msg.role || 'user'),
          content: safeStr(msg.content || ''),
          sources: msg.sources ? JSON.stringify(msg.sources) : '[]',
          created_at: safeStr(msg.created_at || new Date().toISOString())
        };
        stmts.insertChatMessage.run(data);
        try {
          const conv = this.getChatbotConversation(msg.conversation_id);
          if (conv) {
            conv.updated_at = data.created_at;
            this.saveChatbotConversation(conv);
          }
        } catch (_) {}
        return { ...data, sources: msg.sources || [] };
      } catch (e) {
        console.error('[sqliteDb] addChatbotMessage error:', e.message);
        return null;
      }
    },

    // Inventory Management Methods
    getInventory() {
      try {
        const rows = stmts.getAllInventory.all();
        return parseRows(rows);
      } catch (e) {
        return [];
      }
    },
    getInventoryById(id) {
      if (!id) return null;
      try {
        const row = stmts.getInventoryById.get(id);
        return row && row.json ? JSON.parse(row.json) : null;
      } catch (e) {
        return null;
      }
    },
    getInventoryBySku(sku) {
      if (!sku) return null;
      try {
        const row = stmts.getInventoryBySku.get(sku);
        return row && row.json ? JSON.parse(row.json) : null;
      } catch (e) {
        return null;
      }
    },
    getInventoryByCategory(category) {
      if (!category) return [];
      try {
        const rows = stmts.getInventoryByCategory.all(category);
        return parseRows(rows);
      } catch (e) {
        return [];
      }
    },
    getInventoryByArea(area) {
      if (!area) return [];
      try {
        const rows = stmts.getInventoryByArea.all(area);
        return parseRows(rows);
      } catch (e) {
        return [];
      }
    },
    saveInventory(item) {
      if (!item || !item.id) return null;
      try {
        const data = {
          id: String(item.id),
          sku: safeStr(item.sku || ''),
          name: safeStr(item.name || ''),
          category: safeStr(item.category || ''),
          area: safeStr(item.area || ''),
          createdAt: safeStr(item.createdAt || new Date().toISOString()),
          updatedAt: safeStr(item.updatedAt || new Date().toISOString()),
          json: JSON.stringify(item)
        };
        stmts.upsertInventory.run(data);
        return item;
      } catch (e) {
        console.error('[sqliteDb] saveInventory error:', e.message);
        return null;
      }
    },
    deleteInventory(id) {
      try {
        stmts.deleteInventoryTransactionsByItemId.run(id);
        stmts.deleteInventoryBatchesByItemId.run(id);
        stmts.deleteInventoryById.run(id);
        return true;
      } catch (e) {
        console.error('[sqliteDb] deleteInventory error:', e && e.message);
        try {
          sqlite.prepare('DELETE FROM inventory_transactions WHERE inventoryId = ?').run(id);
          sqlite.prepare('DELETE FROM inventory_batches WHERE inventoryId = ?').run(id);
          sqlite.prepare('DELETE FROM inventory WHERE id = ?').run(id);
          return true;
        } catch (e2) {
          console.error('[sqliteDb] deleteInventory fallback error:', e2 && e2.message);
          return false;
        }
      }
    },

    getAllInventoryBatches() {
      try {
        const rows = stmts.getAllInventoryBatches.all();
        return parseRows(rows);
      } catch (e) {
        return [];
      }
    },
    getInventoryBatchesByItemId(inventoryId) {
      if (!inventoryId) return [];
      try {
        const rows = stmts.getInventoryBatchesByItemId.all(inventoryId);
        return parseRows(rows);
      } catch (e) {
        return [];
      }
    },
    getInventoryBatchById(id) {
      if (!id) return null;
      try {
        const row = stmts.getInventoryBatchById.get(id);
        return row && row.json ? JSON.parse(row.json) : null;
      } catch (e) {
        return null;
      }
    },
    saveBatch(batch) {
      if (!batch || !batch.id) return null;
      try {
        const data = {
          id: String(batch.id),
          inventoryId: String(batch.inventoryId || ''),
          lotNumber: safeStr(batch.lotNumber || ''),
          expirationDate: batch.expirationDate ? safeStr(new Date(batch.expirationDate).toISOString()) : null,
          createdAt: safeStr(batch.createdAt || new Date().toISOString()),
          updatedAt: safeStr(batch.updatedAt || new Date().toISOString()),
          json: JSON.stringify(batch)
        };
        stmts.upsertInventoryBatch.run(data);
        return batch;
      } catch (e) {
        console.error('[sqliteDb] saveBatch error:', e.message);
        return null;
      }
    },
    deleteBatch(id) {
      try {
        stmts.deleteInventoryBatchById.run(id);
        return true;
      } catch (e) {
        return false;
      }
    },

    getAllInventoryTransactions() {
      try {
        const rows = stmts.getAllInventoryTransactions.all();
        return parseRows(rows);
      } catch (e) {
        return [];
      }
    },
    getInventoryTransactions(inventoryId, batchId) {
      try {
        let rows;
        if (batchId) {
          rows = stmts.getInventoryTransactionsByBatchId.all(batchId);
        } else if (inventoryId) {
          rows = stmts.getInventoryTransactionsByItemId.all(inventoryId);
        } else {
          rows = stmts.getAllInventoryTransactions.all();
        }
        return parseRows(rows);
      } catch (e) {
        return [];
      }
    },
    saveTransaction(transaction) {
      if (!transaction || !transaction.id) return null;
      try {
        const data = {
          id: String(transaction.id),
          inventoryId: String(transaction.inventoryId || ''),
          batchId: transaction.batchId ? String(transaction.batchId) : null,
          transactionType: safeStr(transaction.transactionType || ''),
          performedBy: safeStr(transaction.performedBy || ''),
          createdAt: safeStr(transaction.createdAt || new Date().toISOString()),
          json: JSON.stringify(transaction)
        };
        stmts.insertInventoryTransaction.run(data);
        return transaction;
      } catch (e) {
        console.error('[sqliteDb] saveTransaction error:', e.message);
        return null;
      }
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

    CREATE TABLE IF NOT EXISTS chatbot_conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      title TEXT,
      last_model TEXT,
      created_at TEXT,
      updated_at TEXT,
      json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chat_conv_user ON chatbot_conversations(user_id);

    CREATE TABLE IF NOT EXISTS chatbot_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT,
      user_id TEXT,
      role TEXT,
      content TEXT,
      sources TEXT,
      created_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_chat_msg_conv ON chatbot_messages(conversation_id);

    CREATE TABLE IF NOT EXISTS inventory (
      id TEXT PRIMARY KEY,
      sku TEXT UNIQUE,
      name TEXT,
      category TEXT,
      area TEXT,
      createdAt TEXT,
      updatedAt TEXT,
      json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_inventory_sku ON inventory(sku);
    CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory(category);
    CREATE INDEX IF NOT EXISTS idx_inventory_area ON inventory(area);

    CREATE TABLE IF NOT EXISTS inventory_batches (
      id TEXT PRIMARY KEY,
      inventoryId TEXT,
      lotNumber TEXT,
      expirationDate TEXT,
      createdAt TEXT,
      updatedAt TEXT,
      json TEXT NOT NULL,
      FOREIGN KEY(inventoryId) REFERENCES inventory(id)
    );
    CREATE INDEX IF NOT EXISTS idx_inv_batch_inventory ON inventory_batches(inventoryId);
    CREATE INDEX IF NOT EXISTS idx_inv_batch_lot ON inventory_batches(lotNumber);
    CREATE INDEX IF NOT EXISTS idx_inv_batch_expiration ON inventory_batches(expirationDate);

    CREATE TABLE IF NOT EXISTS inventory_transactions (
      id TEXT PRIMARY KEY,
      inventoryId TEXT,
      batchId TEXT,
      transactionType TEXT,
      performedBy TEXT,
      createdAt TEXT,
      json TEXT NOT NULL,
      FOREIGN KEY(inventoryId) REFERENCES inventory(id),
      FOREIGN KEY(batchId) REFERENCES inventory_batches(id)
    );
    CREATE INDEX IF NOT EXISTS idx_inv_trans_inventory ON inventory_transactions(inventoryId);
    CREATE INDEX IF NOT EXISTS idx_inv_trans_batch ON inventory_transactions(batchId);
    CREATE INDEX IF NOT EXISTS idx_inv_trans_type ON inventory_transactions(transactionType);
    CREATE INDEX IF NOT EXISTS idx_inv_trans_date ON inventory_transactions(createdAt);
  `);

  let persistTimer = null;

  function flushToDisk() {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    if (!dbPath || dbPath === ':memory:') return;
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

  function persist(immediate = false) {
    if (immediate) {
      flushToDisk();
      return;
    }
    if (!persistTimer) {
      persistTimer = setTimeout(() => {
        persistTimer = null;
        flushToDisk();
      }, 75); // 75ms debounce batches consecutive writes, eliminating I/O freezes
    }
  }

  try {
    process.on('beforeExit', () => { flushToDisk(); });
    process.on('exit', () => { flushToDisk(); });
  } catch (_) {}

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

  function queryRun(sql, params = []) {
    try {
      if (params && params.length) {
        sqlite.run(sql, params);
      } else {
        sqlite.run(sql);
      }
      return true;
    } catch (e) {
      console.error('[sqliteDb sql.js] queryRun error:', e && e.message);
      return false;
    }
  }

  // Save initial structure to disk
  if (!fs.existsSync(dbPath)) {
    persist();
  }

  const patientCache = createEntityCache(1000);
  const testCache = createEntityCache(1000);
  const userCache = createEntityCache(200);

  let cachedPatientsList = null;
  let cachedTestsList = null;
  let cachedUsersList = null;
  let cachedTemplatesList = null;
  let cachedCounters = null;
  let cachedSettings = null;

  return {
    _engine: 'sql.js',
    _sqlite: sqlite,

    getPatients() {
      if (cachedPatientsList) return cachedPatientsList;
      cachedPatientsList = parseRows(queryAll('SELECT json FROM patients ORDER BY createdAt DESC'));
      return cachedPatientsList;
    },

    getPatientById(id) {
      if (!id) return null;
      const cached = patientCache.get(id);
      if (cached) return cached;
      const rows = queryAll('SELECT json FROM patients WHERE id = ?', [id]);
      if (rows.length && rows[0].json) {
        try {
          const parsed = JSON.parse(rows[0].json);
          patientCache.set(id, parsed);
          if (parsed.patientCode) patientCache.set(parsed.patientCode, parsed);
          if (parsed.patientId) patientCache.set(parsed.patientId, parsed);
          return parsed;
        } catch (e) {}
      }
      return null;
    },

    getPatientByCode(code) {
      if (!code) return null;
      const cached = patientCache.get(code);
      if (cached) return cached;
      const rows = queryAll('SELECT json FROM patients WHERE patientCode = ?', [code]);
      if (rows.length && rows[0].json) {
        try {
          const parsed = JSON.parse(rows[0].json);
          patientCache.set(code, parsed);
          if (parsed.id) patientCache.set(parsed.id, parsed);
          return parsed;
        } catch (e) {}
      }
      return null;
    },

    getPatientByPatientId(patientId) {
      if (!patientId) return null;
      const cached = patientCache.get(patientId);
      if (cached) return cached;
      const rows = queryAll('SELECT json FROM patients WHERE patientId = ?', [patientId]);
      if (rows.length && rows[0].json) {
        try {
          const parsed = JSON.parse(rows[0].json);
          patientCache.set(patientId, parsed);
          if (parsed.id) patientCache.set(parsed.id, parsed);
          return parsed;
        } catch (e) {}
      }
      return null;
    },

    queryPatients(filter = {}, opts = {}) {
      const clauses = [];
      const params = [];
      if (filter.id) { clauses.push('id = ?'); params.push(filter.id); }
      if (filter.patientId) { clauses.push('patientId = ?'); params.push(filter.patientId); }
      if (filter.patientCode) { clauses.push('patientCode = ?'); params.push(filter.patientCode); }
      if (filter.search) {
        clauses.push('(firstName LIKE ? OR lastName LIKE ? OR patientId LIKE ? OR patientCode LIKE ?)');
        const s = `%${filter.search}%`;
        params.push(s, s, s, s);
      }
      let sql = 'SELECT json FROM patients';
      if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
      sql += ' ORDER BY createdAt DESC';
      if (opts.limit) {
        sql += ` LIMIT ${Number(opts.limit)}`;
        if (opts.offset) sql += ` OFFSET ${Number(opts.offset)}`;
      }
      try {
        return parseRows(queryAll(sql, params));
      } catch (e) {
        return this.getPatients();
      }
    },

    countPatients() {
      try {
        const rows = queryAll('SELECT COUNT(*) as cnt FROM patients');
        return rows.length ? rows[0].cnt : 0;
      } catch (e) { return 0; }
    },

    upsertPatient(p) {
      if (!p || !p.id) return;
      cachedPatientsList = null;
      if (p.id) patientCache.delete(p.id);
      if (p.patientCode) patientCache.delete(p.patientCode);
      if (p.patientId) patientCache.delete(p.patientId);
      sqlite.run(
        'INSERT OR REPLACE INTO patients (id, patientId, patientCode, firstName, lastName, createdAt, json) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [p.id, safeStr(p.patientId), safeStr(p.patientCode), safeStr(p.firstName), safeStr(p.lastName), safeStr(p.createdAt), JSON.stringify(p)]
      );
      patientCache.set(p.id, p);
      if (p.patientCode) patientCache.set(p.patientCode, p);
      if (p.patientId) patientCache.set(p.patientId, p);
      persist();
    },

    deletePatient(id) {
      if (!id) return;
      cachedPatientsList = null;
      patientCache.delete(id);
      sqlite.run('DELETE FROM patients WHERE id = ?', [id]);
      persist();
    },

    savePatients(patients) {
      const arr = Array.isArray(patients) ? patients : [];
      cachedPatientsList = null;
      patientCache.clear();
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
      if (cachedTestsList) return cachedTestsList;
      cachedTestsList = parseRows(queryAll('SELECT json FROM tests ORDER BY createdAt DESC'));
      return cachedTestsList;
    },

    getTestById(id) {
      if (!id) return null;
      const cached = testCache.get(id);
      if (cached) return cached;
      const rows = queryAll('SELECT json FROM tests WHERE id = ?', [id]);
      if (rows.length && rows[0].json) {
        try {
          const parsed = JSON.parse(rows[0].json);
          testCache.set(id, parsed);
          if (parsed.testId) testCache.set(parsed.testId, parsed);
          return parsed;
        } catch (e) {}
      }
      return null;
    },

    getTestByTestId(testId) {
      if (!testId) return null;
      const cached = testCache.get(testId);
      if (cached) return cached;
      const rows = queryAll('SELECT json FROM tests WHERE testId = ?', [testId]);
      if (rows.length && rows[0].json) {
        try {
          const parsed = JSON.parse(rows[0].json);
          testCache.set(testId, parsed);
          if (parsed.id) testCache.set(parsed.id, parsed);
          return parsed;
        } catch (e) {}
      }
      return null;
    },

    queryTests(filter = {}, opts = {}) {
      const clauses = [];
      const params = [];
      if (filter.id) { clauses.push('id = ?'); params.push(filter.id); }
      if (filter.testId) { clauses.push('testId = ?'); params.push(filter.testId); }
      if (filter.patient) { clauses.push('patient = ?'); params.push(filter.patient); }
      if (filter.status) { clauses.push('status = ?'); params.push(filter.status); }
      if (filter.testType) { clauses.push('testType = ?'); params.push(filter.testType); }
      let sql = 'SELECT json FROM tests';
      if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
      sql += ' ORDER BY createdAt DESC';
      if (opts.limit) {
        sql += ` LIMIT ${Number(opts.limit)}`;
        if (opts.offset) sql += ` OFFSET ${Number(opts.offset)}`;
      }
      try {
        return parseRows(queryAll(sql, params));
      } catch (e) {
        return this.getTests();
      }
    },

    countTests(filter = {}) {
      const clauses = [];
      const params = [];
      if (filter.patient) { clauses.push('patient = ?'); params.push(filter.patient); }
      if (filter.status) { clauses.push('status = ?'); params.push(filter.status); }
      let sql = 'SELECT COUNT(*) as cnt FROM tests';
      if (clauses.length) sql += ' WHERE ' + clauses.join(' AND ');
      try {
        const rows = queryAll(sql, params);
        return rows.length ? rows[0].cnt : 0;
      } catch (e) { return 0; }
    },

    upsertTest(t) {
      if (!t || !t.id) return;
      cachedTestsList = null;
      if (t.id) testCache.delete(t.id);
      if (t.testId) testCache.delete(t.testId);
      sqlite.run(
        'INSERT OR REPLACE INTO tests (id, testId, patient, testType, status, updatedAt, createdAt, json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [t.id, safeStr(t.testId), safeStr(t.patient), safeStr(t.testType), safeStr(t.status), safeStr(t.updatedAt), safeStr(t.createdAt), JSON.stringify(t)]
      );
      testCache.set(t.id, t);
      if (t.testId) testCache.set(t.testId, t);
      persist();
    },

    deleteTest(id) {
      if (!id) return;
      cachedTestsList = null;
      testCache.delete(id);
      sqlite.run('DELETE FROM tests WHERE id = ?', [id]);
      persist();
    },

    saveTests(tests) {
      const arr = Array.isArray(tests) ? tests : [];
      cachedTestsList = null;
      testCache.clear();
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
      if (cachedUsersList) return cachedUsersList;
      cachedUsersList = parseRows(queryAll('SELECT json FROM users ORDER BY rowid'));
      return cachedUsersList;
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
      cachedUsersList = null;
      sqlite.run(
        'INSERT OR REPLACE INTO users (id, email, role, status, json) VALUES (?, ?, ?, ?, ?)',
        [u.id, safeStr(u.email), safeStr(u.role), safeStr(u.status), JSON.stringify(u)]
      );
      persist();
    },

    deleteUser(id) {
      if (!id) return;
      cachedUsersList = null;
      sqlite.run('DELETE FROM users WHERE id = ?', [id]);
      persist();
    },

    saveUsers(users) {
      const arr = Array.isArray(users) ? users : [];
      cachedUsersList = null;
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
      if (cachedTemplatesList) return cachedTemplatesList;
      cachedTemplatesList = parseRows(queryAll('SELECT json FROM templates ORDER BY rowid'));
      return cachedTemplatesList;
    },

    upsertTemplate(t) {
      if (!t || !t.id) return;
      cachedTemplatesList = null;
      sqlite.run(
        'INSERT OR REPLACE INTO templates (id, name, testType, isActive, json) VALUES (?, ?, ?, ?, ?)',
        [t.id, safeStr(t.name), safeStr(t.testType), t.isActive !== false ? 1 : 0, JSON.stringify(t)]
      );
      persist();
    },

    deleteTemplate(id) {
      if (!id) return;
      cachedTemplatesList = null;
      sqlite.run('DELETE FROM templates WHERE id = ?', [id]);
      persist();
    },

    saveTemplates(templates) {
      const arr = Array.isArray(templates) ? templates : [];
      cachedTemplatesList = null;
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
      if (cachedCounters) return cachedCounters;
      const rows = queryAll('SELECT key, value FROM counters');
      const obj = {};
      for (const r of rows) obj[r.key] = r.value;
      cachedCounters = obj;
      return obj;
    },

    saveCounters(counters) {
      const obj = counters && typeof counters === 'object' ? counters : {};
      cachedCounters = null;
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
      return {
        patients: this.getPatients(),
        tests: this.getTests(),
        templates: this.getTemplates(),
        counters: this.getCounters(),
        settings: this.getSettings()
      };
    },

    getSettings() {
      try {
        const rows = queryAll("SELECT json FROM settings WHERE key = 'main'");
        if (rows.length && rows[0].json) return JSON.parse(rows[0].json);
      } catch (e) {}
      return {};
    },

    setSettings(settings) {
      if (!settings || typeof settings !== 'object') return;
      sqlite.run("INSERT OR REPLACE INTO settings (key, json) VALUES ('main', ?)", [JSON.stringify(settings)]);
      persist();
    },

    getMeta(key) {
      if (!key) return undefined;
      const s = this.getSettings() || {};
      return (s.__meta && s.__meta[key] !== undefined) ? s.__meta[key] : undefined;
    },
    setMeta(key, value) {
      if (!key) return;
      const s = this.getSettings() || {};
      s.__meta = s.__meta || {};
      s.__meta[key] = value;
      this.setSettings(s);
    },
    getAllMeta() {
      const s = this.getSettings() || {};
      return s.__meta || {};
    },

    write(data) {
      if (!data || typeof data !== 'object') return;
      if (Array.isArray(data.patients)) this.savePatients(data.patients);
      if (Array.isArray(data.tests)) this.saveTests(data.tests);
      if (Array.isArray(data.templates)) this.saveTemplates(data.templates);
      if (data.counters && typeof data.counters === 'object') this.saveCounters(data.counters);
      if (data.settings && typeof data.settings === 'object') {
        this.setSettings(data.settings);
      }
    },

    getChatbotConversations(userId) {
      try {
        const sql = userId
          ? 'SELECT json FROM chatbot_conversations WHERE user_id = ? ORDER BY updated_at DESC'
          : 'SELECT json FROM chatbot_conversations ORDER BY updated_at DESC';
        const rows = queryAll(sql, userId ? [String(userId)] : []);
        return parseRows(rows);
      } catch (e) { return []; }
    },
    getChatbotConversation(id, userId) {
      if (!id) return null;
      try {
        const rows = queryAll('SELECT json FROM chatbot_conversations WHERE id = ?', [String(id)]);
        if (!rows.length || !rows[0].json) return null;
        const conv = JSON.parse(rows[0].json);
        if (userId && conv.user_id && String(conv.user_id) !== String(userId)) return null;
        return conv;
      } catch (e) { return null; }
    },
    saveChatbotConversation(conv) {
      if (!conv || !conv.id) return null;
      try {
        sqlite.run(
          'INSERT OR REPLACE INTO chatbot_conversations (id, user_id, title, last_model, created_at, updated_at, json) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [
            String(conv.id),
            safeStr(conv.user_id || 'default'),
            safeStr(conv.title || 'New Conversation'),
            safeStr(conv.last_model || 'openai/gpt-4o-mini'),
            safeStr(conv.created_at || new Date().toISOString()),
            safeStr(conv.updated_at || new Date().toISOString()),
            JSON.stringify(conv)
          ]
        );
        persist();
        return conv;
      } catch (e) {
        console.error('[sqliteDb sql.js] saveChatbotConversation error:', e.message);
        return conv;
      }
    },
    deleteChatbotConversation(id, userId) {
      if (!id) return false;
      try {
        const conv = this.getChatbotConversation(id, userId);
        if (!conv) return false;
        sqlite.run('BEGIN TRANSACTION;');
        try {
          sqlite.run('DELETE FROM chatbot_conversations WHERE id = ?', [String(id)]);
          sqlite.run('DELETE FROM chatbot_messages WHERE conversation_id = ?', [String(id)]);
          sqlite.run('COMMIT;');
        } catch (e) {
          sqlite.run('ROLLBACK;');
          throw e;
        }
        persist();
        return true;
      } catch (e) {
        return false;
      }
    },
    getChatbotMessages(conversationId) {
      if (!conversationId) return [];
      try {
        const rows = queryAll('SELECT * FROM chatbot_messages WHERE conversation_id = ? ORDER BY created_at ASC', [String(conversationId)]);
        return (rows || []).map(r => ({
          id: r.id,
          conversation_id: r.conversation_id,
          user_id: r.user_id,
          role: r.role,
          content: r.content,
          sources: r.sources ? (typeof r.sources === 'string' ? JSON.parse(r.sources) : r.sources) : [],
          created_at: r.created_at
        }));
      } catch (e) { return []; }
    },
    addChatbotMessage(msg) {
      if (!msg || !msg.conversation_id) return null;
      try {
        const id = msg.id || ('msg_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7));
        const createdAt = safeStr(msg.created_at || new Date().toISOString());
        const sources = msg.sources ? (typeof msg.sources === 'string' ? msg.sources : JSON.stringify(msg.sources)) : '[]';
        
        sqlite.run(
          'INSERT INTO chatbot_messages (id, conversation_id, user_id, role, content, sources, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [
            id,
            String(msg.conversation_id),
            safeStr(msg.user_id || 'default'),
            safeStr(msg.role || 'user'),
            safeStr(msg.content || ''),
            sources,
            createdAt
          ]
        );
        try {
          const conv = this.getChatbotConversation(msg.conversation_id);
          if (conv) {
            conv.updated_at = createdAt;
            this.saveChatbotConversation(conv);
          }
        } catch (_) {}
        persist();
        return {
          id,
          conversation_id: String(msg.conversation_id),
          user_id: msg.user_id || 'default',
          role: msg.role || 'user',
          content: msg.content || '',
          sources: msg.sources || [],
          created_at: createdAt
        };
      } catch (e) {
        console.error('[sqliteDb sql.js] addChatbotMessage error:', e.message);
        return null;
      }
    },

    checkpoint() {
      persist(true);
    },

    getSettings() {
      if (cachedSettings) return cachedSettings;
      try {
        const rows = queryAll("SELECT json FROM settings WHERE key = 'main'");
        if (rows.length && rows[0].json) {
          cachedSettings = JSON.parse(rows[0].json);
          return cachedSettings;
        }
      } catch (e) {}
      cachedSettings = {};
      return cachedSettings;
    },

    setSettings(settings) {
      cachedSettings = null;
      if (!settings || typeof settings !== 'object') return;
      sqlite.run("INSERT OR REPLACE INTO settings (key, json) VALUES ('main', ?)", [JSON.stringify(settings)]);
      persist();
    },

    read() {
      return {
        patients: this.getPatients(),
        tests: this.getTests(),
        templates: this.getTemplates(),
        counters: this.getCounters(),
        settings: this.getSettings()
      };
    },

    write(data) {
      if (!data || typeof data !== 'object') return;
      cachedPatientsList = null;
      cachedTestsList = null;
      cachedUsersList = null;
      cachedTemplatesList = null;
      cachedCounters = null;
      cachedSettings = null;
      if (Array.isArray(data.patients)) this.savePatients(data.patients);
      if (Array.isArray(data.tests)) this.saveTests(data.tests);
      if (Array.isArray(data.templates)) this.saveTemplates(data.templates);
      if (data.counters && typeof data.counters === 'object') this.saveCounters(data.counters);
      if (data.settings && typeof data.settings === 'object') {
        this.setSettings(data.settings);
      }
      persist();
    },

    // Inventory Management Methods
    getInventory() {
      try {
        return parseRows(queryAll("SELECT json FROM inventory WHERE json_extract(json, '$.isActive') IS NULL OR json_extract(json, '$.isActive') != 0 ORDER BY createdAt DESC"));
      } catch (e) {
        return [];
      }
    },
    getInventoryById(id) {
      if (!id) return null;
      try {
        const rows = queryAll('SELECT json FROM inventory WHERE id = ?', [id]);
        return rows.length ? JSON.parse(rows[0].json) : null;
      } catch (e) {
        return null;
      }
    },
    getInventoryBySku(sku) {
      if (!sku) return null;
      try {
        const rows = queryAll('SELECT json FROM inventory WHERE sku = ?', [sku]);
        return rows.length ? JSON.parse(rows[0].json) : null;
      } catch (e) {
        return null;
      }
    },
    getInventoryByCategory(category) {
      if (!category) return [];
      try {
        return parseRows(queryAll("SELECT json FROM inventory WHERE category = ? AND (json_extract(json, '$.isActive') IS NULL OR json_extract(json, '$.isActive') != 0) ORDER BY name", [category]));
      } catch (e) {
        return [];
      }
    },
    getInventoryByArea(area) {
      if (!area) return [];
      try {
        return parseRows(queryAll("SELECT json FROM inventory WHERE area = ? AND (json_extract(json, '$.isActive') IS NULL OR json_extract(json, '$.isActive') != 0) ORDER BY name", [area]));
      } catch (e) {
        return [];
      }
    },
    saveInventory(item) {
      if (!item || !item.id) return null;
      try {
        const createdAt = item.createdAt ? (typeof item.createdAt === 'string' ? item.createdAt : new Date(item.createdAt).toISOString()) : new Date().toISOString();
        const updatedAt = item.updatedAt ? (typeof item.updatedAt === 'string' ? item.updatedAt : new Date(item.updatedAt).toISOString()) : new Date().toISOString();
        const data = {
          id: String(item.id),
          sku: item.sku || '',
          name: item.name || '',
          category: item.category || '',
          area: item.area || '',
          createdAt,
          updatedAt,
          json: JSON.stringify(item)
        };
        queryRun(
          'INSERT OR REPLACE INTO inventory (id, sku, name, category, area, createdAt, updatedAt, json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [data.id, data.sku, data.name, data.category, data.area, data.createdAt, data.updatedAt, data.json]
        );
        persist();
        return item;
      } catch (e) {
        console.error('[sqliteDb sql.js] saveInventory error:', e.message);
        return null;
      }
    },
    deleteInventory(id) {
      try {
        queryRun('DELETE FROM inventory_transactions WHERE inventoryId = ?', [id]);
        queryRun('DELETE FROM inventory_batches WHERE inventoryId = ?', [id]);
        queryRun('DELETE FROM inventory WHERE id = ?', [id]);
        persist();
        return true;
      } catch (e) {
        console.error('[sqliteDb sql.js] deleteInventory error:', e && e.message);
        return false;
      }
    },

    getAllInventoryBatches() {
      try {
        return parseRows(queryAll('SELECT json FROM inventory_batches ORDER BY createdAt DESC'));
      } catch (e) {
        return [];
      }
    },

    getInventoryBatchesByItemId(inventoryId) {
      if (!inventoryId) return [];
      try {
        return parseRows(queryAll('SELECT json FROM inventory_batches WHERE inventoryId = ? ORDER BY createdAt DESC', [inventoryId]));
      } catch (e) {
        return [];
      }
    },
    getInventoryBatchById(id) {
      if (!id) return null;
      try {
        const rows = queryAll('SELECT json FROM inventory_batches WHERE id = ?', [id]);
        return rows.length ? JSON.parse(rows[0].json) : null;
      } catch (e) {
        return null;
      }
    },
    saveBatch(batch) {
      if (!batch || !batch.id) return null;
      try {
        const createdAt = batch.createdAt ? (typeof batch.createdAt === 'string' ? batch.createdAt : new Date(batch.createdAt).toISOString()) : new Date().toISOString();
        const updatedAt = batch.updatedAt ? (typeof batch.updatedAt === 'string' ? batch.updatedAt : new Date(batch.updatedAt).toISOString()) : new Date().toISOString();
        const expirationDate = batch.expirationDate ? (typeof batch.expirationDate === 'string' ? batch.expirationDate : new Date(batch.expirationDate).toISOString()) : null;
        const data = {
          id: String(batch.id),
          inventoryId: String(batch.inventoryId || ''),
          lotNumber: batch.lotNumber || '',
          expirationDate,
          createdAt,
          updatedAt,
          json: JSON.stringify(batch)
        };
        queryRun(
          'INSERT OR REPLACE INTO inventory_batches (id, inventoryId, lotNumber, expirationDate, createdAt, updatedAt, json) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [data.id, data.inventoryId, data.lotNumber, data.expirationDate, data.createdAt, data.updatedAt, data.json]
        );
        persist();
        return batch;
      } catch (e) {
        console.error('[sqliteDb sql.js] saveBatch error:', e.message);
        return null;
      }
    },
    deleteBatch(id) {
      try {
        queryRun('DELETE FROM inventory_batches WHERE id = ?', [id]);
        persist();
        return true;
      } catch (e) {
        return false;
      }
    },

    getInventoryTransactions(inventoryId, batchId) {
      try {
        if (batchId) {
          return parseRows(queryAll('SELECT json FROM inventory_transactions WHERE batchId = ? ORDER BY createdAt DESC', [batchId]));
        }
        return parseRows(queryAll('SELECT json FROM inventory_transactions WHERE inventoryId = ? ORDER BY createdAt DESC', [inventoryId]));
      } catch (e) {
        return [];
      }
    },
    saveTransaction(transaction) {
      if (!transaction || !transaction.id) return null;
      try {
        const createdAt = transaction.createdAt ? (typeof transaction.createdAt === 'string' ? transaction.createdAt : new Date(transaction.createdAt).toISOString()) : new Date().toISOString();
        const data = {
          id: String(transaction.id),
          inventoryId: String(transaction.inventoryId || ''),
          batchId: transaction.batchId ? String(transaction.batchId) : null,
          transactionType: transaction.transactionType || '',
          performedBy: transaction.performedBy || '',
          createdAt,
          json: JSON.stringify(transaction)
        };
        queryRun(
          'INSERT OR REPLACE INTO inventory_transactions (id, inventoryId, batchId, transactionType, performedBy, createdAt, json) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [data.id, data.inventoryId, data.batchId, data.transactionType, data.performedBy, data.createdAt, data.json]
        );
        persist();
        return transaction;
      } catch (e) {
        console.error('[sqliteDb sql.js] saveTransaction error:', e.message);
        return null;
      }
    },

    close() {
      persist(true);
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
  let readyPromise = null;
  const proxy = {
    _engine: 'sql.js (async-proxy)',
    _isReady: false,
    _readyPromise: null,

    getPatients() { return underlyingDb ? underlyingDb.getPatients() : []; },
    getPatientById(id) { return underlyingDb ? underlyingDb.getPatientById(id) : null; },
    getPatientByCode(code) { return underlyingDb && underlyingDb.getPatientByCode ? underlyingDb.getPatientByCode(code) : null; },
    getPatientByPatientId(pid) { return underlyingDb && underlyingDb.getPatientByPatientId ? underlyingDb.getPatientByPatientId(pid) : null; },
    queryPatients(filter, opts) { return underlyingDb && underlyingDb.queryPatients ? underlyingDb.queryPatients(filter, opts) : (underlyingDb ? underlyingDb.getPatients() : []); },
    countPatients() { return underlyingDb && underlyingDb.countPatients ? underlyingDb.countPatients() : (underlyingDb ? underlyingDb.getPatients().length : 0); },
    upsertPatient(p) { if (underlyingDb) underlyingDb.upsertPatient(p); else readyPromise.then(d => d.upsertPatient(p)); },
    deletePatient(id) { if (underlyingDb) underlyingDb.deletePatient(id); else readyPromise.then(d => d.deletePatient(id)); },
    savePatients(p) { if (underlyingDb) underlyingDb.savePatients(p); else readyPromise.then(d => d.savePatients(p)); },
    getTests() { return underlyingDb ? underlyingDb.getTests() : []; },
    getTestById(id) { return underlyingDb ? underlyingDb.getTestById(id) : null; },
    getTestByTestId(testId) { return underlyingDb && underlyingDb.getTestByTestId ? underlyingDb.getTestByTestId(testId) : null; },
    queryTests(filter, opts) { return underlyingDb && underlyingDb.queryTests ? underlyingDb.queryTests(filter, opts) : (underlyingDb ? underlyingDb.getTests() : []); },
    countTests(filter) { return underlyingDb && underlyingDb.countTests ? underlyingDb.countTests(filter) : (underlyingDb ? underlyingDb.getTests().length : 0); },
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
    getSettings() { return underlyingDb ? underlyingDb.getSettings() : {}; },
    setSettings(s) { if (underlyingDb) underlyingDb.setSettings(s); else readyPromise.then(d => d.setSettings(s)); },
    getMeta(k) { return underlyingDb && underlyingDb.getMeta ? underlyingDb.getMeta(k) : undefined; },
    setMeta(k, v) { if (underlyingDb && underlyingDb.setMeta) underlyingDb.setMeta(k, v); else readyPromise.then(d => d.setMeta && d.setMeta(k, v)); },
    getAllMeta() { return underlyingDb && underlyingDb.getAllMeta ? underlyingDb.getAllMeta() : {}; },
    getChatbotConversations(userId) { return underlyingDb ? underlyingDb.getChatbotConversations(userId) : []; },
    getChatbotConversation(id, userId) { return underlyingDb ? underlyingDb.getChatbotConversation(id, userId) : null; },
    saveChatbotConversation(conv) { return underlyingDb ? underlyingDb.saveChatbotConversation(conv) : conv; },
    deleteChatbotConversation(id, userId) { return underlyingDb ? underlyingDb.deleteChatbotConversation(id, userId) : false; },
    getChatbotMessages(convId) { return underlyingDb ? underlyingDb.getChatbotMessages(convId) : []; },
    addChatbotMessage(msg) { return underlyingDb ? underlyingDb.addChatbotMessage(msg) : null; },

    getInventory() { return underlyingDb ? underlyingDb.getInventory() : []; },
    getInventoryById(id) { return underlyingDb ? underlyingDb.getInventoryById(id) : null; },
    getInventoryBySku(sku) { return underlyingDb ? underlyingDb.getInventoryBySku(sku) : null; },
    getInventoryByCategory(c) { return underlyingDb ? underlyingDb.getInventoryByCategory(c) : []; },
    getInventoryByArea(a) { return underlyingDb ? underlyingDb.getInventoryByArea(a) : []; },
    saveInventory(item) { if (underlyingDb) return underlyingDb.saveInventory(item); else readyPromise.then(d => d.saveInventory(item)); return item; },
    deleteInventory(id) { if (underlyingDb) return underlyingDb.deleteInventory(id); else readyPromise.then(d => d.deleteInventory(id)); return true; },
    getAllInventoryBatches() { return underlyingDb ? underlyingDb.getAllInventoryBatches() : []; },
    getInventoryBatchesByItemId(id) { return underlyingDb ? underlyingDb.getInventoryBatchesByItemId(id) : []; },
    getInventoryBatchById(id) { return underlyingDb ? underlyingDb.getInventoryBatchById(id) : null; },
    saveBatch(b) { if (underlyingDb) return underlyingDb.saveBatch(b); else readyPromise.then(d => d.saveBatch(b)); return b; },
    deleteBatch(id) { if (underlyingDb) return underlyingDb.deleteBatch(id); else readyPromise.then(d => d.deleteBatch(id)); return true; },
    getInventoryTransactions(itemId, batchId) { return underlyingDb ? underlyingDb.getInventoryTransactions(itemId, batchId) : []; },
    saveTransaction(tx) { if (underlyingDb) return underlyingDb.saveTransaction(tx); else readyPromise.then(d => d.saveTransaction(tx)); return tx; },

    close() { if (underlyingDb) underlyingDb.close(); }
  };

  readyPromise = getSqlJs().then(SQL => {
    underlyingDb = createSqlJsDb(SQL, dbPath);
    proxy._isReady = true;
    return underlyingDb;
  });
  proxy._readyPromise = readyPromise;

  return new Proxy(proxy, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (underlyingDb && typeof underlyingDb[prop] === 'function') {
        return underlyingDb[prop].bind(underlyingDb);
      }
      if (underlyingDb && prop in underlyingDb) {
        return underlyingDb[prop];
      }
      return undefined;
    }
  });
}

module.exports = {
  createDb,
  initDb,
  SCHEMA_VERSION
};
