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
  last_login        TEXT,
  designation       TEXT
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

-- ============================================================
-- CLINICAL CONSULTATIONS (SOAP, PhilPEN & Doctor Visits)
-- ============================================================
CREATE TABLE IF NOT EXISTS consultations (
  id                    TEXT PRIMARY KEY,
  patient_id            TEXT NOT NULL,
  test_id               TEXT,
  doctor_id             TEXT,
  doctor_name           TEXT,
  doctor_license_number TEXT,
  doctor_designation    TEXT,
  visit_type            TEXT DEFAULT 'New',
  consultation_date     TEXT NOT NULL DEFAULT (datetime('now')),
  status                TEXT DEFAULT 'In Progress',
  chief_complaint       TEXT,
  history_of_present_illness TEXT,
  past_medical_history  TEXT,
  current_medications   TEXT,
  allergies             TEXT,
  review_of_systems     TEXT,
  smoking               TEXT NOT NULL DEFAULT '{}',
  alcohol               TEXT NOT NULL DEFAULT '{}',
  family_history        TEXT NOT NULL DEFAULT '{}',
  social_history        TEXT NOT NULL DEFAULT '{}',
  vital_signs           TEXT NOT NULL DEFAULT '{}',
  physical_exam_findings TEXT,
  primary_diagnosis     TEXT,
  differential_diagnosis TEXT NOT NULL DEFAULT '[]',
  suspected_pathology   TEXT,
  clinical_impression   TEXT,
  treatment_plan        TEXT,
  prescriptions         TEXT NOT NULL DEFAULT '[]',
  lab_request_tests     TEXT NOT NULL DEFAULT '[]',
  referrals             TEXT,
  follow_up_date        TEXT,
  follow_up_notes       TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at          TEXT,
  FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
  FOREIGN KEY (test_id) REFERENCES tests(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_consultations_patient_id ON consultations(patient_id);
CREATE INDEX IF NOT EXISTS idx_consultations_test_id ON consultations(test_id);
CREATE INDEX IF NOT EXISTS idx_consultations_status ON consultations(status);
CREATE INDEX IF NOT EXISTS idx_consultations_date ON consultations(consultation_date);

-- ============================================================
-- INVENTORY & REAGENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS inventory (
  id                    TEXT PRIMARY KEY,
  sku                   TEXT UNIQUE NOT NULL,
  name                  TEXT NOT NULL,
  description           TEXT,
  category              TEXT NOT NULL DEFAULT 'Reagents',
  item_mode             TEXT NOT NULL DEFAULT 'reagent',
  unit                  TEXT NOT NULL DEFAULT 'tests',
  package_size          TEXT,
  min_threshold         INTEGER NOT NULL DEFAULT 5,
  critical_threshold    INTEGER NOT NULL DEFAULT 2,
  max_threshold         INTEGER,
  supplier              TEXT,
  supplier_part_number  TEXT,
  manufacturer          TEXT,
  cost                  REAL NOT NULL DEFAULT 0,
  storage_temp          TEXT,
  location              TEXT,
  area                  TEXT NOT NULL DEFAULT 'General Laboratory',
  requires_refrigeration INTEGER NOT NULL DEFAULT 0,
  hazard_class          TEXT DEFAULT 'Non-Hazardous',
  msds_url              TEXT,
  open_vial_stability_days INTEGER,
  barcode               TEXT,
  target_roles          TEXT NOT NULL DEFAULT '[]',
  is_active             INTEGER NOT NULL DEFAULT 1,
  notes                 TEXT,
  created_by            TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_inventory_sku ON inventory(sku);
CREATE INDEX IF NOT EXISTS idx_inventory_category ON inventory(category);
CREATE INDEX IF NOT EXISTS idx_inventory_area ON inventory(area);

CREATE TABLE IF NOT EXISTS inventory_batches (
  id                    TEXT PRIMARY KEY,
  inventory_id          TEXT NOT NULL,
  lot_number            TEXT NOT NULL,
  initial_quantity      REAL NOT NULL DEFAULT 0,
  current_quantity      REAL NOT NULL DEFAULT 0,
  received_date         TEXT,
  expiration_date       TEXT,
  opened_date           TEXT,
  opened_by             TEXT,
  open_vial_expiry_date TEXT,
  qc_status             TEXT NOT NULL DEFAULT 'PASSED',
  qc_verified_by        TEXT,
  qc_verified_date      TEXT,
  is_active             INTEGER NOT NULL DEFAULT 1,
  notes                 TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_inv_batches_inventory ON inventory_batches(inventory_id);
CREATE INDEX IF NOT EXISTS idx_inv_batches_lot ON inventory_batches(lot_number);
CREATE INDEX IF NOT EXISTS idx_inv_batches_expiry ON inventory_batches(expiration_date);

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id                    TEXT PRIMARY KEY,
  inventory_id          TEXT NOT NULL,
  batch_id              TEXT,
  test_id               TEXT,
  transaction_type      TEXT NOT NULL,
  quantity              REAL NOT NULL,
  remaining_quantity    REAL,
  reference             TEXT,
  notes                 TEXT,
  performed_by          TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (inventory_id) REFERENCES inventory(id) ON DELETE CASCADE,
  FOREIGN KEY (batch_id) REFERENCES inventory_batches(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_inv_trans_inventory ON inventory_transactions(inventory_id);
CREATE INDEX IF NOT EXISTS idx_inv_trans_batch ON inventory_transactions(batch_id);
CREATE INDEX IF NOT EXISTS idx_inv_trans_type ON inventory_transactions(transaction_type);

-- ============================================================
-- EQUIPMENT, QUALITY CONTROL & NEQAS
-- ============================================================
CREATE TABLE IF NOT EXISTS equipment (
  id                    TEXT PRIMARY KEY,
  equipment_code        TEXT UNIQUE NOT NULL,
  name                  TEXT NOT NULL,
  category              TEXT NOT NULL DEFAULT 'General Equipment',
  department            TEXT NOT NULL DEFAULT 'General Laboratory',
  manufacturer          TEXT,
  model_number          TEXT,
  serial_number         TEXT,
  location              TEXT,
  status                TEXT NOT NULL DEFAULT 'OPERATIONAL',
  criticality           TEXT NOT NULL DEFAULT 'High',
  acquisition_date      TEXT,
  installation_date     TEXT,
  warranty_expiry_date  TEXT,
  supplier_vendor       TEXT,
  service_engineer      TEXT,
  service_contact       TEXT,
  calibration_cycle_days INTEGER NOT NULL DEFAULT 365,
  last_calibration_date TEXT,
  next_calibration_date TEXT,
  pm_cycle_days         INTEGER NOT NULL DEFAULT 180,
  last_pm_date          TEXT,
  next_pm_date          TEXT,
  radiation_safety_details TEXT NOT NULL DEFAULT '{}',
  documents             TEXT NOT NULL DEFAULT '[]',
  notes                 TEXT,
  created_by            TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_equipment_code ON equipment(equipment_code);
CREATE INDEX IF NOT EXISTS idx_equipment_category ON equipment(category);
CREATE INDEX IF NOT EXISTS idx_equipment_department ON equipment(department);
CREATE INDEX IF NOT EXISTS idx_equipment_status ON equipment(status);

CREATE TABLE IF NOT EXISTS equipment_logs (
  id                    TEXT PRIMARY KEY,
  equipment_id          TEXT NOT NULL,
  log_type              TEXT NOT NULL,
  service_date          TEXT NOT NULL,
  next_service_date     TEXT,
  performed_by          TEXT,
  service_provider      TEXT,
  certificate_number    TEXT,
  result_status         TEXT NOT NULL DEFAULT 'PASSED',
  findings              TEXT,
  actions_taken         TEXT,
  cost                  REAL,
  documents             TEXT NOT NULL DEFAULT '[]',
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_eq_logs_equipment ON equipment_logs(equipment_id);

CREATE TABLE IF NOT EXISTS qc_controls (
  id                    TEXT PRIMARY KEY,
  equipment_id          TEXT,
  control_name          TEXT NOT NULL,
  lot_number            TEXT NOT NULL,
  level                 TEXT NOT NULL DEFAULT 'Level 1',
  expiration_date       TEXT,
  target_values         TEXT NOT NULL DEFAULT '{}',
  analytes              TEXT NOT NULL DEFAULT '[]',
  is_active             INTEGER NOT NULL DEFAULT 1,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS qc_entries (
  id                    TEXT PRIMARY KEY,
  equipment_id          TEXT,
  control_id            TEXT NOT NULL,
  analyte_code          TEXT NOT NULL,
  analyte_name          TEXT,
  control_lot           TEXT,
  run_date              TEXT NOT NULL,
  run_number            INTEGER DEFAULT 1,
  measured_value        REAL NOT NULL,
  mean_target           REAL,
  sd_target             REAL,
  z_score               REAL,
  status                TEXT NOT NULL DEFAULT 'IN_CONTROL',
  violated_rules        TEXT NOT NULL DEFAULT '[]',
  violation_type        TEXT,
  reagent_lot_number    TEXT,
  corrective_action     TEXT,
  performed_by          TEXT,
  notes                 TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE SET NULL,
  FOREIGN KEY (control_id) REFERENCES qc_controls(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_qc_entries_control ON qc_entries(control_id);
CREATE INDEX IF NOT EXISTS idx_qc_entries_date ON qc_entries(run_date);

CREATE TABLE IF NOT EXISTS neqas_records (
  id                    TEXT PRIMARY KEY,
  equipment_id          TEXT,
  cycle_year            TEXT NOT NULL,
  event_number          TEXT,
  nrl_name              TEXT NOT NULL,
  sample_id             TEXT,
  analyte_code          TEXT,
  target_score          REAL,
  achieved_score        REAL,
  status                TEXT NOT NULL DEFAULT 'PARTICIPATING',
  certificate_number    TEXT,
  survey_date           TEXT,
  notes                 TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE SET NULL
);

-- ============================================================
-- GEZYNEBOT AI CONVERSATIONS & MESSAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS chatbot_conversations (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT,
  title                 TEXT NOT NULL DEFAULT 'New Conversation',
  last_model            TEXT NOT NULL DEFAULT 'openai/gpt-4o-mini',
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_chat_conv_user ON chatbot_conversations(user_id);

CREATE TABLE IF NOT EXISTS chatbot_messages (
  id                    TEXT PRIMARY KEY,
  conversation_id       TEXT NOT NULL,
  user_id               TEXT,
  role                  TEXT NOT NULL,
  content               TEXT NOT NULL,
  sources               TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (conversation_id) REFERENCES chatbot_conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_chat_msg_conv ON chatbot_messages(conversation_id);
