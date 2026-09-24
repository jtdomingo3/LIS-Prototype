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
        path.join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist', file),
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

    CREATE TABLE IF NOT EXISTS equipment (
      id TEXT PRIMARY KEY,
      equipmentCode TEXT UNIQUE,
      name TEXT,
      category TEXT,
      department TEXT,
      serialNumber TEXT,
      status TEXT,
      nextCalibrationDate TEXT,
      nextPmDate TEXT,
      createdAt TEXT,
      updatedAt TEXT,
      json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_eq_code ON equipment(equipmentCode);
    CREATE INDEX IF NOT EXISTS idx_eq_category ON equipment(category);
    CREATE INDEX IF NOT EXISTS idx_eq_dept ON equipment(department);
    CREATE INDEX IF NOT EXISTS idx_eq_status ON equipment(status);
    CREATE INDEX IF NOT EXISTS idx_eq_next_cal ON equipment(nextCalibrationDate);

    CREATE TABLE IF NOT EXISTS equipment_logs (
      id TEXT PRIMARY KEY,
      equipmentId TEXT,
      logType TEXT,
      serviceDate TEXT,
      resultStatus TEXT,
      certificateNumber TEXT,
      createdAt TEXT,
      json TEXT NOT NULL,
      FOREIGN KEY(equipmentId) REFERENCES equipment(id)
    );
    CREATE INDEX IF NOT EXISTS idx_eq_logs_eqid ON equipment_logs(equipmentId);
    CREATE INDEX IF NOT EXISTS idx_eq_logs_type ON equipment_logs(logType);
    CREATE INDEX IF NOT EXISTS idx_eq_logs_date ON equipment_logs(serviceDate);

    CREATE TABLE IF NOT EXISTS qc_controls (
      id TEXT PRIMARY KEY,
      equipmentId TEXT,
      controlName TEXT,
      lotNumber TEXT,
      level TEXT,
      expirationDate TEXT,
      isActive INTEGER DEFAULT 1,
      createdAt TEXT,
      json TEXT NOT NULL,
      FOREIGN KEY(equipmentId) REFERENCES equipment(id)
    );
    CREATE INDEX IF NOT EXISTS idx_qc_ctrl_eqid ON qc_controls(equipmentId);
    CREATE INDEX IF NOT EXISTS idx_qc_ctrl_lot ON qc_controls(lotNumber);

    CREATE TABLE IF NOT EXISTS qc_entries (
      id TEXT PRIMARY KEY,
      equipmentId TEXT,
      controlId TEXT,
      analyteCode TEXT,
      controlLot TEXT,
      runDate TEXT,
      measuredValue REAL,
      zScore REAL,
      status TEXT,
      createdAt TEXT,
      json TEXT NOT NULL,
      FOREIGN KEY(equipmentId) REFERENCES equipment(id),
      FOREIGN KEY(controlId) REFERENCES qc_controls(id)
    );
    CREATE INDEX IF NOT EXISTS idx_qc_entry_eqid ON qc_entries(equipmentId);
    CREATE INDEX IF NOT EXISTS idx_qc_entry_ctrl ON qc_entries(controlId);
    CREATE INDEX IF NOT EXISTS idx_qc_entry_analyte ON qc_entries(analyteCode);
    CREATE INDEX IF NOT EXISTS idx_qc_entry_date ON qc_entries(runDate);

    CREATE TABLE IF NOT EXISTS neqas_records (
      id TEXT PRIMARY KEY,
      equipmentId TEXT,
      cycleYear TEXT,
      eventNumber TEXT,
      nrlName TEXT,
      sampleId TEXT,
      analyteCode TEXT,
      status TEXT,
      createdAt TEXT,
      json TEXT NOT NULL,
      FOREIGN KEY(equipmentId) REFERENCES equipment(id)
    );
    CREATE INDEX IF NOT EXISTS idx_neqas_eqid ON neqas_records(equipmentId);
    CREATE INDEX IF NOT EXISTS idx_neqas_year ON neqas_records(cycleYear);
    CREATE INDEX IF NOT EXISTS idx_neqas_status ON neqas_records(status);

    CREATE TABLE IF NOT EXISTS consultations (
      id TEXT PRIMARY KEY,
      patientId TEXT NOT NULL,
      testId TEXT,
      doctorId TEXT,
      doctorName TEXT,
      doctorLicenseNumber TEXT,
      visitType TEXT DEFAULT 'New',
      consultationDate TEXT,
      status TEXT DEFAULT 'In Progress',
      chiefComplaint TEXT,
      primaryDiagnosis TEXT,
      createdAt TEXT,
      updatedAt TEXT,
      completedAt TEXT,
      json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_consult_patient ON consultations(patientId);
    CREATE INDEX IF NOT EXISTS idx_consult_test ON consultations(testId);
    CREATE INDEX IF NOT EXISTS idx_consult_doctor ON consultations(doctorName);
    CREATE INDEX IF NOT EXISTS idx_consult_date ON consultations(consultationDate);
    CREATE INDEX IF NOT EXISTS idx_consult_status ON consultations(status);

    -- Financial Costing & HR Tables
    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      subcategory TEXT,
      description TEXT,
      amount REAL NOT NULL DEFAULT 0,
      currency TEXT DEFAULT 'PHP',
      vendorSupplier TEXT,
      referenceId TEXT,
      referenceType TEXT,
      expenseDate TEXT NOT NULL,
      month TEXT,
      receiptUrl TEXT,
      notes TEXT,
      recordedBy TEXT,
      createdAt TEXT,
      updatedAt TEXT,
      json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
    CREATE INDEX IF NOT EXISTS idx_expenses_month ON expenses(month);
    CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expenseDate);
    CREATE INDEX IF NOT EXISTS idx_expenses_ref ON expenses(referenceId);

    CREATE TABLE IF NOT EXISTS revenue_entries (
      id TEXT PRIMARY KEY,
      patientId TEXT,
      testId TEXT,
      paymentMethod TEXT,
      clinicalAmount REAL DEFAULT 0,
      xrayAmount REAL DEFAULT 0,
      totalAmount REAL DEFAULT 0,
      discountAmount REAL DEFAULT 0,
      discountType TEXT,
      revenueDate TEXT NOT NULL,
      month TEXT,
      notes TEXT,
      recordedBy TEXT,
      createdAt TEXT,
      json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_revenue_month ON revenue_entries(month);
    CREATE INDEX IF NOT EXISTS idx_revenue_date ON revenue_entries(revenueDate);
    CREATE INDEX IF NOT EXISTS idx_revenue_patient ON revenue_entries(patientId);
    CREATE INDEX IF NOT EXISTS idx_revenue_method ON revenue_entries(paymentMethod);

    CREATE TABLE IF NOT EXISTS cost_per_test (
      id TEXT PRIMARY KEY,
      testType TEXT NOT NULL,
      inventoryItems TEXT,
      estimatedCost REAL DEFAULT 0,
      notes TEXT,
      updatedBy TEXT,
      createdAt TEXT,
      updatedAt TEXT,
      json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_cpt_testtype ON cost_per_test(testType);

    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL UNIQUE,
      employeeCode TEXT UNIQUE,
      department TEXT,
      position TEXT,
      employmentType TEXT DEFAULT 'Regular',
      dateHired TEXT,
      dateRegularized TEXT,
      dateResigned TEXT,
      resignationReason TEXT,
      employmentStatus TEXT DEFAULT 'Active',
      basicSalary REAL DEFAULT 0,
      salaryFrequency TEXT DEFAULT 'Monthly',
      dailyRate REAL DEFAULT 0,
      hourlyRate REAL DEFAULT 0,
      riceAllowance REAL DEFAULT 0,
      transportAllowance REAL DEFAULT 0,
      mealAllowance REAL DEFAULT 0,
      otherAllowances REAL DEFAULT 0,
      allowancesNotes TEXT,
      sssNumber TEXT,
      philhealthNumber TEXT,
      pagibigNumber TEXT,
      tinNumber TEXT,
      bankName TEXT,
      bankAccountNumber TEXT,
      bankAccountName TEXT,
      emergencyContactName TEXT,
      emergencyContactPhone TEXT,
      emergencyContactRelation TEXT,
      birthDate TEXT,
      civilStatus TEXT,
      numberOfDependents INTEGER DEFAULT 0,
      permanentAddress TEXT,
      presentAddress TEXT,
      contactPhone TEXT,
      vacationLeaveBalance REAL DEFAULT 5,
      sickLeaveBalance REAL DEFAULT 5,
      notes TEXT,
      createdAt TEXT,
      updatedAt TEXT,
      json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_emp_userId ON employees(userId);
    CREATE INDEX IF NOT EXISTS idx_emp_code ON employees(employeeCode);
    CREATE INDEX IF NOT EXISTS idx_emp_dept ON employees(department);
    CREATE INDEX IF NOT EXISTS idx_emp_status ON employees(employmentStatus);

    CREATE TABLE IF NOT EXISTS payroll_records (
      id TEXT PRIMARY KEY,
      employeeId TEXT NOT NULL,
      payPeriodStart TEXT NOT NULL,
      payPeriodEnd TEXT NOT NULL,
      payDate TEXT,
      month TEXT,
      basicPay REAL DEFAULT 0,
      overtimePay REAL DEFAULT 0,
      overtimeHours REAL DEFAULT 0,
      holidayPay REAL DEFAULT 0,
      nightDifferential REAL DEFAULT 0,
      riceAllowance REAL DEFAULT 0,
      transportAllowance REAL DEFAULT 0,
      mealAllowance REAL DEFAULT 0,
      otherAllowances REAL DEFAULT 0,
      adjustments REAL DEFAULT 0,
      adjustmentNotes TEXT,
      grossPay REAL DEFAULT 0,
      sssContribution REAL DEFAULT 0,
      sssEmployerShare REAL DEFAULT 0,
      philhealthContribution REAL DEFAULT 0,
      philhealthEmployerShare REAL DEFAULT 0,
      pagibigContribution REAL DEFAULT 0,
      pagibigEmployerShare REAL DEFAULT 0,
      withholdingTax REAL DEFAULT 0,
      sssLoan REAL DEFAULT 0,
      pagibigLoan REAL DEFAULT 0,
      otherDeductions REAL DEFAULT 0,
      otherDeductionNotes TEXT,
      totalDeductions REAL DEFAULT 0,
      netPay REAL DEFAULT 0,
      status TEXT DEFAULT 'Draft',
      approvedBy TEXT,
      approvedAt TEXT,
      paidVia TEXT,
      notes TEXT,
      computedBy TEXT,
      createdAt TEXT,
      updatedAt TEXT,
      json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_payroll_emp ON payroll_records(employeeId);
    CREATE INDEX IF NOT EXISTS idx_payroll_month ON payroll_records(month);
    CREATE INDEX IF NOT EXISTS idx_payroll_status ON payroll_records(status);
    CREATE INDEX IF NOT EXISTS idx_payroll_period ON payroll_records(payPeriodStart, payPeriodEnd);

    CREATE TABLE IF NOT EXISTS hr_documents (
      id TEXT PRIMARY KEY,
      employeeId TEXT NOT NULL,
      documentType TEXT NOT NULL,
      title TEXT,
      description TEXT,
      filePath TEXT,
      fileSize INTEGER,
      mimeType TEXT,
      forPeriod TEXT,
      generatedBy TEXT,
      isGenerated INTEGER DEFAULT 0,
      createdAt TEXT,
      json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_hrdoc_emp ON hr_documents(employeeId);
    CREATE INDEX IF NOT EXISTS idx_hrdoc_type ON hr_documents(documentType);
    CREATE INDEX IF NOT EXISTS idx_hrdoc_period ON hr_documents(forPeriod);

    CREATE TABLE IF NOT EXISTS leave_records (
      id TEXT PRIMARY KEY,
      employeeId TEXT NOT NULL,
      leaveType TEXT NOT NULL,
      startDate TEXT NOT NULL,
      endDate TEXT NOT NULL,
      totalDays REAL DEFAULT 1,
      reason TEXT,
      status TEXT DEFAULT 'Pending',
      approvedBy TEXT,
      approvedAt TEXT,
      notes TEXT,
      createdAt TEXT,
      json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_leave_emp ON leave_records(employeeId);
    CREATE INDEX IF NOT EXISTS idx_leave_status ON leave_records(status);
    CREATE INDEX IF NOT EXISTS idx_leave_dates ON leave_records(startDate, endDate);

    CREATE TABLE IF NOT EXISTS dtr_records (
      id TEXT PRIMARY KEY,
      employeeId TEXT NOT NULL,
      date TEXT NOT NULL,
      amIn TEXT,
      amOut TEXT,
      pmIn TEXT,
      pmOut TEXT,
      totalHours REAL DEFAULT 0,
      dutyCredit REAL DEFAULT 0,
      isFullDuty INTEGER DEFAULT 0,
      undertimeMinutes INTEGER DEFAULT 0,
      overtimeHours REAL DEFAULT 0,
      status TEXT DEFAULT 'Completed',
      notes TEXT,
      correctedBy TEXT,
      createdAt TEXT,
      updatedAt TEXT,
      json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_dtr_emp_date ON dtr_records(employeeId, date);
    CREATE INDEX IF NOT EXISTS idx_dtr_date ON dtr_records(date);
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
    deleteInventoryTransactionsByItemId: sqlite.prepare('DELETE FROM inventory_transactions WHERE inventoryId = ?'),

    getAllEquipment: sqlite.prepare('SELECT json FROM equipment ORDER BY name ASC'),
    getEquipmentById: sqlite.prepare('SELECT json FROM equipment WHERE id = ?'),
    getEquipmentByCode: sqlite.prepare('SELECT json FROM equipment WHERE equipmentCode = ?'),
    getEquipmentByDepartment: sqlite.prepare('SELECT json FROM equipment WHERE department = ? ORDER BY name ASC'),
    getEquipmentByCategory: sqlite.prepare('SELECT json FROM equipment WHERE category = ? ORDER BY name ASC'),
    upsertEquipment: sqlite.prepare('INSERT OR REPLACE INTO equipment (id, equipmentCode, name, category, department, serialNumber, status, nextCalibrationDate, nextPmDate, createdAt, updatedAt, json) VALUES (@id, @equipmentCode, @name, @category, @department, @serialNumber, @status, @nextCalibrationDate, @nextPmDate, @createdAt, @updatedAt, @json)'),
    deleteEquipmentById: sqlite.prepare('DELETE FROM equipment WHERE id = ?'),

    getAllEquipmentLogs: sqlite.prepare('SELECT json FROM equipment_logs ORDER BY serviceDate DESC, createdAt DESC'),
    getEquipmentLogsByEquipmentId: sqlite.prepare('SELECT json FROM equipment_logs WHERE equipmentId = ? ORDER BY serviceDate DESC, createdAt DESC'),
    getEquipmentLogById: sqlite.prepare('SELECT json FROM equipment_logs WHERE id = ?'),
    upsertEquipmentLog: sqlite.prepare('INSERT OR REPLACE INTO equipment_logs (id, equipmentId, logType, serviceDate, resultStatus, certificateNumber, createdAt, json) VALUES (@id, @equipmentId, @logType, @serviceDate, @resultStatus, @certificateNumber, @createdAt, @json)'),
    deleteEquipmentLogById: sqlite.prepare('DELETE FROM equipment_logs WHERE id = ?'),
    deleteEquipmentLogsByEquipmentId: sqlite.prepare('DELETE FROM equipment_logs WHERE equipmentId = ?'),

    getAllQcControls: sqlite.prepare('SELECT json FROM qc_controls ORDER BY createdAt DESC'),
    getQcControlsByEquipmentId: sqlite.prepare('SELECT json FROM qc_controls WHERE equipmentId = ? ORDER BY createdAt DESC'),
    getQcControlById: sqlite.prepare('SELECT json FROM qc_controls WHERE id = ?'),
    upsertQcControl: sqlite.prepare('INSERT OR REPLACE INTO qc_controls (id, equipmentId, controlName, lotNumber, level, expirationDate, isActive, createdAt, json) VALUES (@id, @equipmentId, @controlName, @lotNumber, @level, @expirationDate, @isActive, @createdAt, @json)'),
    deleteQcControlById: sqlite.prepare('DELETE FROM qc_controls WHERE id = ?'),
    deleteQcControlsByEquipmentId: sqlite.prepare('DELETE FROM qc_controls WHERE equipmentId = ?'),

    getAllQcEntries: sqlite.prepare('SELECT json FROM qc_entries ORDER BY runDate DESC, createdAt DESC'),
    getQcEntriesByEquipmentId: sqlite.prepare('SELECT json FROM qc_entries WHERE equipmentId = ? ORDER BY runDate ASC, createdAt ASC'),
    getQcEntriesByEquipmentAndAnalyte: sqlite.prepare('SELECT json FROM qc_entries WHERE equipmentId = ? AND analyteCode = ? ORDER BY runDate ASC, createdAt ASC'),
    getQcEntryById: sqlite.prepare('SELECT json FROM qc_entries WHERE id = ?'),
    upsertQcEntry: sqlite.prepare('INSERT OR REPLACE INTO qc_entries (id, equipmentId, controlId, analyteCode, controlLot, runDate, measuredValue, zScore, status, createdAt, json) VALUES (@id, @equipmentId, @controlId, @analyteCode, @controlLot, @runDate, @measuredValue, @zScore, @status, @createdAt, @json)'),
    deleteQcEntryById: sqlite.prepare('DELETE FROM qc_entries WHERE id = ?'),
    deleteQcEntriesByEquipmentId: sqlite.prepare('DELETE FROM qc_entries WHERE equipmentId = ?'),
    deleteQcEntriesByEquipmentAndAnalyte: sqlite.prepare('DELETE FROM qc_entries WHERE equipmentId = ? AND analyteCode = ?'),

    getAllNeqasRecords: sqlite.prepare('SELECT json FROM neqas_records ORDER BY cycleYear DESC, createdAt DESC'),
    getNeqasRecordsByEquipmentId: sqlite.prepare('SELECT json FROM neqas_records WHERE equipmentId = ? ORDER BY cycleYear DESC, createdAt DESC'),
    getNeqasRecordById: sqlite.prepare('SELECT json FROM neqas_records WHERE id = ?'),
    upsertNeqasRecord: sqlite.prepare('INSERT OR REPLACE INTO neqas_records (id, equipmentId, cycleYear, eventNumber, nrlName, sampleId, analyteCode, status, createdAt, json) VALUES (@id, @equipmentId, @cycleYear, @eventNumber, @nrlName, @sampleId, @analyteCode, @status, @createdAt, @json)'),
    deleteNeqasRecordById: sqlite.prepare('DELETE FROM neqas_records WHERE id = ?'),
    deleteNeqasRecordsByEquipmentId: sqlite.prepare('DELETE FROM neqas_records WHERE equipmentId = ?'),

    getAllConsultations: sqlite.prepare('SELECT json FROM consultations ORDER BY consultationDate DESC, createdAt DESC'),
    getConsultationById: sqlite.prepare('SELECT json FROM consultations WHERE id = ?'),
    getConsultationByTestId: sqlite.prepare('SELECT json FROM consultations WHERE testId = ? ORDER BY createdAt DESC LIMIT 1'),
    getConsultationsByPatientId: sqlite.prepare('SELECT json FROM consultations WHERE patientId = ? ORDER BY consultationDate DESC, createdAt DESC'),
    upsertConsultation: sqlite.prepare('INSERT OR REPLACE INTO consultations (id, patientId, testId, doctorId, doctorName, doctorLicenseNumber, visitType, consultationDate, status, chiefComplaint, primaryDiagnosis, createdAt, updatedAt, completedAt, json) VALUES (@id, @patientId, @testId, @doctorId, @doctorName, @doctorLicenseNumber, @visitType, @consultationDate, @status, @chiefComplaint, @primaryDiagnosis, @createdAt, @updatedAt, @completedAt, @json)'),
    deleteConsultationById: sqlite.prepare('DELETE FROM consultations WHERE id = ?'),
    deleteConsultationsByPatientId: sqlite.prepare('DELETE FROM consultations WHERE patientId = ?'),

    // Expenses
    getAllExpenses: sqlite.prepare('SELECT json FROM expenses ORDER BY expenseDate DESC, createdAt DESC'),
    getExpenseById: sqlite.prepare('SELECT json FROM expenses WHERE id = ?'),
    getExpensesByMonth: sqlite.prepare('SELECT json FROM expenses WHERE month = ? ORDER BY expenseDate DESC'),
    getExpensesByCategory: sqlite.prepare('SELECT json FROM expenses WHERE category = ? ORDER BY expenseDate DESC'),
    upsertExpense: sqlite.prepare('INSERT OR REPLACE INTO expenses (id, category, subcategory, description, amount, currency, vendorSupplier, referenceId, referenceType, expenseDate, month, receiptUrl, notes, recordedBy, createdAt, updatedAt, json) VALUES (@id, @category, @subcategory, @description, @amount, @currency, @vendorSupplier, @referenceId, @referenceType, @expenseDate, @month, @receiptUrl, @notes, @recordedBy, @createdAt, @updatedAt, @json)'),
    deleteExpenseById: sqlite.prepare('DELETE FROM expenses WHERE id = ?'),

    // Revenue Entries
    getAllRevenueEntries: sqlite.prepare('SELECT json FROM revenue_entries ORDER BY revenueDate DESC, createdAt DESC'),
    getRevenueEntryById: sqlite.prepare('SELECT json FROM revenue_entries WHERE id = ?'),
    getRevenueEntriesByMonth: sqlite.prepare('SELECT json FROM revenue_entries WHERE month = ? ORDER BY revenueDate DESC'),
    upsertRevenueEntry: sqlite.prepare('INSERT OR REPLACE INTO revenue_entries (id, patientId, testId, paymentMethod, clinicalAmount, xrayAmount, totalAmount, discountAmount, discountType, revenueDate, month, notes, recordedBy, createdAt, json) VALUES (@id, @patientId, @testId, @paymentMethod, @clinicalAmount, @xrayAmount, @totalAmount, @discountAmount, @discountType, @revenueDate, @month, @notes, @recordedBy, @createdAt, @json)'),
    deleteRevenueEntryById: sqlite.prepare('DELETE FROM revenue_entries WHERE id = ?'),

    // Cost Per Test
    getAllCostPerTest: sqlite.prepare('SELECT json FROM cost_per_test ORDER BY testType ASC'),
    getCostPerTestById: sqlite.prepare('SELECT json FROM cost_per_test WHERE id = ?'),
    getCostPerTestByType: sqlite.prepare('SELECT json FROM cost_per_test WHERE testType = ?'),
    upsertCostPerTest: sqlite.prepare('INSERT OR REPLACE INTO cost_per_test (id, testType, inventoryItems, estimatedCost, notes, updatedBy, createdAt, updatedAt, json) VALUES (@id, @testType, @inventoryItems, @estimatedCost, @notes, @updatedBy, @createdAt, @updatedAt, @json)'),
    deleteCostPerTestById: sqlite.prepare('DELETE FROM cost_per_test WHERE id = ?'),

    // Employees
    getAllEmployees: sqlite.prepare('SELECT json FROM employees ORDER BY createdAt DESC'),
    getEmployeeById: sqlite.prepare('SELECT json FROM employees WHERE id = ?'),
    getEmployeeByUserId: sqlite.prepare('SELECT json FROM employees WHERE userId = ?'),
    getEmployeeByCode: sqlite.prepare('SELECT json FROM employees WHERE employeeCode = ?'),
    upsertEmployee: sqlite.prepare('INSERT OR REPLACE INTO employees (id, userId, employeeCode, department, position, employmentType, dateHired, dateRegularized, dateResigned, resignationReason, employmentStatus, basicSalary, salaryFrequency, dailyRate, hourlyRate, riceAllowance, transportAllowance, mealAllowance, otherAllowances, allowancesNotes, sssNumber, philhealthNumber, pagibigNumber, tinNumber, bankName, bankAccountNumber, bankAccountName, emergencyContactName, emergencyContactPhone, emergencyContactRelation, birthDate, civilStatus, numberOfDependents, permanentAddress, presentAddress, contactPhone, vacationLeaveBalance, sickLeaveBalance, notes, createdAt, updatedAt, json) VALUES (@id, @userId, @employeeCode, @department, @position, @employmentType, @dateHired, @dateRegularized, @dateResigned, @resignationReason, @employmentStatus, @basicSalary, @salaryFrequency, @dailyRate, @hourlyRate, @riceAllowance, @transportAllowance, @mealAllowance, @otherAllowances, @allowancesNotes, @sssNumber, @philhealthNumber, @pagibigNumber, @tinNumber, @bankName, @bankAccountNumber, @bankAccountName, @emergencyContactName, @emergencyContactPhone, @emergencyContactRelation, @birthDate, @civilStatus, @numberOfDependents, @permanentAddress, @presentAddress, @contactPhone, @vacationLeaveBalance, @sickLeaveBalance, @notes, @createdAt, @updatedAt, @json)'),
    deleteEmployeeById: sqlite.prepare('DELETE FROM employees WHERE id = ?'),

    // Payroll Records
    getAllPayrollRecords: sqlite.prepare('SELECT json FROM payroll_records ORDER BY payPeriodEnd DESC, createdAt DESC'),
    getPayrollRecordById: sqlite.prepare('SELECT json FROM payroll_records WHERE id = ?'),
    getPayrollRecordsByEmployee: sqlite.prepare('SELECT json FROM payroll_records WHERE employeeId = ? ORDER BY payPeriodEnd DESC'),
    getPayrollRecordsByMonth: sqlite.prepare('SELECT json FROM payroll_records WHERE month = ? ORDER BY payPeriodEnd DESC'),
    upsertPayrollRecord: sqlite.prepare('INSERT OR REPLACE INTO payroll_records (id, employeeId, payPeriodStart, payPeriodEnd, payDate, month, basicPay, overtimePay, overtimeHours, holidayPay, nightDifferential, riceAllowance, transportAllowance, mealAllowance, otherAllowances, adjustments, adjustmentNotes, grossPay, sssContribution, sssEmployerShare, philhealthContribution, philhealthEmployerShare, pagibigContribution, pagibigEmployerShare, withholdingTax, sssLoan, pagibigLoan, otherDeductions, otherDeductionNotes, totalDeductions, netPay, status, approvedBy, approvedAt, paidVia, notes, computedBy, createdAt, updatedAt, json) VALUES (@id, @employeeId, @payPeriodStart, @payPeriodEnd, @payDate, @month, @basicPay, @overtimePay, @overtimeHours, @holidayPay, @nightDifferential, @riceAllowance, @transportAllowance, @mealAllowance, @otherAllowances, @adjustments, @adjustmentNotes, @grossPay, @sssContribution, @sssEmployerShare, @philhealthContribution, @philhealthEmployerShare, @pagibigContribution, @pagibigEmployerShare, @withholdingTax, @sssLoan, @pagibigLoan, @otherDeductions, @otherDeductionNotes, @totalDeductions, @netPay, @status, @approvedBy, @approvedAt, @paidVia, @notes, @computedBy, @createdAt, @updatedAt, @json)'),
    deletePayrollRecordById: sqlite.prepare('DELETE FROM payroll_records WHERE id = ?'),

    // HR Documents
    getAllHrDocuments: sqlite.prepare('SELECT json FROM hr_documents ORDER BY createdAt DESC'),
    getHrDocumentById: sqlite.prepare('SELECT json FROM hr_documents WHERE id = ?'),
    getHrDocumentsByEmployee: sqlite.prepare('SELECT json FROM hr_documents WHERE employeeId = ? ORDER BY createdAt DESC'),
    upsertHrDocument: sqlite.prepare('INSERT OR REPLACE INTO hr_documents (id, employeeId, documentType, title, description, filePath, fileSize, mimeType, forPeriod, generatedBy, isGenerated, createdAt, json) VALUES (@id, @employeeId, @documentType, @title, @description, @filePath, @fileSize, @mimeType, @forPeriod, @generatedBy, @isGenerated, @createdAt, @json)'),
    deleteHrDocumentById: sqlite.prepare('DELETE FROM hr_documents WHERE id = ?'),

    // Leave Records
    getAllLeaveRecords: sqlite.prepare('SELECT json FROM leave_records ORDER BY startDate DESC, createdAt DESC'),
    getLeaveRecordById: sqlite.prepare('SELECT json FROM leave_records WHERE id = ?'),
    getLeaveRecordsByEmployee: sqlite.prepare('SELECT json FROM leave_records WHERE employeeId = ? ORDER BY startDate DESC'),
    upsertLeaveRecord: sqlite.prepare('INSERT OR REPLACE INTO leave_records (id, employeeId, leaveType, startDate, endDate, totalDays, reason, status, approvedBy, approvedAt, notes, createdAt, json) VALUES (@id, @employeeId, @leaveType, @startDate, @endDate, @totalDays, @reason, @status, @approvedBy, @approvedAt, @notes, @createdAt, @json)'),
    deleteLeaveRecordById: sqlite.prepare('DELETE FROM leave_records WHERE id = ?'),

    // DTR Records
    getAllDtrRecords: sqlite.prepare('SELECT json FROM dtr_records ORDER BY date DESC, createdAt DESC'),
    getDtrRecordById: sqlite.prepare('SELECT json FROM dtr_records WHERE id = ?'),
    getDtrRecordsByEmployee: sqlite.prepare('SELECT json FROM dtr_records WHERE employeeId = ? ORDER BY date ASC'),
    getDtrRecordsByEmployeeAndMonth: sqlite.prepare("SELECT json FROM dtr_records WHERE employeeId = ? AND date LIKE ? ORDER BY date ASC"),
    getDtrRecordByDate: sqlite.prepare('SELECT json FROM dtr_records WHERE employeeId = ? AND date = ? LIMIT 1'),
    upsertDtrRecord: sqlite.prepare('INSERT OR REPLACE INTO dtr_records (id, employeeId, date, amIn, amOut, pmIn, pmOut, totalHours, dutyCredit, isFullDuty, undertimeMinutes, overtimeHours, status, notes, correctedBy, createdAt, updatedAt, json) VALUES (@id, @employeeId, @date, @amIn, @amOut, @pmIn, @pmOut, @totalHours, @dutyCredit, @isFullDuty, @undertimeMinutes, @overtimeHours, @status, @notes, @correctedBy, @createdAt, @updatedAt, @json)'),
    deleteDtrRecordById: sqlite.prepare('DELETE FROM dtr_records WHERE id = ?')
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

    // Equipment Management Methods
    getEquipment() {
      try {
        const rows = stmts.getAllEquipment.all();
        return parseRows(rows);
      } catch (e) {
        return [];
      }
    },
    getEquipmentById(id) {
      if (!id) return null;
      try {
        const row = stmts.getEquipmentById.get(id);
        return row && row.json ? JSON.parse(row.json) : null;
      } catch (e) {
        return null;
      }
    },
    getEquipmentByCode(code) {
      if (!code) return null;
      try {
        const row = stmts.getEquipmentByCode.get(code);
        return row && row.json ? JSON.parse(row.json) : null;
      } catch (e) {
        return null;
      }
    },
    getEquipmentByDepartment(dept) {
      if (!dept) return [];
      try {
        const rows = stmts.getEquipmentByDepartment.all(dept);
        return parseRows(rows);
      } catch (e) {
        return [];
      }
    },
    getEquipmentByCategory(cat) {
      if (!cat) return [];
      try {
        const rows = stmts.getEquipmentByCategory.all(cat);
        return parseRows(rows);
      } catch (e) {
        return [];
      }
    },
    saveEquipment(item) {
      if (!item || !item.id) return null;
      try {
        const code = item.equipmentCode || item.code;
        if (code) {
          const existing = this.getEquipmentByCode(code);
          if (existing && existing.id && existing.id !== item.id) {
            item.id = existing.id;
          }
        }
        const data = {
          id: String(item.id),
          equipmentCode: safeStr(item.equipmentCode || item.code || ''),
          name: safeStr(item.name || ''),
          category: safeStr(item.category || ''),
          department: safeStr(item.department || ''),
          serialNumber: safeStr(item.serialNumber || ''),
          status: safeStr(item.status || 'OPERATIONAL'),
          nextCalibrationDate: safeStr(item.nextCalibrationDate || null),
          nextPmDate: safeStr(item.nextPmDate || null),
          createdAt: safeStr(item.createdAt || new Date().toISOString()),
          updatedAt: safeStr(item.updatedAt || new Date().toISOString()),
          json: JSON.stringify(item)
        };
        stmts.upsertEquipment.run(data);
        return item;
      } catch (e) {
        console.error('[sqliteDb] saveEquipment error:', e.message);
        return null;
      }
    },
    deleteEquipment(id) {
      try {
        stmts.deleteNeqasRecordsByEquipmentId.run(id);
        stmts.deleteQcEntriesByEquipmentId.run(id);
        stmts.deleteQcControlsByEquipmentId.run(id);
        stmts.deleteEquipmentLogsByEquipmentId.run(id);
        stmts.deleteEquipmentById.run(id);
        return true;
      } catch (e) {
        console.error('[sqliteDb] deleteEquipment error:', e && e.message);
        return false;
      }
    },

    // Equipment Logs Methods
    getEquipmentLogs(equipmentId) {
      try {
        const rows = equipmentId
          ? stmts.getEquipmentLogsByEquipmentId.all(equipmentId)
          : stmts.getAllEquipmentLogs.all();
        return parseRows(rows);
      } catch (e) {
        return [];
      }
    },
    getEquipmentLogById(id) {
      if (!id) return null;
      try {
        const row = stmts.getEquipmentLogById.get(id);
        return row && row.json ? JSON.parse(row.json) : null;
      } catch (e) {
        return null;
      }
    },
    saveEquipmentLog(log) {
      if (!log || !log.id) return null;
      try {
        const data = {
          id: String(log.id),
          equipmentId: String(log.equipmentId || ''),
          logType: safeStr(log.logType || 'CALIBRATION'),
          serviceDate: safeStr(log.serviceDate || new Date().toISOString()),
          resultStatus: safeStr(log.resultStatus || 'PASS'),
          certificateNumber: safeStr(log.certificateNumber || ''),
          createdAt: safeStr(log.createdAt || new Date().toISOString()),
          json: JSON.stringify(log)
        };
        stmts.upsertEquipmentLog.run(data);
        return log;
      } catch (e) {
        console.error('[sqliteDb] saveEquipmentLog error:', e.message);
        return null;
      }
    },
    deleteEquipmentLog(id) {
      try {
        stmts.deleteEquipmentLogById.run(id);
        return true;
      } catch (e) {
        return false;
      }
    },

    // QC Controls
    getQcControls(equipmentId) {
      try {
        const rows = equipmentId
          ? stmts.getQcControlsByEquipmentId.all(equipmentId)
          : stmts.getAllQcControls.all();
        return parseRows(rows);
      } catch (e) {
        return [];
      }
    },
    getQcControlById(id) {
      if (!id) return null;
      try {
        const row = stmts.getQcControlById.get(id);
        return row && row.json ? JSON.parse(row.json) : null;
      } catch (e) {
        return null;
      }
    },
    saveQcControl(ctrl) {
      if (!ctrl || !ctrl.id) return null;
      try {
        const data = {
          id: String(ctrl.id),
          equipmentId: String(ctrl.equipmentId || ''),
          controlName: safeStr(ctrl.controlName || ''),
          lotNumber: safeStr(ctrl.lotNumber || ''),
          level: safeStr(ctrl.level || 'Level 1'),
          expirationDate: safeStr(ctrl.expirationDate || null),
          isActive: ctrl.isActive !== false ? 1 : 0,
          createdAt: safeStr(ctrl.createdAt || new Date().toISOString()),
          json: JSON.stringify(ctrl)
        };
        stmts.upsertQcControl.run(data);
        return ctrl;
      } catch (e) {
        console.error('[sqliteDb] saveQcControl error:', e.message);
        return null;
      }
    },
    deleteQcControl(id) {
      try {
        stmts.deleteQcControlById.run(id);
        return true;
      } catch (e) {
        return false;
      }
    },

    // QC Entries
    getQcEntries(equipmentId, analyteCode) {
      try {
        let rows;
        if (equipmentId && analyteCode) {
          rows = stmts.getQcEntriesByEquipmentAndAnalyte.all(equipmentId, analyteCode);
        } else if (equipmentId) {
          rows = stmts.getQcEntriesByEquipmentId.all(equipmentId);
        } else {
          rows = stmts.getAllQcEntries.all();
        }
        return parseRows(rows);
      } catch (e) {
        return [];
      }
    },
    getQcEntryById(id) {
      if (!id) return null;
      try {
        const row = stmts.getQcEntryById.get(id);
        return row && row.json ? JSON.parse(row.json) : null;
      } catch (e) {
        return null;
      }
    },
    saveQcEntry(entry) {
      if (!entry || !entry.id) return null;
      try {
        const data = {
          id: String(entry.id),
          equipmentId: String(entry.equipmentId || ''),
          controlId: String(entry.controlId || ''),
          analyteCode: safeStr(entry.analyteCode || ''),
          controlLot: safeStr(entry.controlLot || ''),
          runDate: safeStr(entry.runDate || new Date().toISOString()),
          measuredValue: Number(entry.measuredValue) || 0,
          zScore: Number.isFinite(Number(entry.zScore)) ? Number(entry.zScore) : 0,
          status: safeStr(entry.status || 'ACCEPTED'),
          createdAt: safeStr(entry.createdAt || new Date().toISOString()),
          json: JSON.stringify(entry)
        };
        stmts.upsertQcEntry.run(data);
        return entry;
      } catch (e) {
        console.error('[sqliteDb] saveQcEntry error:', e.message);
        return null;
      }
    },
    deleteQcEntry(id) {
      try {
        stmts.deleteQcEntryById.run(id);
        return true;
      } catch (e) {
        return false;
      }
    },
    deleteQcEntries(equipmentId, analyteCode) {
      try {
        if (equipmentId && analyteCode) {
          stmts.deleteQcEntriesByEquipmentAndAnalyte.run(equipmentId, analyteCode);
        } else if (equipmentId) {
          stmts.deleteQcEntriesByEquipmentId.run(equipmentId);
        }
        return true;
      } catch (e) {
        return false;
      }
    },

    // NEQAS Records
    getNeqasRecords(equipmentId) {
      try {
        const rows = equipmentId
          ? stmts.getNeqasRecordsByEquipmentId.all(equipmentId)
          : stmts.getAllNeqasRecords.all();
        return parseRows(rows);
      } catch (e) {
        return [];
      }
    },
    getNeqasRecordById(id) {
      if (!id) return null;
      try {
        const row = stmts.getNeqasRecordById.get(id);
        return row && row.json ? JSON.parse(row.json) : null;
      } catch (e) {
        return null;
      }
    },
    saveNeqasRecord(rec) {
      if (!rec || !rec.id) return null;
      try {
        const data = {
          id: String(rec.id),
          equipmentId: String(rec.equipmentId || ''),
          cycleYear: safeStr(rec.cycleYear || String(new Date().getFullYear())),
          eventNumber: safeStr(rec.eventNumber || '1'),
          nrlName: safeStr(rec.nrlName || 'LCP'),
          sampleId: safeStr(rec.sampleId || ''),
          analyteCode: safeStr(rec.analyteCode || ''),
          status: safeStr(rec.status || 'PENDING'),
          createdAt: safeStr(rec.createdAt || new Date().toISOString()),
          json: JSON.stringify(rec)
        };
        stmts.upsertNeqasRecord.run(data);
        return rec;
      } catch (e) {
        console.error('[sqliteDb] saveNeqasRecord error:', e.message);
        return null;
      }
    },
    deleteNeqasRecord(id) {
      try {
        stmts.deleteNeqasRecordById.run(id);
        return true;
      } catch (e) {
        return false;
      }
    },
    getCustomNrls() {
      try {
        const row = sqlite.prepare("SELECT json FROM settings WHERE key = 'custom_nrls'").get();
        return row && row.json ? JSON.parse(row.json) : [];
      } catch (e) {
        return [];
      }
    },
    saveCustomNrls(list) {
      try {
        const json = JSON.stringify(list || []);
        sqlite.prepare("INSERT OR REPLACE INTO settings (key, json) VALUES ('custom_nrls', ?)").run(json);
        return true;
      } catch (e) {
        console.error('[sqliteDb] saveCustomNrls error:', e.message);
        return false;
      }
    },

    // Consultations
    getConsultations() {
      try {
        const rows = stmts.getAllConsultations.all();
        return parseRows(rows);
      } catch (e) {
        return [];
      }
    },
    getConsultationById(id) {
      if (!id) return null;
      try {
        const row = stmts.getConsultationById.get(id);
        return row && row.json ? JSON.parse(row.json) : null;
      } catch (e) {
        return null;
      }
    },
    getConsultationByTestId(testId) {
      if (!testId) return null;
      try {
        const row = stmts.getConsultationByTestId.get(testId);
        return row && row.json ? JSON.parse(row.json) : null;
      } catch (e) {
        return null;
      }
    },
    getConsultationsByPatientId(patientId) {
      if (!patientId) return [];
      try {
        const rows = stmts.getConsultationsByPatientId.all(patientId);
        return parseRows(rows);
      } catch (e) {
        return [];
      }
    },
    saveConsultation(c) {
      if (!c || !c.id) return null;
      try {
        const now = new Date().toISOString();
        const data = {
          id: String(c.id),
          patientId: safeStr(c.patientId || ''),
          testId: safeStr(c.testId || ''),
          doctorId: safeStr(c.doctorId || ''),
          doctorName: safeStr(c.doctorName || ''),
          doctorLicenseNumber: safeStr(c.doctorLicenseNumber || ''),
          visitType: safeStr(c.visitType || 'New'),
          consultationDate: safeStr(c.consultationDate || now),
          status: safeStr(c.status || 'In Progress'),
          chiefComplaint: safeStr(c.chiefComplaint || ''),
          primaryDiagnosis: safeStr(c.primaryDiagnosis || ''),
          createdAt: safeStr(c.createdAt || now),
          updatedAt: safeStr(c.updatedAt || now),
          completedAt: safeStr(c.completedAt || null),
          json: JSON.stringify(c)
        };
        stmts.upsertConsultation.run(data);
        return c;
      } catch (e) {
        console.error('[sqliteDb] saveConsultation error:', e.message);
        return null;
      }
    },
    deleteConsultation(id) {
      try {
        stmts.deleteConsultationById.run(id);
        return true;
      } catch (e) {
        return false;
      }
    },

    // Expenses Methods
    getExpenses(month, category) {
      try {
        let rows;
        if (month) rows = stmts.getExpensesByMonth.all(month);
        else if (category) rows = stmts.getExpensesByCategory.all(category);
        else rows = stmts.getAllExpenses.all();
        return parseRows(rows);
      } catch (e) { return []; }
    },
    getExpenseById(id) {
      if (!id) return null;
      try {
        const row = stmts.getExpenseById.get(id);
        return row && row.json ? JSON.parse(row.json) : null;
      } catch (e) { return null; }
    },
    saveExpense(exp) {
      if (!exp || !exp.id) return null;
      try {
        const now = new Date().toISOString();
        const data = {
          id: String(exp.id),
          category: safeStr(exp.category || 'misc'),
          subcategory: safeStr(exp.subcategory || ''),
          description: safeStr(exp.description || ''),
          amount: Number(exp.amount) || 0,
          currency: safeStr(exp.currency || 'PHP'),
          vendorSupplier: safeStr(exp.vendorSupplier || ''),
          referenceId: safeStr(exp.referenceId || null),
          referenceType: safeStr(exp.referenceType || 'manual'),
          expenseDate: safeStr(exp.expenseDate || now),
          month: safeStr(exp.month || (exp.expenseDate ? exp.expenseDate.slice(0, 7) : now.slice(0, 7))),
          receiptUrl: safeStr(exp.receiptUrl || null),
          notes: safeStr(exp.notes || ''),
          recordedBy: safeStr(exp.recordedBy || 'System'),
          createdAt: safeStr(exp.createdAt || now),
          updatedAt: safeStr(exp.updatedAt || now),
          json: JSON.stringify(exp)
        };
        stmts.upsertExpense.run(data);
        return exp;
      } catch (e) {
        console.error('[sqliteDb] saveExpense error:', e.message);
        return null;
      }
    },
    deleteExpense(id) {
      try {
        stmts.deleteExpenseById.run(id);
        return true;
      } catch (e) { return false; }
    },

    // Revenue Entries Methods
    getRevenueEntries(month) {
      try {
        const rows = month ? stmts.getRevenueEntriesByMonth.all(month) : stmts.getAllRevenueEntries.all();
        return parseRows(rows);
      } catch (e) { return []; }
    },
    getRevenueEntryById(id) {
      if (!id) return null;
      try {
        const row = stmts.getRevenueEntryById.get(id);
        return row && row.json ? JSON.parse(row.json) : null;
      } catch (e) { return null; }
    },
    saveRevenueEntry(rev) {
      if (!rev || !rev.id) return null;
      try {
        const now = new Date().toISOString();
        const data = {
          id: String(rev.id),
          patientId: safeStr(rev.patientId || ''),
          testId: safeStr(rev.testId || ''),
          paymentMethod: safeStr(rev.paymentMethod || 'Cash'),
          clinicalAmount: Number(rev.clinicalAmount) || 0,
          xrayAmount: Number(rev.xrayAmount) || 0,
          totalAmount: Number(rev.totalAmount) || 0,
          discountAmount: Number(rev.discountAmount) || 0,
          discountType: safeStr(rev.discountType || 'None'),
          revenueDate: safeStr(rev.revenueDate || now),
          month: safeStr(rev.month || (rev.revenueDate ? rev.revenueDate.slice(0, 7) : now.slice(0, 7))),
          notes: safeStr(rev.notes || ''),
          recordedBy: safeStr(rev.recordedBy || 'System'),
          createdAt: safeStr(rev.createdAt || now),
          json: JSON.stringify(rev)
        };
        stmts.upsertRevenueEntry.run(data);
        return rev;
      } catch (e) {
        console.error('[sqliteDb] saveRevenueEntry error:', e.message);
        return null;
      }
    },
    deleteRevenueEntry(id) {
      try {
        stmts.deleteRevenueEntryById.run(id);
        return true;
      } catch (e) { return false; }
    },

    // Cost Per Test Methods
    getCostPerTests() {
      try {
        const rows = stmts.getAllCostPerTest.all();
        return parseRows(rows);
      } catch (e) { return []; }
    },
    getCostPerTestById(id) {
      if (!id) return null;
      try {
        const row = stmts.getCostPerTestById.get(id);
        return row && row.json ? JSON.parse(row.json) : null;
      } catch (e) { return null; }
    },
    getCostPerTestByType(type) {
      if (!type) return null;
      try {
        const row = stmts.getCostPerTestByType.get(type);
        return row && row.json ? JSON.parse(row.json) : null;
      } catch (e) { return null; }
    },
    saveCostPerTest(cpt) {
      if (!cpt || !cpt.id) return null;
      try {
        const now = new Date().toISOString();
        const data = {
          id: String(cpt.id),
          testType: safeStr(cpt.testType || ''),
          inventoryItems: typeof cpt.inventoryItems === 'string' ? cpt.inventoryItems : JSON.stringify(cpt.inventoryItems || []),
          estimatedCost: Number(cpt.estimatedCost) || 0,
          notes: safeStr(cpt.notes || ''),
          updatedBy: safeStr(cpt.updatedBy || 'System'),
          createdAt: safeStr(cpt.createdAt || now),
          updatedAt: safeStr(cpt.updatedAt || now),
          json: JSON.stringify(cpt)
        };
        stmts.upsertCostPerTest.run(data);
        return cpt;
      } catch (e) {
        console.error('[sqliteDb] saveCostPerTest error:', e.message);
        return null;
      }
    },
    deleteCostPerTest(id) {
      try {
        stmts.deleteCostPerTestById.run(id);
        return true;
      } catch (e) { return false; }
    },

    // Employees Methods
    getEmployees() {
      try {
        const rows = stmts.getAllEmployees.all();
        return parseRows(rows);
      } catch (e) { return []; }
    },
    getEmployeeById(id) {
      if (!id) return null;
      try {
        const row = stmts.getEmployeeById.get(id);
        return row && row.json ? JSON.parse(row.json) : null;
      } catch (e) { return null; }
    },
    getEmployeeByUserId(userId) {
      if (!userId) return null;
      try {
        const row = stmts.getEmployeeByUserId.get(userId);
        return row && row.json ? JSON.parse(row.json) : null;
      } catch (e) { return null; }
    },
    getEmployeeByCode(code) {
      if (!code) return null;
      try {
        const row = stmts.getEmployeeByCode.get(code);
        return row && row.json ? JSON.parse(row.json) : null;
      } catch (e) { return null; }
    },
    saveEmployee(emp) {
      if (!emp || !emp.id) return null;
      try {
        const now = new Date().toISOString();
        const data = {
          id: String(emp.id),
          userId: safeStr(emp.userId || ''),
          employeeCode: safeStr(emp.employeeCode || ''),
          department: safeStr(emp.department || ''),
          position: safeStr(emp.position || ''),
          employmentType: safeStr(emp.employmentType || 'Regular'),
          dateHired: safeStr(emp.dateHired || null),
          dateRegularized: safeStr(emp.dateRegularized || null),
          dateResigned: safeStr(emp.dateResigned || null),
          resignationReason: safeStr(emp.resignationReason || null),
          employmentStatus: safeStr(emp.employmentStatus || 'Active'),
          basicSalary: Number(emp.basicSalary) || 0,
          salaryFrequency: safeStr(emp.salaryFrequency || 'Monthly'),
          dailyRate: Number(emp.dailyRate) || 0,
          hourlyRate: Number(emp.hourlyRate) || 0,
          riceAllowance: Number(emp.riceAllowance) || 0,
          transportAllowance: Number(emp.transportAllowance) || 0,
          mealAllowance: Number(emp.mealAllowance) || 0,
          otherAllowances: Number(emp.otherAllowances) || 0,
          allowancesNotes: safeStr(emp.allowancesNotes || ''),
          sssNumber: safeStr(emp.sssNumber || ''),
          philhealthNumber: safeStr(emp.philhealthNumber || ''),
          pagibigNumber: safeStr(emp.pagibigNumber || ''),
          tinNumber: safeStr(emp.tinNumber || ''),
          bankName: safeStr(emp.bankName || ''),
          bankAccountNumber: safeStr(emp.bankAccountNumber || ''),
          bankAccountName: safeStr(emp.bankAccountName || ''),
          emergencyContactName: safeStr(emp.emergencyContactName || ''),
          emergencyContactPhone: safeStr(emp.emergencyContactPhone || ''),
          emergencyContactRelation: safeStr(emp.emergencyContactRelation || ''),
          birthDate: safeStr(emp.birthDate || null),
          civilStatus: safeStr(emp.civilStatus || 'Single'),
          numberOfDependents: parseInt(emp.numberOfDependents, 10) || 0,
          permanentAddress: safeStr(emp.permanentAddress || ''),
          presentAddress: safeStr(emp.presentAddress || ''),
          contactPhone: safeStr(emp.contactPhone || ''),
          vacationLeaveBalance: Number(emp.vacationLeaveBalance) || 5,
          sickLeaveBalance: Number(emp.sickLeaveBalance) || 5,
          notes: safeStr(emp.notes || ''),
          createdAt: safeStr(emp.createdAt || now),
          updatedAt: safeStr(emp.updatedAt || now),
          json: JSON.stringify(emp)
        };
        stmts.upsertEmployee.run(data);
        return emp;
      } catch (e) {
        console.error('[sqliteDb] saveEmployee error:', e.message);
        return null;
      }
    },
    deleteEmployee(id) {
      try {
        stmts.deleteEmployeeById.run(id);
        return true;
      } catch (e) { return false; }
    },

    // Payroll Records Methods
    getPayrollRecords(month, employeeId) {
      try {
        let rows;
        if (month) rows = stmts.getPayrollRecordsByMonth.all(month);
        else if (employeeId) rows = stmts.getPayrollRecordsByEmployee.all(employeeId);
        else rows = stmts.getAllPayrollRecords.all();
        return parseRows(rows);
      } catch (e) { return []; }
    },
    getPayrollRecordById(id) {
      if (!id) return null;
      try {
        const row = stmts.getPayrollRecordById.get(id);
        return row && row.json ? JSON.parse(row.json) : null;
      } catch (e) { return null; }
    },
    getPayrollRecordsByEmployee(empId) {
      if (!empId) return [];
      try {
        const rows = stmts.getPayrollRecordsByEmployee.all(empId);
        return parseRows(rows);
      } catch (e) { return []; }
    },
    savePayrollRecord(p) {
      if (!p || !p.id) return null;
      try {
        const now = new Date().toISOString();
        const data = {
          id: String(p.id),
          employeeId: safeStr(p.employeeId || ''),
          payPeriodStart: safeStr(p.payPeriodStart || now),
          payPeriodEnd: safeStr(p.payPeriodEnd || now),
          payDate: safeStr(p.payDate || null),
          month: safeStr(p.month || (p.payPeriodEnd ? p.payPeriodEnd.slice(0, 7) : now.slice(0, 7))),
          basicPay: Number(p.basicPay) || 0,
          overtimePay: Number(p.overtimePay) || 0,
          overtimeHours: Number(p.overtimeHours) || 0,
          holidayPay: Number(p.holidayPay) || 0,
          nightDifferential: Number(p.nightDifferential) || 0,
          riceAllowance: Number(p.riceAllowance) || 0,
          transportAllowance: Number(p.transportAllowance) || 0,
          mealAllowance: Number(p.mealAllowance) || 0,
          otherAllowances: Number(p.otherAllowances) || 0,
          adjustments: Number(p.adjustments) || 0,
          adjustmentNotes: safeStr(p.adjustmentNotes || ''),
          grossPay: Number(p.grossPay) || 0,
          sssContribution: Number(p.sssContribution) || 0,
          sssEmployerShare: Number(p.sssEmployerShare) || 0,
          philhealthContribution: Number(p.philhealthContribution) || 0,
          philhealthEmployerShare: Number(p.philhealthEmployerShare) || 0,
          pagibigContribution: Number(p.pagibigContribution) || 0,
          pagibigEmployerShare: Number(p.pagibigEmployerShare) || 0,
          withholdingTax: Number(p.withholdingTax) || 0,
          sssLoan: Number(p.sssLoan) || 0,
          pagibigLoan: Number(p.pagibigLoan) || 0,
          otherDeductions: Number(p.otherDeductions) || 0,
          otherDeductionNotes: safeStr(p.otherDeductionNotes || ''),
          totalDeductions: Number(p.totalDeductions) || 0,
          netPay: Number(p.netPay) || 0,
          status: safeStr(p.status || 'Draft'),
          approvedBy: safeStr(p.approvedBy || null),
          approvedAt: safeStr(p.approvedAt || null),
          paidVia: safeStr(p.paidVia || 'Cash'),
          notes: safeStr(p.notes || ''),
          computedBy: safeStr(p.computedBy || 'System'),
          createdAt: safeStr(p.createdAt || now),
          updatedAt: safeStr(p.updatedAt || now),
          json: JSON.stringify(p)
        };
        stmts.upsertPayrollRecord.run(data);
        return p;
      } catch (e) {
        console.error('[sqliteDb] savePayrollRecord error:', e.message);
        return null;
      }
    },
    deletePayrollRecord(id) {
      try {
        stmts.deletePayrollRecordById.run(id);
        return true;
      } catch (e) { return false; }
    },

    // HR Documents Methods
    getHrDocuments(employeeId) {
      try {
        const rows = employeeId ? stmts.getHrDocumentsByEmployee.all(employeeId) : stmts.getAllHrDocuments.all();
        return parseRows(rows);
      } catch (e) { return []; }
    },
    getHrDocumentById(id) {
      if (!id) return null;
      try {
        const row = stmts.getHrDocumentById.get(id);
        return row && row.json ? JSON.parse(row.json) : null;
      } catch (e) { return null; }
    },
    saveHrDocument(doc) {
      if (!doc || !doc.id) return null;
      try {
        const now = new Date().toISOString();
        const data = {
          id: String(doc.id),
          employeeId: safeStr(doc.employeeId || ''),
          documentType: safeStr(doc.documentType || 'Other'),
          title: safeStr(doc.title || ''),
          description: safeStr(doc.description || ''),
          filePath: safeStr(doc.filePath || null),
          fileSize: parseInt(doc.fileSize, 10) || 0,
          mimeType: safeStr(doc.mimeType || ''),
          forPeriod: safeStr(doc.forPeriod || null),
          generatedBy: safeStr(doc.generatedBy || 'System'),
          isGenerated: doc.isGenerated ? 1 : 0,
          createdAt: safeStr(doc.createdAt || now),
          json: JSON.stringify(doc)
        };
        stmts.upsertHrDocument.run(data);
        return doc;
      } catch (e) {
        console.error('[sqliteDb] saveHrDocument error:', e.message);
        return null;
      }
    },
    deleteHrDocument(id) {
      try {
        stmts.deleteHrDocumentById.run(id);
        return true;
      } catch (e) { return false; }
    },

    // Leave Records Methods
    getLeaveRecords(employeeId) {
      try {
        const rows = employeeId ? stmts.getLeaveRecordsByEmployee.all(employeeId) : stmts.getAllLeaveRecords.all();
        return parseRows(rows);
      } catch (e) { return []; }
    },
    getLeaveRecordById(id) {
      if (!id) return null;
      try {
        const row = stmts.getLeaveRecordById.get(id);
        return row && row.json ? JSON.parse(row.json) : null;
      } catch (e) { return null; }
    },
    saveLeaveRecord(lr) {
      if (!lr || !lr.id) return null;
      try {
        const now = new Date().toISOString();
        const data = {
          id: String(lr.id),
          employeeId: safeStr(lr.employeeId || ''),
          leaveType: safeStr(lr.leaveType || 'Vacation'),
          startDate: safeStr(lr.startDate || now),
          endDate: safeStr(lr.endDate || now),
          totalDays: Number(lr.totalDays) || 1,
          reason: safeStr(lr.reason || ''),
          status: safeStr(lr.status || 'Pending'),
          approvedBy: safeStr(lr.approvedBy || null),
          approvedAt: safeStr(lr.approvedAt || null),
          notes: safeStr(lr.notes || ''),
          createdAt: safeStr(lr.createdAt || now),
          json: JSON.stringify(lr)
        };
        stmts.upsertLeaveRecord.run(data);
        return lr;
      } catch (e) {
        console.error('[sqliteDb] saveLeaveRecord error:', e.message);
        return null;
      }
    },
    deleteLeaveRecord(id) {
      try {
        stmts.deleteLeaveRecordById.run(id);
        return true;
      } catch (e) { return false; }
    },

    // DTR Records Methods
    getDtrRecords(employeeId, yearMonth) {
      try {
        if (employeeId && yearMonth) {
          const rows = stmts.getDtrRecordsByEmployeeAndMonth.all(employeeId, `${yearMonth}%`);
          return parseRows(rows);
        } else if (employeeId) {
          const rows = stmts.getDtrRecordsByEmployee.all(employeeId);
          return parseRows(rows);
        } else {
          const rows = stmts.getAllDtrRecords.all();
          return parseRows(rows);
        }
      } catch (e) { return []; }
    },
    getDtrRecordByDate(employeeId, date) {
      if (!employeeId || !date) return null;
      try {
        const row = stmts.getDtrRecordByDate.get(employeeId, date);
        return row && row.json ? JSON.parse(row.json) : null;
      } catch (e) { return null; }
    },
    saveDtrRecord(dtr) {
      if (!dtr || !dtr.id) return null;
      try {
        const now = new Date().toISOString();
        const data = {
          id: String(dtr.id),
          employeeId: safeStr(dtr.employeeId || ''),
          date: safeStr(dtr.date || now.slice(0, 10)),
          amIn: safeStr(dtr.amIn || ''),
          amOut: safeStr(dtr.amOut || ''),
          pmIn: safeStr(dtr.pmIn || ''),
          pmOut: safeStr(dtr.pmOut || ''),
          totalHours: Number(dtr.totalHours) || 0,
          dutyCredit: Number(dtr.dutyCredit) || 0,
          isFullDuty: Number(dtr.isFullDuty) || 0,
          undertimeMinutes: Number(dtr.undertimeMinutes) || 0,
          overtimeHours: Number(dtr.overtimeHours) || 0,
          status: safeStr(dtr.status || 'Completed'),
          notes: safeStr(dtr.notes || ''),
          correctedBy: safeStr(dtr.correctedBy || null),
          createdAt: safeStr(dtr.createdAt || now),
          updatedAt: safeStr(dtr.updatedAt || now),
          json: JSON.stringify(dtr)
        };
        stmts.upsertDtrRecord.run(data);
        return dtr;
      } catch (e) {
        console.error('[sqliteDb] saveDtrRecord error:', e.message);
        return null;
      }
    },
    deleteDtrRecord(id) {
      try {
        stmts.deleteDtrRecordById.run(id);
        return true;
      } catch (e) { return false; }
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

    CREATE TABLE IF NOT EXISTS equipment (
      id TEXT PRIMARY KEY,
      equipmentCode TEXT UNIQUE,
      name TEXT,
      category TEXT,
      department TEXT,
      serialNumber TEXT,
      status TEXT,
      nextCalibrationDate TEXT,
      nextPmDate TEXT,
      createdAt TEXT,
      updatedAt TEXT,
      json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_eq_code ON equipment(equipmentCode);
    CREATE INDEX IF NOT EXISTS idx_eq_category ON equipment(category);
    CREATE INDEX IF NOT EXISTS idx_eq_dept ON equipment(department);
    CREATE INDEX IF NOT EXISTS idx_eq_status ON equipment(status);
    CREATE INDEX IF NOT EXISTS idx_eq_next_cal ON equipment(nextCalibrationDate);

    CREATE TABLE IF NOT EXISTS equipment_logs (
      id TEXT PRIMARY KEY,
      equipmentId TEXT,
      logType TEXT,
      serviceDate TEXT,
      resultStatus TEXT,
      certificateNumber TEXT,
      createdAt TEXT,
      json TEXT NOT NULL,
      FOREIGN KEY(equipmentId) REFERENCES equipment(id)
    );
    CREATE INDEX IF NOT EXISTS idx_eq_logs_eqid ON equipment_logs(equipmentId);
    CREATE INDEX IF NOT EXISTS idx_eq_logs_type ON equipment_logs(logType);
    CREATE INDEX IF NOT EXISTS idx_eq_logs_date ON equipment_logs(serviceDate);

    CREATE TABLE IF NOT EXISTS qc_controls (
      id TEXT PRIMARY KEY,
      equipmentId TEXT,
      controlName TEXT,
      lotNumber TEXT,
      level TEXT,
      expirationDate TEXT,
      isActive INTEGER DEFAULT 1,
      createdAt TEXT,
      json TEXT NOT NULL,
      FOREIGN KEY(equipmentId) REFERENCES equipment(id)
    );
    CREATE INDEX IF NOT EXISTS idx_qc_ctrl_eqid ON qc_controls(equipmentId);
    CREATE INDEX IF NOT EXISTS idx_qc_ctrl_lot ON qc_controls(lotNumber);

    CREATE TABLE IF NOT EXISTS qc_entries (
      id TEXT PRIMARY KEY,
      equipmentId TEXT,
      controlId TEXT,
      analyteCode TEXT,
      controlLot TEXT,
      runDate TEXT,
      measuredValue REAL,
      zScore REAL,
      status TEXT,
      createdAt TEXT,
      json TEXT NOT NULL,
      FOREIGN KEY(equipmentId) REFERENCES equipment(id),
      FOREIGN KEY(controlId) REFERENCES qc_controls(id)
    );
    CREATE INDEX IF NOT EXISTS idx_qc_entry_eqid ON qc_entries(equipmentId);
    CREATE INDEX IF NOT EXISTS idx_qc_entry_ctrl ON qc_entries(controlId);
    CREATE INDEX IF NOT EXISTS idx_qc_entry_analyte ON qc_entries(analyteCode);
    CREATE INDEX IF NOT EXISTS idx_qc_entry_date ON qc_entries(runDate);

    CREATE TABLE IF NOT EXISTS neqas_records (
      id TEXT PRIMARY KEY,
      equipmentId TEXT,
      cycleYear TEXT,
      eventNumber TEXT,
      nrlName TEXT,
      sampleId TEXT,
      analyteCode TEXT,
      status TEXT,
      createdAt TEXT,
      json TEXT NOT NULL,
      FOREIGN KEY(equipmentId) REFERENCES equipment(id)
    );
    CREATE INDEX IF NOT EXISTS idx_neqas_eqid ON neqas_records(equipmentId);
    CREATE INDEX IF NOT EXISTS idx_neqas_year ON neqas_records(cycleYear);
    CREATE INDEX IF NOT EXISTS idx_neqas_status ON neqas_records(status);

    CREATE TABLE IF NOT EXISTS consultations (
      id TEXT PRIMARY KEY,
      patientId TEXT NOT NULL,
      testId TEXT,
      doctorId TEXT,
      doctorName TEXT,
      doctorLicenseNumber TEXT,
      visitType TEXT DEFAULT 'New',
      consultationDate TEXT,
      status TEXT DEFAULT 'In Progress',
      chiefComplaint TEXT,
      primaryDiagnosis TEXT,
      createdAt TEXT,
      updatedAt TEXT,
      completedAt TEXT,
      json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sqljs_consult_patient ON consultations(patientId);
    CREATE INDEX IF NOT EXISTS idx_sqljs_consult_test ON consultations(testId);
    CREATE INDEX IF NOT EXISTS idx_sqljs_consult_doctor ON consultations(doctorName);
    CREATE INDEX IF NOT EXISTS idx_sqljs_consult_date ON consultations(consultationDate);
    CREATE INDEX IF NOT EXISTS idx_sqljs_consult_status ON consultations(status);

    -- Costing & HR Tables (sql.js)
    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      subcategory TEXT,
      description TEXT,
      amount REAL NOT NULL DEFAULT 0,
      currency TEXT DEFAULT 'PHP',
      vendorSupplier TEXT,
      referenceId TEXT,
      referenceType TEXT,
      expenseDate TEXT NOT NULL,
      month TEXT,
      receiptUrl TEXT,
      notes TEXT,
      recordedBy TEXT,
      createdAt TEXT,
      updatedAt TEXT,
      json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS revenue_entries (
      id TEXT PRIMARY KEY,
      patientId TEXT,
      testId TEXT,
      paymentMethod TEXT,
      clinicalAmount REAL DEFAULT 0,
      xrayAmount REAL DEFAULT 0,
      totalAmount REAL DEFAULT 0,
      discountAmount REAL DEFAULT 0,
      discountType TEXT,
      revenueDate TEXT NOT NULL,
      month TEXT,
      notes TEXT,
      recordedBy TEXT,
      createdAt TEXT,
      json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS cost_per_test (
      id TEXT PRIMARY KEY,
      testType TEXT NOT NULL,
      inventoryItems TEXT,
      estimatedCost REAL DEFAULT 0,
      notes TEXT,
      updatedBy TEXT,
      createdAt TEXT,
      updatedAt TEXT,
      json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL UNIQUE,
      employeeCode TEXT UNIQUE,
      department TEXT,
      position TEXT,
      employmentType TEXT DEFAULT 'Regular',
      dateHired TEXT,
      dateRegularized TEXT,
      dateResigned TEXT,
      resignationReason TEXT,
      employmentStatus TEXT DEFAULT 'Active',
      basicSalary REAL DEFAULT 0,
      salaryFrequency TEXT DEFAULT 'Monthly',
      dailyRate REAL DEFAULT 0,
      hourlyRate REAL DEFAULT 0,
      riceAllowance REAL DEFAULT 0,
      transportAllowance REAL DEFAULT 0,
      mealAllowance REAL DEFAULT 0,
      otherAllowances REAL DEFAULT 0,
      allowancesNotes TEXT,
      sssNumber TEXT,
      philhealthNumber TEXT,
      pagibigNumber TEXT,
      tinNumber TEXT,
      bankName TEXT,
      bankAccountNumber TEXT,
      bankAccountName TEXT,
      emergencyContactName TEXT,
      emergencyContactPhone TEXT,
      emergencyContactRelation TEXT,
      birthDate TEXT,
      civilStatus TEXT,
      numberOfDependents INTEGER DEFAULT 0,
      permanentAddress TEXT,
      presentAddress TEXT,
      contactPhone TEXT,
      vacationLeaveBalance REAL DEFAULT 5,
      sickLeaveBalance REAL DEFAULT 5,
      notes TEXT,
      createdAt TEXT,
      updatedAt TEXT,
      json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS payroll_records (
      id TEXT PRIMARY KEY,
      employeeId TEXT NOT NULL,
      payPeriodStart TEXT NOT NULL,
      payPeriodEnd TEXT NOT NULL,
      payDate TEXT,
      month TEXT,
      basicPay REAL DEFAULT 0,
      overtimePay REAL DEFAULT 0,
      overtimeHours REAL DEFAULT 0,
      holidayPay REAL DEFAULT 0,
      nightDifferential REAL DEFAULT 0,
      riceAllowance REAL DEFAULT 0,
      transportAllowance REAL DEFAULT 0,
      mealAllowance REAL DEFAULT 0,
      otherAllowances REAL DEFAULT 0,
      adjustments REAL DEFAULT 0,
      adjustmentNotes TEXT,
      grossPay REAL DEFAULT 0,
      sssContribution REAL DEFAULT 0,
      sssEmployerShare REAL DEFAULT 0,
      philhealthContribution REAL DEFAULT 0,
      philhealthEmployerShare REAL DEFAULT 0,
      pagibigContribution REAL DEFAULT 0,
      pagibigEmployerShare REAL DEFAULT 0,
      withholdingTax REAL DEFAULT 0,
      sssLoan REAL DEFAULT 0,
      pagibigLoan REAL DEFAULT 0,
      otherDeductions REAL DEFAULT 0,
      otherDeductionNotes TEXT,
      totalDeductions REAL DEFAULT 0,
      netPay REAL DEFAULT 0,
      status TEXT DEFAULT 'Draft',
      approvedBy TEXT,
      approvedAt TEXT,
      paidVia TEXT,
      notes TEXT,
      computedBy TEXT,
      createdAt TEXT,
      updatedAt TEXT,
      json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS hr_documents (
      id TEXT PRIMARY KEY,
      employeeId TEXT NOT NULL,
      documentType TEXT NOT NULL,
      title TEXT,
      description TEXT,
      filePath TEXT,
      fileSize INTEGER,
      mimeType TEXT,
      forPeriod TEXT,
      generatedBy TEXT,
      isGenerated INTEGER DEFAULT 0,
      createdAt TEXT,
      json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS leave_records (
      id TEXT PRIMARY KEY,
      employeeId TEXT NOT NULL,
      leaveType TEXT NOT NULL,
      startDate TEXT NOT NULL,
      endDate TEXT NOT NULL,
      totalDays REAL DEFAULT 1,
      reason TEXT,
      status TEXT DEFAULT 'Pending',
      approvedBy TEXT,
      approvedAt TEXT,
      notes TEXT,
      createdAt TEXT,
      json TEXT NOT NULL
    );
  `);

  let persistTimer = null;
  let isClosed = false;

  function flushToDisk() {
    if (isClosed) return;
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    if (!dbPath || dbPath === ':memory:') return;
    try {
      const data = sqlite.export();
      const buf = Buffer.from(data);
      const tmp = dbPath + '.tmp';

      // Ensure directory exists
      try { fs.mkdirSync(path.dirname(dbPath), { recursive: true }); } catch (_) {}

      // Write to temp file then rename atomically
      try {
        fs.writeFileSync(tmp, buf);
        fs.renameSync(tmp, dbPath);
      } catch (renameErr) {
        // Fallback for Windows file locking issues during rename
        fs.writeFileSync(dbPath, buf);
        try { fs.unlinkSync(tmp); } catch (_) {}
      }

      // Verify file was written and is not empty
      try {
        const st = fs.statSync(dbPath);
        if (st.size === 0 && buf.length > 0) {
          console.error('[sqliteDb sql.js] CRITICAL: DB file is 0 bytes after flush! Rewriting directly...');
          fs.writeFileSync(dbPath, buf);
        }
      } catch (statErr) {
        console.error('[sqliteDb sql.js] Flush verification warning:', statErr.message);
      }
    } catch (err) {
      console.error('[sqliteDb sql.js] CRITICAL: Failed to flush database to disk:', err && err.message ? err.message : err);
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

  // Periodic flush every 30s as safety net to guarantee in-memory data reaches disk
  const periodicFlushTimer = setInterval(() => {
    try { flushToDisk(); } catch (e) {}
  }, 30000);
  if (periodicFlushTimer && typeof periodicFlushTimer.unref === 'function') {
    periodicFlushTimer.unref();
  }

  try {
    process.on('beforeExit', () => { flushToDisk(); });
    process.on('exit', () => { flushToDisk(); });
    process.on('SIGTERM', () => { flushToDisk(); });
    process.on('SIGINT', () => { flushToDisk(); });
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

    // sql.js Equipment Management Methods
    getEquipment() {
      try {
        return parseRows(queryAll('SELECT json FROM equipment ORDER BY name ASC'));
      } catch (e) { return []; }
    },
    getEquipmentById(id) {
      if (!id) return null;
      try {
        const rows = queryAll('SELECT json FROM equipment WHERE id = ?', [id]);
        return rows.length ? JSON.parse(rows[0].json) : null;
      } catch (e) { return null; }
    },
    getEquipmentByCode(code) {
      if (!code) return null;
      try {
        const rows = queryAll('SELECT json FROM equipment WHERE equipmentCode = ?', [code]);
        return rows.length ? JSON.parse(rows[0].json) : null;
      } catch (e) { return null; }
    },
    getEquipmentByDepartment(dept) {
      if (!dept) return [];
      try {
        return parseRows(queryAll('SELECT json FROM equipment WHERE department = ? ORDER BY name ASC', [dept]));
      } catch (e) { return []; }
    },
    getEquipmentByCategory(cat) {
      if (!cat) return [];
      try {
        return parseRows(queryAll('SELECT json FROM equipment WHERE category = ? ORDER BY name ASC', [cat]));
      } catch (e) { return []; }
    },
    saveEquipment(item) {
      if (!item || !item.id) return null;
      try {
        const code = item.equipmentCode || item.code;
        if (code) {
          const existing = this.getEquipmentByCode(code);
          if (existing && existing.id && existing.id !== item.id) {
            item.id = existing.id;
          }
        }
        const data = {
          id: String(item.id),
          equipmentCode: item.equipmentCode || item.code || '',
          name: item.name || '',
          category: item.category || '',
          department: item.department || '',
          serialNumber: item.serialNumber || '',
          status: item.status || 'OPERATIONAL',
          nextCalibrationDate: item.nextCalibrationDate || null,
          nextPmDate: item.nextPmDate || null,
          createdAt: item.createdAt || new Date().toISOString(),
          updatedAt: item.updatedAt || new Date().toISOString(),
          json: JSON.stringify(item)
        };
        queryRun(
          'INSERT OR REPLACE INTO equipment (id, equipmentCode, name, category, department, serialNumber, status, nextCalibrationDate, nextPmDate, createdAt, updatedAt, json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [data.id, data.equipmentCode, data.name, data.category, data.department, data.serialNumber, data.status, data.nextCalibrationDate, data.nextPmDate, data.createdAt, data.updatedAt, data.json]
        );
        persist();
        return item;
      } catch (e) {
        console.error('[sqliteDb sql.js] saveEquipment error:', e.message);
        return null;
      }
    },
    deleteEquipment(id) {
      try {
        queryRun('DELETE FROM neqas_records WHERE equipmentId = ?', [id]);
        queryRun('DELETE FROM qc_entries WHERE equipmentId = ?', [id]);
        queryRun('DELETE FROM qc_controls WHERE equipmentId = ?', [id]);
        queryRun('DELETE FROM equipment_logs WHERE equipmentId = ?', [id]);
        queryRun('DELETE FROM equipment WHERE id = ?', [id]);
        persist();
        return true;
      } catch (e) { return false; }
    },

    getEquipmentLogs(equipmentId) {
      try {
        if (equipmentId) {
          return parseRows(queryAll('SELECT json FROM equipment_logs WHERE equipmentId = ? ORDER BY serviceDate DESC, createdAt DESC', [equipmentId]));
        }
        return parseRows(queryAll('SELECT json FROM equipment_logs ORDER BY serviceDate DESC, createdAt DESC'));
      } catch (e) { return []; }
    },
    getEquipmentLogById(id) {
      if (!id) return null;
      try {
        const rows = queryAll('SELECT json FROM equipment_logs WHERE id = ?', [id]);
        return rows.length ? JSON.parse(rows[0].json) : null;
      } catch (e) { return null; }
    },
    saveEquipmentLog(log) {
      if (!log || !log.id) return null;
      try {
        const data = {
          id: String(log.id),
          equipmentId: String(log.equipmentId || ''),
          logType: log.logType || 'CALIBRATION',
          serviceDate: log.serviceDate || new Date().toISOString(),
          resultStatus: log.resultStatus || 'PASS',
          certificateNumber: log.certificateNumber || '',
          createdAt: log.createdAt || new Date().toISOString(),
          json: JSON.stringify(log)
        };
        queryRun(
          'INSERT OR REPLACE INTO equipment_logs (id, equipmentId, logType, serviceDate, resultStatus, certificateNumber, createdAt, json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [data.id, data.equipmentId, data.logType, data.serviceDate, data.resultStatus, data.certificateNumber, data.createdAt, data.json]
        );
        persist();
        return log;
      } catch (e) {
        console.error('[sqliteDb sql.js] saveEquipmentLog error:', e.message);
        return null;
      }
    },
    deleteEquipmentLog(id) {
      try {
        queryRun('DELETE FROM equipment_logs WHERE id = ?', [id]);
        persist();
        return true;
      } catch (e) { return false; }
    },

    getQcControls(equipmentId) {
      try {
        if (equipmentId) {
          return parseRows(queryAll('SELECT json FROM qc_controls WHERE equipmentId = ? ORDER BY createdAt DESC', [equipmentId]));
        }
        return parseRows(queryAll('SELECT json FROM qc_controls ORDER BY createdAt DESC'));
      } catch (e) { return []; }
    },
    getQcControlById(id) {
      if (!id) return null;
      try {
        const rows = queryAll('SELECT json FROM qc_controls WHERE id = ?', [id]);
        return rows.length ? JSON.parse(rows[0].json) : null;
      } catch (e) { return null; }
    },
    saveQcControl(ctrl) {
      if (!ctrl || !ctrl.id) return null;
      try {
        const data = {
          id: String(ctrl.id),
          equipmentId: String(ctrl.equipmentId || ''),
          controlName: ctrl.controlName || '',
          lotNumber: ctrl.lotNumber || '',
          level: ctrl.level || 'Level 1',
          expirationDate: ctrl.expirationDate || null,
          isActive: ctrl.isActive !== false ? 1 : 0,
          createdAt: ctrl.createdAt || new Date().toISOString(),
          json: JSON.stringify(ctrl)
        };
        queryRun(
          'INSERT OR REPLACE INTO qc_controls (id, equipmentId, controlName, lotNumber, level, expirationDate, isActive, createdAt, json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [data.id, data.equipmentId, data.controlName, data.lotNumber, data.level, data.expirationDate, data.isActive, data.createdAt, data.json]
        );
        persist();
        return ctrl;
      } catch (e) {
        console.error('[sqliteDb sql.js] saveQcControl error:', e.message);
        return null;
      }
    },
    deleteQcControl(id) {
      try {
        queryRun('DELETE FROM qc_controls WHERE id = ?', [id]);
        persist();
        return true;
      } catch (e) { return false; }
    },

    getQcEntries(equipmentId, analyteCode) {
      try {
        if (equipmentId && analyteCode) {
          return parseRows(queryAll('SELECT json FROM qc_entries WHERE equipmentId = ? AND analyteCode = ? ORDER BY runDate ASC, createdAt ASC', [equipmentId, analyteCode]));
        } else if (equipmentId) {
          return parseRows(queryAll('SELECT json FROM qc_entries WHERE equipmentId = ? ORDER BY runDate ASC, createdAt ASC', [equipmentId]));
        }
        return parseRows(queryAll('SELECT json FROM qc_entries ORDER BY runDate DESC, createdAt DESC'));
      } catch (e) { return []; }
    },
    getQcEntryById(id) {
      if (!id) return null;
      try {
        const rows = queryAll('SELECT json FROM qc_entries WHERE id = ?', [id]);
        return rows.length ? JSON.parse(rows[0].json) : null;
      } catch (e) { return null; }
    },
    saveQcEntry(entry) {
      if (!entry || !entry.id) return null;
      try {
        const data = {
          id: String(entry.id),
          equipmentId: String(entry.equipmentId || ''),
          controlId: String(entry.controlId || ''),
          analyteCode: entry.analyteCode || '',
          controlLot: entry.controlLot || '',
          runDate: entry.runDate || new Date().toISOString(),
          measuredValue: Number(entry.measuredValue) || 0,
          zScore: Number.isFinite(Number(entry.zScore)) ? Number(entry.zScore) : 0,
          status: entry.status || 'ACCEPTED',
          createdAt: entry.createdAt || new Date().toISOString(),
          json: JSON.stringify(entry)
        };
        queryRun(
          'INSERT OR REPLACE INTO qc_entries (id, equipmentId, controlId, analyteCode, controlLot, runDate, measuredValue, zScore, status, createdAt, json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [data.id, data.equipmentId, data.controlId, data.analyteCode, data.controlLot, data.runDate, data.measuredValue, data.zScore, data.status, data.createdAt, data.json]
        );
        persist();
        return entry;
      } catch (e) {
        console.error('[sqliteDb sql.js] saveQcEntry error:', e.message);
        return null;
      }
    },
    deleteQcEntry(id) {
      try {
        queryRun('DELETE FROM qc_entries WHERE id = ?', [id]);
        persist();
        return true;
      } catch (e) { return false; }
    },

    getNeqasRecords(equipmentId) {
      try {
        if (equipmentId) {
          return parseRows(queryAll('SELECT json FROM neqas_records WHERE equipmentId = ? ORDER BY cycleYear DESC, createdAt DESC', [equipmentId]));
        }
        return parseRows(queryAll('SELECT json FROM neqas_records ORDER BY cycleYear DESC, createdAt DESC'));
      } catch (e) { return []; }
    },
    getNeqasRecordById(id) {
      if (!id) return null;
      try {
        const rows = queryAll('SELECT json FROM neqas_records WHERE id = ?', [id]);
        return rows.length ? JSON.parse(rows[0].json) : null;
      } catch (e) { return null; }
    },
    saveNeqasRecord(rec) {
      if (!rec || !rec.id) return null;
      try {
        const data = {
          id: String(rec.id),
          equipmentId: String(rec.equipmentId || ''),
          cycleYear: rec.cycleYear || String(new Date().getFullYear()),
          eventNumber: rec.eventNumber || '1',
          nrlName: rec.nrlName || 'LCP',
          sampleId: rec.sampleId || '',
          analyteCode: rec.analyteCode || '',
          status: rec.status || 'PENDING',
          createdAt: rec.createdAt || new Date().toISOString(),
          json: JSON.stringify(rec)
        };
        queryRun(
          'INSERT OR REPLACE INTO neqas_records (id, equipmentId, cycleYear, eventNumber, nrlName, sampleId, analyteCode, status, createdAt, json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [data.id, data.equipmentId, data.cycleYear, data.eventNumber, data.nrlName, data.sampleId, data.analyteCode, data.status, data.createdAt, data.json]
        );
        persist();
        return rec;
      } catch (e) {
        console.error('[sqliteDb sql.js] saveNeqasRecord error:', e.message);
        return null;
      }
    },
    deleteNeqasRecord(id) {
      try {
        queryRun('DELETE FROM neqas_records WHERE id = ?', [id]);
        persist();
        return true;
      } catch (e) { return false; }
    },
    getCustomNrls() {
      try {
        const rows = queryAll("SELECT json FROM settings WHERE key = 'custom_nrls'");
        return rows[0] && rows[0].json ? JSON.parse(rows[0].json) : [];
      } catch (e) {
        return [];
      }
    },
    saveCustomNrls(list) {
      try {
        const json = JSON.stringify(list || []);
        queryRun("INSERT OR REPLACE INTO settings (key, json) VALUES ('custom_nrls', ?)", [json]);
        persist();
        return true;
      } catch (e) {
        return false;
      }
    },

    // Consultations
    getConsultations() {
      try {
        return parseRows(queryAll('SELECT json FROM consultations ORDER BY consultationDate DESC, createdAt DESC'));
      } catch (e) { return []; }
    },
    getConsultationById(id) {
      if (!id) return null;
      try {
        const rows = queryAll('SELECT json FROM consultations WHERE id = ?', [id]);
        return rows.length ? JSON.parse(rows[0].json) : null;
      } catch (e) { return null; }
    },
    getConsultationByTestId(testId) {
      if (!testId) return null;
      try {
        const rows = queryAll('SELECT json FROM consultations WHERE testId = ? ORDER BY createdAt DESC LIMIT 1', [testId]);
        return rows.length ? JSON.parse(rows[0].json) : null;
      } catch (e) { return null; }
    },
    getConsultationsByPatientId(patientId) {
      if (!patientId) return [];
      try {
        return parseRows(queryAll('SELECT json FROM consultations WHERE patientId = ? ORDER BY consultationDate DESC, createdAt DESC', [patientId]));
      } catch (e) { return []; }
    },
    saveConsultation(c) {
      if (!c || !c.id) return null;
      try {
        const now = new Date().toISOString();
        const data = {
          id: String(c.id),
          patientId: safeStr(c.patientId || ''),
          testId: safeStr(c.testId || ''),
          doctorId: safeStr(c.doctorId || ''),
          doctorName: safeStr(c.doctorName || ''),
          doctorLicenseNumber: safeStr(c.doctorLicenseNumber || ''),
          visitType: safeStr(c.visitType || 'New'),
          consultationDate: safeStr(c.consultationDate || now),
          status: safeStr(c.status || 'In Progress'),
          chiefComplaint: safeStr(c.chiefComplaint || ''),
          primaryDiagnosis: safeStr(c.primaryDiagnosis || ''),
          createdAt: safeStr(c.createdAt || now),
          updatedAt: safeStr(c.updatedAt || now),
          completedAt: safeStr(c.completedAt || null),
          json: JSON.stringify(c)
        };
        queryRun(
          'INSERT OR REPLACE INTO consultations (id, patientId, testId, doctorId, doctorName, doctorLicenseNumber, visitType, consultationDate, status, chiefComplaint, primaryDiagnosis, createdAt, updatedAt, completedAt, json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [data.id, data.patientId, data.testId, data.doctorId, data.doctorName, data.doctorLicenseNumber, data.visitType, data.consultationDate, data.status, data.chiefComplaint, data.primaryDiagnosis, data.createdAt, data.updatedAt, data.completedAt, data.json]
        );
        persist();
        return c;
      } catch (e) {
        console.error('[sqliteDb sql.js] saveConsultation error:', e.message);
        return null;
      }
    },
    deleteConsultation(id) {
      try {
        queryRun('DELETE FROM consultations WHERE id = ?', [id]);
        persist();
        return true;
      } catch (e) { return false; }
    },

    // Expenses (sql.js)
    getExpenses(month, category) {
      try {
        let rows;
        if (month) rows = queryAll('SELECT json FROM expenses WHERE month = ? ORDER BY expenseDate DESC', [month]);
        else if (category) rows = queryAll('SELECT json FROM expenses WHERE category = ? ORDER BY expenseDate DESC', [category]);
        else rows = queryAll('SELECT json FROM expenses ORDER BY expenseDate DESC, createdAt DESC');
        return parseRows(rows);
      } catch (e) { return []; }
    },
    getExpenseById(id) {
      if (!id) return null;
      try {
        const rows = queryAll('SELECT json FROM expenses WHERE id = ?', [id]);
        return rows[0] && rows[0].json ? JSON.parse(rows[0].json) : null;
      } catch (e) { return null; }
    },
    saveExpense(exp) {
      if (!exp || !exp.id) return null;
      try {
        const now = new Date().toISOString();
        queryRun(
          'INSERT OR REPLACE INTO expenses (id, category, subcategory, description, amount, currency, vendorSupplier, referenceId, referenceType, expenseDate, month, receiptUrl, notes, recordedBy, createdAt, updatedAt, json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [String(exp.id), safeStr(exp.category || 'misc'), safeStr(exp.subcategory || ''), safeStr(exp.description || ''), Number(exp.amount) || 0, safeStr(exp.currency || 'PHP'), safeStr(exp.vendorSupplier || ''), safeStr(exp.referenceId || null), safeStr(exp.referenceType || 'manual'), safeStr(exp.expenseDate || now), safeStr(exp.month || (exp.expenseDate ? exp.expenseDate.slice(0, 7) : now.slice(0, 7))), safeStr(exp.receiptUrl || null), safeStr(exp.notes || ''), safeStr(exp.recordedBy || 'System'), safeStr(exp.createdAt || now), safeStr(exp.updatedAt || now), JSON.stringify(exp)]
        );
        persist();
        return exp;
      } catch (e) { return null; }
    },
    deleteExpense(id) {
      try {
        queryRun('DELETE FROM expenses WHERE id = ?', [id]);
        persist();
        return true;
      } catch (e) { return false; }
    },

    // Revenue Entries (sql.js)
    getRevenueEntries(month) {
      try {
        const rows = month ? queryAll('SELECT json FROM revenue_entries WHERE month = ? ORDER BY revenueDate DESC', [month]) : queryAll('SELECT json FROM revenue_entries ORDER BY revenueDate DESC, createdAt DESC');
        return parseRows(rows);
      } catch (e) { return []; }
    },
    getRevenueEntryById(id) {
      if (!id) return null;
      try {
        const rows = queryAll('SELECT json FROM revenue_entries WHERE id = ?', [id]);
        return rows[0] && rows[0].json ? JSON.parse(rows[0].json) : null;
      } catch (e) { return null; }
    },
    saveRevenueEntry(rev) {
      if (!rev || !rev.id) return null;
      try {
        const now = new Date().toISOString();
        queryRun(
          'INSERT OR REPLACE INTO revenue_entries (id, patientId, testId, paymentMethod, clinicalAmount, xrayAmount, totalAmount, discountAmount, discountType, revenueDate, month, notes, recordedBy, createdAt, json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [String(rev.id), safeStr(rev.patientId || ''), safeStr(rev.testId || ''), safeStr(rev.paymentMethod || 'Cash'), Number(rev.clinicalAmount) || 0, Number(rev.xrayAmount) || 0, Number(rev.totalAmount) || 0, Number(rev.discountAmount) || 0, safeStr(rev.discountType || 'None'), safeStr(rev.revenueDate || now), safeStr(rev.month || (rev.revenueDate ? rev.revenueDate.slice(0, 7) : now.slice(0, 7))), safeStr(rev.notes || ''), safeStr(rev.recordedBy || 'System'), safeStr(rev.createdAt || now), JSON.stringify(rev)]
        );
        persist();
        return rev;
      } catch (e) { return null; }
    },
    deleteRevenueEntry(id) {
      try {
        queryRun('DELETE FROM revenue_entries WHERE id = ?', [id]);
        persist();
        return true;
      } catch (e) { return false; }
    },

    // Cost Per Test (sql.js)
    getCostPerTests() {
      try {
        const rows = queryAll('SELECT json FROM cost_per_test ORDER BY testType ASC');
        return parseRows(rows);
      } catch (e) { return []; }
    },
    getCostPerTestById(id) {
      if (!id) return null;
      try {
        const rows = queryAll('SELECT json FROM cost_per_test WHERE id = ?', [id]);
        return rows[0] && rows[0].json ? JSON.parse(rows[0].json) : null;
      } catch (e) { return null; }
    },
    getCostPerTestByType(type) {
      if (!type) return null;
      try {
        const rows = queryAll('SELECT json FROM cost_per_test WHERE testType = ?', [type]);
        return rows[0] && rows[0].json ? JSON.parse(rows[0].json) : null;
      } catch (e) { return null; }
    },
    saveCostPerTest(cpt) {
      if (!cpt || !cpt.id) return null;
      try {
        const now = new Date().toISOString();
        queryRun(
          'INSERT OR REPLACE INTO cost_per_test (id, testType, inventoryItems, estimatedCost, notes, updatedBy, createdAt, updatedAt, json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [String(cpt.id), safeStr(cpt.testType || ''), typeof cpt.inventoryItems === 'string' ? cpt.inventoryItems : JSON.stringify(cpt.inventoryItems || []), Number(cpt.estimatedCost) || 0, safeStr(cpt.notes || ''), safeStr(cpt.updatedBy || 'System'), safeStr(cpt.createdAt || now), safeStr(cpt.updatedAt || now), JSON.stringify(cpt)]
        );
        persist();
        return cpt;
      } catch (e) { return null; }
    },
    deleteCostPerTest(id) {
      try {
        queryRun('DELETE FROM cost_per_test WHERE id = ?', [id]);
        persist();
        return true;
      } catch (e) { return false; }
    },

    // Employees (sql.js)
    getEmployees() {
      try {
        const rows = queryAll('SELECT json FROM employees ORDER BY createdAt DESC');
        return parseRows(rows);
      } catch (e) { return []; }
    },
    getEmployeeById(id) {
      if (!id) return null;
      try {
        const rows = queryAll('SELECT json FROM employees WHERE id = ?', [id]);
        return rows[0] && rows[0].json ? JSON.parse(rows[0].json) : null;
      } catch (e) { return null; }
    },
    getEmployeeByUserId(userId) {
      if (!userId) return null;
      try {
        const rows = queryAll('SELECT json FROM employees WHERE userId = ?', [userId]);
        return rows[0] && rows[0].json ? JSON.parse(rows[0].json) : null;
      } catch (e) { return null; }
    },
    getEmployeeByCode(code) {
      if (!code) return null;
      try {
        const rows = queryAll('SELECT json FROM employees WHERE employeeCode = ?', [code]);
        return rows[0] && rows[0].json ? JSON.parse(rows[0].json) : null;
      } catch (e) { return null; }
    },
    saveEmployee(emp) {
      if (!emp || !emp.id) return null;
      try {
        const now = new Date().toISOString();
        queryRun(
          'INSERT OR REPLACE INTO employees (id, userId, employeeCode, department, position, employmentType, dateHired, dateRegularized, dateResigned, resignationReason, employmentStatus, basicSalary, salaryFrequency, dailyRate, hourlyRate, riceAllowance, transportAllowance, mealAllowance, otherAllowances, allowancesNotes, sssNumber, philhealthNumber, pagibigNumber, tinNumber, bankName, bankAccountNumber, bankAccountName, emergencyContactName, emergencyContactPhone, emergencyContactRelation, birthDate, civilStatus, numberOfDependents, permanentAddress, presentAddress, contactPhone, vacationLeaveBalance, sickLeaveBalance, notes, createdAt, updatedAt, json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [String(emp.id), safeStr(emp.userId || ''), safeStr(emp.employeeCode || ''), safeStr(emp.department || ''), safeStr(emp.position || ''), safeStr(emp.employmentType || 'Regular'), safeStr(emp.dateHired || null), safeStr(emp.dateRegularized || null), safeStr(emp.dateResigned || null), safeStr(emp.resignationReason || null), safeStr(emp.employmentStatus || 'Active'), Number(emp.basicSalary) || 0, safeStr(emp.salaryFrequency || 'Monthly'), Number(emp.dailyRate) || 0, Number(emp.hourlyRate) || 0, Number(emp.riceAllowance) || 0, Number(emp.transportAllowance) || 0, Number(emp.mealAllowance) || 0, Number(emp.otherAllowances) || 0, safeStr(emp.allowancesNotes || ''), safeStr(emp.sssNumber || ''), safeStr(emp.philhealthNumber || ''), safeStr(emp.pagibigNumber || ''), safeStr(emp.tinNumber || ''), safeStr(emp.bankName || ''), safeStr(emp.bankAccountNumber || ''), safeStr(emp.bankAccountName || ''), safeStr(emp.emergencyContactName || ''), safeStr(emp.emergencyContactPhone || ''), safeStr(emp.emergencyContactRelation || ''), safeStr(emp.birthDate || null), safeStr(emp.civilStatus || 'Single'), parseInt(emp.numberOfDependents, 10) || 0, safeStr(emp.permanentAddress || ''), safeStr(emp.presentAddress || ''), safeStr(emp.contactPhone || ''), Number(emp.vacationLeaveBalance) || 5, Number(emp.sickLeaveBalance) || 5, safeStr(emp.notes || ''), safeStr(emp.createdAt || now), safeStr(emp.updatedAt || now), JSON.stringify(emp)]
        );
        persist();
        return emp;
      } catch (e) { return null; }
    },
    deleteEmployee(id) {
      try {
        queryRun('DELETE FROM employees WHERE id = ?', [id]);
        persist();
        return true;
      } catch (e) { return false; }
    },

    // Payroll Records (sql.js)
    getPayrollRecords(month, employeeId) {
      try {
        let rows;
        if (month) rows = queryAll('SELECT json FROM payroll_records WHERE month = ? ORDER BY payPeriodEnd DESC', [month]);
        else if (employeeId) rows = queryAll('SELECT json FROM payroll_records WHERE employeeId = ? ORDER BY payPeriodEnd DESC', [employeeId]);
        else rows = queryAll('SELECT json FROM payroll_records ORDER BY payPeriodEnd DESC, createdAt DESC');
        return parseRows(rows);
      } catch (e) { return []; }
    },
    getPayrollRecordById(id) {
      if (!id) return null;
      try {
        const rows = queryAll('SELECT json FROM payroll_records WHERE id = ?', [id]);
        return rows[0] && rows[0].json ? JSON.parse(rows[0].json) : null;
      } catch (e) { return null; }
    },
    getPayrollRecordsByEmployee(empId) {
      if (!empId) return [];
      try {
        const rows = queryAll('SELECT json FROM payroll_records WHERE employeeId = ? ORDER BY payPeriodEnd DESC', [empId]);
        return parseRows(rows);
      } catch (e) { return []; }
    },
    savePayrollRecord(p) {
      if (!p || !p.id) return null;
      try {
        const now = new Date().toISOString();
        queryRun(
          'INSERT OR REPLACE INTO payroll_records (id, employeeId, payPeriodStart, payPeriodEnd, payDate, month, basicPay, overtimePay, overtimeHours, holidayPay, nightDifferential, riceAllowance, transportAllowance, mealAllowance, otherAllowances, adjustments, adjustmentNotes, grossPay, sssContribution, sssEmployerShare, philhealthContribution, philhealthEmployerShare, pagibigContribution, pagibigEmployerShare, withholdingTax, sssLoan, pagibigLoan, otherDeductions, otherDeductionNotes, totalDeductions, netPay, status, approvedBy, approvedAt, paidVia, notes, computedBy, createdAt, updatedAt, json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [String(p.id), safeStr(p.employeeId || ''), safeStr(p.payPeriodStart || now), safeStr(p.payPeriodEnd || now), safeStr(p.payDate || null), safeStr(p.month || (p.payPeriodEnd ? p.payPeriodEnd.slice(0, 7) : now.slice(0, 7))), Number(p.basicPay) || 0, Number(p.overtimePay) || 0, Number(p.overtimeHours) || 0, Number(p.holidayPay) || 0, Number(p.nightDifferential) || 0, Number(p.riceAllowance) || 0, Number(p.transportAllowance) || 0, Number(p.mealAllowance) || 0, Number(p.otherAllowances) || 0, Number(p.adjustments) || 0, safeStr(p.adjustmentNotes || ''), Number(p.grossPay) || 0, Number(p.sssContribution) || 0, Number(p.sssEmployerShare) || 0, Number(p.philhealthContribution) || 0, Number(p.philhealthEmployerShare) || 0, Number(p.pagibigContribution) || 0, Number(p.pagibigEmployerShare) || 0, Number(p.withholdingTax) || 0, Number(p.sssLoan) || 0, Number(p.pagibigLoan) || 0, Number(p.otherDeductions) || 0, safeStr(p.otherDeductionNotes || ''), Number(p.totalDeductions) || 0, Number(p.netPay) || 0, safeStr(p.status || 'Draft'), safeStr(p.approvedBy || null), safeStr(p.approvedAt || null), safeStr(p.paidVia || 'Cash'), safeStr(p.notes || ''), safeStr(p.computedBy || 'System'), safeStr(p.createdAt || now), safeStr(p.updatedAt || now), JSON.stringify(p)]
        );
        persist();
        return p;
      } catch (e) { return null; }
    },
    deletePayrollRecord(id) {
      try {
        queryRun('DELETE FROM payroll_records WHERE id = ?', [id]);
        persist();
        return true;
      } catch (e) { return false; }
    },

    // HR Documents (sql.js)
    getHrDocuments(employeeId) {
      try {
        const rows = employeeId ? queryAll('SELECT json FROM hr_documents WHERE employeeId = ? ORDER BY createdAt DESC', [employeeId]) : queryAll('SELECT json FROM hr_documents ORDER BY createdAt DESC');
        return parseRows(rows);
      } catch (e) { return []; }
    },
    getHrDocumentById(id) {
      if (!id) return null;
      try {
        const rows = queryAll('SELECT json FROM hr_documents WHERE id = ?', [id]);
        return rows[0] && rows[0].json ? JSON.parse(rows[0].json) : null;
      } catch (e) { return null; }
    },
    saveHrDocument(doc) {
      if (!doc || !doc.id) return null;
      try {
        const now = new Date().toISOString();
        queryRun(
          'INSERT OR REPLACE INTO hr_documents (id, employeeId, documentType, title, description, filePath, fileSize, mimeType, forPeriod, generatedBy, isGenerated, createdAt, json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [String(doc.id), safeStr(doc.employeeId || ''), safeStr(doc.documentType || 'Other'), safeStr(doc.title || ''), safeStr(doc.description || ''), safeStr(doc.filePath || null), parseInt(doc.fileSize, 10) || 0, safeStr(doc.mimeType || ''), safeStr(doc.forPeriod || null), safeStr(doc.generatedBy || 'System'), doc.isGenerated ? 1 : 0, safeStr(doc.createdAt || now), JSON.stringify(doc)]
        );
        persist();
        return doc;
      } catch (e) { return null; }
    },
    deleteHrDocument(id) {
      try {
        queryRun('DELETE FROM hr_documents WHERE id = ?', [id]);
        persist();
        return true;
      } catch (e) { return false; }
    },

    // Leave Records (sql.js)
    getLeaveRecords(employeeId) {
      try {
        const rows = employeeId ? queryAll('SELECT json FROM leave_records WHERE employeeId = ? ORDER BY startDate DESC', [employeeId]) : queryAll('SELECT json FROM leave_records ORDER BY startDate DESC');
        return parseRows(rows);
      } catch (e) { return []; }
    },
    getLeaveRecordById(id) {
      if (!id) return null;
      try {
        const rows = queryAll('SELECT json FROM leave_records WHERE id = ?', [id]);
        return rows[0] && rows[0].json ? JSON.parse(rows[0].json) : null;
      } catch (e) { return null; }
    },
    saveLeaveRecord(lr) {
      if (!lr || !lr.id) return null;
      try {
        const now = new Date().toISOString();
        queryRun(
          'INSERT OR REPLACE INTO leave_records (id, employeeId, leaveType, startDate, endDate, totalDays, reason, status, approvedBy, approvedAt, notes, createdAt, json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [String(lr.id), safeStr(lr.employeeId || ''), safeStr(lr.leaveType || 'Vacation'), safeStr(lr.startDate || now), safeStr(lr.endDate || now), Number(lr.totalDays) || 1, safeStr(lr.reason || ''), safeStr(lr.status || 'Pending'), safeStr(lr.approvedBy || null), safeStr(lr.approvedAt || null), safeStr(lr.notes || ''), safeStr(lr.createdAt || now), JSON.stringify(lr)]
        );
        persist();
        return lr;
      } catch (e) { return null; }
    },
    deleteLeaveRecord(id) {
      try {
        queryRun('DELETE FROM leave_records WHERE id = ?', [id]);
        persist();
        return true;
      } catch (e) { return false; }
    },

    close() {
      if (isClosed) return;
      persist(true);
      isClosed = true;
      if (periodicFlushTimer) {
        clearInterval(periodicFlushTimer);
      }
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

    getEquipment() { return underlyingDb ? underlyingDb.getEquipment() : []; },
    getEquipmentById(id) { return underlyingDb ? underlyingDb.getEquipmentById(id) : null; },
    getEquipmentByCode(c) { return underlyingDb ? underlyingDb.getEquipmentByCode(c) : null; },
    getEquipmentByDepartment(d) { return underlyingDb ? underlyingDb.getEquipmentByDepartment(d) : []; },
    getEquipmentByCategory(c) { return underlyingDb ? underlyingDb.getEquipmentByCategory(c) : []; },
    saveEquipment(item) { if (underlyingDb) return underlyingDb.saveEquipment(item); else readyPromise.then(d => d.saveEquipment(item)); return item; },
    deleteEquipment(id) { if (underlyingDb) return underlyingDb.deleteEquipment(id); else readyPromise.then(d => d.deleteEquipment(id)); return true; },

    getEquipmentLogs(eqId) { return underlyingDb ? underlyingDb.getEquipmentLogs(eqId) : []; },
    getEquipmentLogById(id) { return underlyingDb ? underlyingDb.getEquipmentLogById(id) : null; },
    saveEquipmentLog(log) { if (underlyingDb) return underlyingDb.saveEquipmentLog(log); else readyPromise.then(d => d.saveEquipmentLog(log)); return log; },
    deleteEquipmentLog(id) { if (underlyingDb) return underlyingDb.deleteEquipmentLog(id); else readyPromise.then(d => d.deleteEquipmentLog(id)); return true; },

    getQcControls(eqId) { return underlyingDb ? underlyingDb.getQcControls(eqId) : []; },
    getQcControlById(id) { return underlyingDb ? underlyingDb.getQcControlById(id) : null; },
    saveQcControl(ctrl) { if (underlyingDb) return underlyingDb.saveQcControl(ctrl); else readyPromise.then(d => d.saveQcControl(ctrl)); return ctrl; },
    deleteQcControl(id) { if (underlyingDb) return underlyingDb.deleteQcControl(id); else readyPromise.then(d => d.deleteQcControl(id)); return true; },

    getQcEntries(eqId, analyte) { return underlyingDb ? underlyingDb.getQcEntries(eqId, analyte) : []; },
    getQcEntryById(id) { return underlyingDb ? underlyingDb.getQcEntryById(id) : null; },
    saveQcEntry(entry) { if (underlyingDb) return underlyingDb.saveQcEntry(entry); else readyPromise.then(d => d.saveQcEntry(entry)); return entry; },
    deleteQcEntry(id) { if (underlyingDb) return underlyingDb.deleteQcEntry(id); else readyPromise.then(d => d.deleteQcEntry(id)); return true; },

    getNeqasRecords(eqId) { return underlyingDb ? underlyingDb.getNeqasRecords(eqId) : []; },
    getNeqasRecordById(id) { return underlyingDb ? underlyingDb.getNeqasRecordById(id) : null; },
    saveNeqasRecord(rec) { if (underlyingDb) return underlyingDb.saveNeqasRecord(rec); else readyPromise.then(d => d.saveNeqasRecord(rec)); return rec; },
    deleteNeqasRecord(id) { if (underlyingDb) return underlyingDb.deleteNeqasRecord(id); else readyPromise.then(d => d.deleteNeqasRecord(id)); return true; },

    getConsultations() { return underlyingDb ? underlyingDb.getConsultations() : []; },
    getConsultationById(id) { return underlyingDb ? underlyingDb.getConsultationById(id) : null; },
    getConsultationByTestId(testId) { return underlyingDb ? underlyingDb.getConsultationByTestId(testId) : null; },
    getConsultationsByPatientId(patientId) { return underlyingDb ? underlyingDb.getConsultationsByPatientId(patientId) : []; },
    saveConsultation(c) { if (underlyingDb) return underlyingDb.saveConsultation(c); else readyPromise.then(d => d.saveConsultation(c)); return c; },
    deleteConsultation(id) { if (underlyingDb) return underlyingDb.deleteConsultation(id); else readyPromise.then(d => d.deleteConsultation(id)); return true; },

    // Proxy methods for Costing & HR
    getExpenses(m, c) { return underlyingDb ? underlyingDb.getExpenses(m, c) : []; },
    getExpenseById(id) { return underlyingDb ? underlyingDb.getExpenseById(id) : null; },
    saveExpense(e) { if (underlyingDb) return underlyingDb.saveExpense(e); else readyPromise.then(d => d.saveExpense(e)); return e; },
    deleteExpense(id) { if (underlyingDb) return underlyingDb.deleteExpense(id); else readyPromise.then(d => d.deleteExpense(id)); return true; },

    getRevenueEntries(m) { return underlyingDb ? underlyingDb.getRevenueEntries(m) : []; },
    getRevenueEntryById(id) { return underlyingDb ? underlyingDb.getRevenueEntryById(id) : null; },
    saveRevenueEntry(r) { if (underlyingDb) return underlyingDb.saveRevenueEntry(r); else readyPromise.then(d => d.saveRevenueEntry(r)); return r; },
    deleteRevenueEntry(id) { if (underlyingDb) return underlyingDb.deleteRevenueEntry(id); else readyPromise.then(d => d.deleteRevenueEntry(id)); return true; },

    getCostPerTests() { return underlyingDb ? underlyingDb.getCostPerTests() : []; },
    getCostPerTestById(id) { return underlyingDb ? underlyingDb.getCostPerTestById(id) : null; },
    getCostPerTestByType(t) { return underlyingDb ? underlyingDb.getCostPerTestByType(t) : null; },
    saveCostPerTest(c) { if (underlyingDb) return underlyingDb.saveCostPerTest(c); else readyPromise.then(d => d.saveCostPerTest(c)); return c; },
    deleteCostPerTest(id) { if (underlyingDb) return underlyingDb.deleteCostPerTest(id); else readyPromise.then(d => d.deleteCostPerTest(id)); return true; },

    getEmployees() { return underlyingDb ? underlyingDb.getEmployees() : []; },
    getEmployeeById(id) { return underlyingDb ? underlyingDb.getEmployeeById(id) : null; },
    getEmployeeByUserId(uid) { return underlyingDb ? underlyingDb.getEmployeeByUserId(uid) : null; },
    getEmployeeByCode(code) { return underlyingDb ? underlyingDb.getEmployeeByCode(code) : null; },
    saveEmployee(emp) { if (underlyingDb) return underlyingDb.saveEmployee(emp); else readyPromise.then(d => d.saveEmployee(emp)); return emp; },
    deleteEmployee(id) { if (underlyingDb) return underlyingDb.deleteEmployee(id); else readyPromise.then(d => d.deleteEmployee(id)); return true; },

    getPayrollRecords(m, e) { return underlyingDb ? underlyingDb.getPayrollRecords(m, e) : []; },
    getPayrollRecordById(id) { return underlyingDb ? underlyingDb.getPayrollRecordById(id) : null; },
    getPayrollRecordsByEmployee(e) { return underlyingDb ? underlyingDb.getPayrollRecordsByEmployee(e) : []; },
    savePayrollRecord(p) { if (underlyingDb) return underlyingDb.savePayrollRecord(p); else readyPromise.then(d => d.savePayrollRecord(p)); return p; },
    deletePayrollRecord(id) { if (underlyingDb) return underlyingDb.deletePayrollRecord(id); else readyPromise.then(d => d.deletePayrollRecord(id)); return true; },

    getHrDocuments(e) { return underlyingDb ? underlyingDb.getHrDocuments(e) : []; },
    getHrDocumentById(id) { return underlyingDb ? underlyingDb.getHrDocumentById(id) : null; },
    saveHrDocument(d) { if (underlyingDb) return underlyingDb.saveHrDocument(d); else readyPromise.then(db => db.saveHrDocument(d)); return d; },
    deleteHrDocument(id) { if (underlyingDb) return underlyingDb.deleteHrDocument(id); else readyPromise.then(db => db.deleteHrDocument(id)); return true; },

    getLeaveRecords(e) { return underlyingDb ? underlyingDb.getLeaveRecords(e) : []; },
    getLeaveRecordById(id) { return underlyingDb ? underlyingDb.getLeaveRecordById(id) : null; },
    saveLeaveRecord(l) { if (underlyingDb) return underlyingDb.saveLeaveRecord(l); else readyPromise.then(d => d.saveLeaveRecord(l)); return l; },
    deleteLeaveRecord(id) { if (underlyingDb) return underlyingDb.deleteLeaveRecord(id); else readyPromise.then(d => d.deleteLeaveRecord(id)); return true; },

    getDtrRecords(e, ym) { return underlyingDb ? underlyingDb.getDtrRecords(e, ym) : []; },
    getDtrRecordByDate(e, d) { return underlyingDb ? underlyingDb.getDtrRecordByDate(e, d) : null; },
    saveDtrRecord(d) { if (underlyingDb) return underlyingDb.saveDtrRecord(d); else readyPromise.then(db => db.saveDtrRecord(d)); return d; },
    deleteDtrRecord(id) { if (underlyingDb) return underlyingDb.deleteDtrRecord(id); else readyPromise.then(db => db.deleteDtrRecord(id)); return true; },

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
