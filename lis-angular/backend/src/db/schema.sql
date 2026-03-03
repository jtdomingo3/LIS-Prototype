-- LIS Angular - SQLite Schema
-- Migrated from file-based JSON to relational SQLite

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  email             TEXT UNIQUE NOT NULL,
  password          TEXT NOT NULL,
  role              TEXT NOT NULL DEFAULT 'Encoder',
  status            TEXT NOT NULL DEFAULT 'Active',
  license_number    TEXT,
  signature         TEXT,
  auto_signature_enabled  INTEGER NOT NULL DEFAULT 0,
  auto_signature_until    TEXT,
  permissions       TEXT NOT NULL DEFAULT '{}',   -- JSON
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  last_login        TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ============================================================
-- PATIENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS patients (
  id                TEXT PRIMARY KEY,
  patient_id        TEXT,
  patient_code      TEXT,
  first_name        TEXT NOT NULL,
  middle_name       TEXT,
  last_name         TEXT NOT NULL,
  date_of_birth     TEXT,
  age_manual        TEXT,
  gender            TEXT,
  phone             TEXT,
  email             TEXT,
  address           TEXT,
  physician         TEXT,
  company           TEXT,
  philhealth_consent  INTEGER NOT NULL DEFAULT 0,
  philhealth_id       TEXT,
  required_areas    TEXT NOT NULL DEFAULT '[]',    -- JSON array
  requested_tests   TEXT NOT NULL DEFAULT '[]',    -- JSON array
  payment_history   TEXT NOT NULL DEFAULT '[]',    -- JSON array
  created_by        TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_patients_patient_id ON patients(patient_id);
CREATE INDEX IF NOT EXISTS idx_patients_patient_code ON patients(patient_code);
CREATE INDEX IF NOT EXISTS idx_patients_last_name ON patients(last_name);
CREATE INDEX IF NOT EXISTS idx_patients_company ON patients(company);
CREATE INDEX IF NOT EXISTS idx_patients_created_at ON patients(created_at);

-- ============================================================
-- TESTS
-- ============================================================
CREATE TABLE IF NOT EXISTS tests (
  id                  TEXT PRIMARY KEY,
  test_id             TEXT,
  patient_id          TEXT NOT NULL,
  test_type           TEXT NOT NULL,
  test_date           TEXT,
  status              TEXT NOT NULL DEFAULT 'Pending',
  specimen_numbers    TEXT NOT NULL DEFAULT '{}',   -- JSON object
  assigned_doctor_id  TEXT,
  assigned_doctor_name TEXT,
  results             TEXT NOT NULL DEFAULT '{}',   -- JSON blob
  notes               TEXT,
  priority            TEXT NOT NULL DEFAULT 'Normal',
  requested_by        TEXT,
  performed_by        TEXT,
  completed_at        TEXT,
  requested_tests     TEXT NOT NULL DEFAULT '[]',   -- JSON array
  awaiting_only       INTEGER NOT NULL DEFAULT 0,
  status_history      TEXT NOT NULL DEFAULT '[]',   -- JSON array
  payment_history      TEXT NOT NULL DEFAULT '{}',   -- JSON object for payments
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tests_test_id ON tests(test_id);
CREATE INDEX IF NOT EXISTS idx_tests_patient_id ON tests(patient_id);
CREATE INDEX IF NOT EXISTS idx_tests_status ON tests(status);
CREATE INDEX IF NOT EXISTS idx_tests_test_type ON tests(test_type);
CREATE INDEX IF NOT EXISTS idx_tests_test_date ON tests(test_date);
CREATE INDEX IF NOT EXISTS idx_tests_created_at ON tests(created_at);

-- ============================================================
-- TEMPLATES
-- ============================================================
CREATE TABLE IF NOT EXISTS templates (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  test_type     TEXT,
  fields        TEXT NOT NULL DEFAULT '[]',       -- JSON array
  footer_notes  TEXT,
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_by    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_templates_test_type ON templates(test_type);

-- ============================================================
-- COUNTERS (for sequential test IDs like BC0000001)
-- ============================================================
CREATE TABLE IF NOT EXISTS counters (
  key           TEXT PRIMARY KEY,
  value         INTEGER NOT NULL DEFAULT 0
);

-- ============================================================
-- SETTINGS (key-value store for app config)
-- ============================================================
CREATE TABLE IF NOT EXISTS settings (
  key           TEXT PRIMARY KEY,
  value         TEXT
);
