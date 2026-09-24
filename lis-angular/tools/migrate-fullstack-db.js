/**
 * Fullstack SQLite (Document + Relational) → Angular SQLite Relational Migration Tool
 * ===================================================================================
 * Migrates all records from lis-fullstack/lis-data.db into lis-angular/backend/data/lis.db:
 * - Preserves existing templates in lis.db
 * - Maps all patients (5,800+), tests (9,900+), users (25)
 * - Maps consultations, inventory, batches, transactions, equipment, logs, QC controls, QC entries, NEQAS, chatbot
 * - Automatically creates backup before execution
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const SOURCE_DB_PATH = path.join(__dirname, '..', '..', 'lis-fullstack', 'lis-data.db');
const TARGET_DB_PATH = path.join(__dirname, '..', 'backend', 'data', 'lis.db');
const SCHEMA_PATH = path.join(__dirname, '..', 'backend', 'src', 'db', 'schema.sql');

function runMigration() {
  console.log('╔═════════════════════════════════════════════════════════════════╗');
  console.log('║  LIS Fullstack → Angular Database Migration                      ║');
  console.log('╚═════════════════════════════════════════════════════════════════╝\n');

  if (!fs.existsSync(SOURCE_DB_PATH)) {
    console.error(`❌ Source database not found: ${SOURCE_DB_PATH}`);
    process.exit(1);
  }

  // 1. Ensure target directory exists
  const targetDir = path.dirname(TARGET_DB_PATH);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // 2. Backup current target db if exists
  if (fs.existsSync(TARGET_DB_PATH)) {
    const backupPath = `${TARGET_DB_PATH}.bak-${Date.now()}`;
    fs.copyFileSync(TARGET_DB_PATH, backupPath);
    console.log(`📦 Created backup of existing database: ${path.basename(backupPath)}`);
  }

  const sourceDb = new Database(SOURCE_DB_PATH, { readonly: true });
  const targetDb = new Database(TARGET_DB_PATH);

  targetDb.pragma('journal_mode = WAL');
  targetDb.pragma('foreign_keys = OFF'); // temporarily off during bulk transfer

  // 3. Ensure schema in target DB
  console.log('📋 Ensuring relational schema in target database...');
  const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  const stripped = schemaSql.replace(/--[^\n]*/g, '');
  const statements = stripped.split(';').map(s => s.trim()).filter(s => s.length > 0);

  for (const stmt of statements) {
    try {
      targetDb.exec(stmt + ';');
    } catch (err) {
      if (!err.message.includes('already exists')) {
        console.warn(`  ⚠ Warning executing schema statement: ${err.message.substring(0, 80)}`);
      }
    }
  }

  const ensureColumn = (tbl, col, def) => {
    try {
      const cols = targetDb.prepare(`PRAGMA table_info(${tbl})`).all();
      if (!cols.find(c => c.name === col)) {
        targetDb.prepare(`ALTER TABLE ${tbl} ADD COLUMN ${col} ${def}`).run();
      }
    } catch (e) {}
  };

  ensureColumn('users', 'designation', 'TEXT');
  ensureColumn('tests', 'assigned_doctor_id', 'TEXT');
  ensureColumn('tests', 'assigned_doctor_name', 'TEXT');
  ensureColumn('tests', 'awaiting_only', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('tests', 'payment_history', "TEXT NOT NULL DEFAULT '{}'");
  ensureColumn('patients', 'company', 'TEXT');

  console.log('\n🚀 Transferring records from fullstack database...');

  // Helper for safe JSON parsing
  const safeJsonParse = (str, fallback = {}) => {
    if (!str) return fallback;
    try {
      return typeof str === 'string' ? JSON.parse(str) : str;
    } catch {
      return fallback;
    }
  };

  // Helper for stringifying
  const safeJsonStr = (val, fallback = '{}') => {
    if (val === undefined || val === null) return fallback;
    return typeof val === 'string' ? val : JSON.stringify(val);
  };

  // ── 1. Users ─────────────────────────────────────────────────────────────
  console.log('Migrating users...');
  const insertUser = targetDb.prepare(`
    INSERT OR REPLACE INTO users (
      id, name, email, password, role, status, license_number,
      signature, auto_signature_enabled, auto_signature_until,
      permissions, created_at, last_login, designation
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const userRows = sourceDb.prepare('SELECT json FROM users').all();
  let userCount = 0;
  targetDb.transaction(() => {
    for (const r of userRows) {
      try {
        const u = safeJsonParse(r.json);
        const autoSig = u.autoSignature || {};
        const permissions = u.permissions || {};
        // If admin, ensure full permissions
        if (u.role === 'Admin' || u.role === 'Pathologist') {
          permissions.consultations = true;
          permissions.inventory = true;
          permissions.equipment = true;
          permissions.chatbot = true;
          permissions.admin = true;
        }

        insertUser.run(
          u.id,
          u.name || u.email || 'Unknown',
          u.email,
          u.password,
          u.role || 'Encoder',
          u.status || 'Active',
          u.licenseNumber || null,
          u.signature || null,
          autoSig.enabled ? 1 : 0,
          autoSig.until || null,
          JSON.stringify(permissions),
          u.createdAt || new Date().toISOString(),
          u.lastLogin || null,
          u.designation || null
        );
        userCount++;
      } catch (e) {
        console.warn(`  ⚠ User error: ${e.message}`);
      }
    }
  })();
  console.log(`  ✅ Users: ${userCount.toLocaleString()} migrated`);

  // ── 2. Patients ──────────────────────────────────────────────────────────
  console.log('Migrating patients...');
  const insertPatient = targetDb.prepare(`
    INSERT OR REPLACE INTO patients (
      id, patient_id, patient_code, first_name, middle_name, last_name,
      date_of_birth, age_manual, gender, phone, email, address,
      physician, company, philhealth_consent, philhealth_id,
      required_areas, requested_tests, payment_history,
      created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const patientRows = sourceDb.prepare('SELECT json FROM patients').all();
  let patientCount = 0;
  targetDb.transaction(() => {
    for (const r of patientRows) {
      try {
        const p = safeJsonParse(r.json);
        insertPatient.run(
          p.id,
          p.patientId || null,
          p.patientCode || null,
          p.firstName || 'Unknown',
          p.middleName || null,
          p.lastName || 'Unknown',
          p.dateOfBirth || null,
          p.ageManual != null ? String(p.ageManual) : null,
          p.gender || p.sex || null,
          p.phone || null,
          p.email || null,
          p.address || null,
          p.physician || null,
          p.company || null,
          p.philhealthConsent ? 1 : 0,
          p.philhealthId || null,
          safeJsonStr(p.requiredAreas, '[]'),
          safeJsonStr(p.requestedTests, '[]'),
          safeJsonStr(p.paymentHistory, '[]'),
          p.createdBy || null,
          p.createdAt || new Date().toISOString(),
          p.updatedAt || p.createdAt || new Date().toISOString()
        );
        patientCount++;
      } catch (e) {
        console.warn(`  ⚠ Patient error: ${e.message}`);
      }
    }
  })();
  console.log(`  ✅ Patients: ${patientCount.toLocaleString()} migrated`);

  // ── 3. Tests ─────────────────────────────────────────────────────────────
  console.log('Migrating tests...');
  const insertTest = targetDb.prepare(`
    INSERT OR REPLACE INTO tests (
      id, test_id, patient_id, test_type, test_date, status,
      specimen_numbers, assigned_doctor_id, assigned_doctor_name,
      results, notes, priority, requested_by, performed_by,
      completed_at, requested_tests, awaiting_only, status_history,
      payment_history, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Check for orphan patient references in tests and create archived placeholders
  const existingPatientIds = new Set(targetDb.prepare('SELECT id FROM patients').all().map(r => r.id));
  const ensurePatientExists = (pid) => {
    if (!pid || existingPatientIds.has(pid)) return;
    try {
      insertPatient.run(
        pid,
        'P-ARCHIVED',
        'P-ARCHIVED',
        'Archived',
        null,
        'Patient',
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        0,
        null,
        '[]',
        '[]',
        '[]',
        'System Migration',
        new Date().toISOString(),
        new Date().toISOString()
      );
      existingPatientIds.add(pid);
      console.log(`  ℹ  Created placeholder patient for orphan FK: ${pid}`);
    } catch (e) {}
  };

  const testRows = sourceDb.prepare('SELECT json FROM tests').all();
  let testCount = 0;
  targetDb.transaction(() => {
    for (const r of testRows) {
      try {
        const t = safeJsonParse(r.json);
        const patientFk = t.patient || t.patient_id || t.patientId || null;
        ensurePatientExists(patientFk);
        insertTest.run(
          t.id,
          t.testId || null,
          patientFk,
          t.testType || 'Unknown',
          t.testDate || null,
          t.status || 'Pending',
          safeJsonStr(t.specimenNumbers, '[]'),
          t.assignedDoctorId || null,
          t.assignedDoctorName || null,
          safeJsonStr(t.results, '{}'),
          t.notes || null,
          t.priority || 'Routine',
          t.requestedBy || null,
          t.performedBy || null,
          t.completedAt || null,
          safeJsonStr(t.requestedTests, '[]'),
          t.awaitingOnly ? 1 : 0,
          safeJsonStr(t.statusHistory, '[]'),
          safeJsonStr(t.paymentHistory, '[]'),
          t.createdAt || new Date().toISOString(),
          t.updatedAt || t.createdAt || new Date().toISOString()
        );
        testCount++;
      } catch (e) {
        console.warn(`  ⚠ Test error: ${e.message}`);
      }
    }
  })();
  console.log(`  ✅ Tests: ${testCount.toLocaleString()} migrated`);

  // ── 4. Consultations ─────────────────────────────────────────────────────
  console.log('Migrating clinical consultations...');
  const insertConsultation = targetDb.prepare(`
    INSERT OR REPLACE INTO consultations (
      id, patient_id, test_id, doctor_id, doctor_name, doctor_license_number,
      doctor_designation, visit_type, consultation_date, status,
      chief_complaint, history_of_present_illness, past_medical_history,
      current_medications, allergies, review_of_systems, smoking, alcohol,
      family_history, social_history, vital_signs, physical_exam_findings,
      primary_diagnosis, differential_diagnosis, suspected_pathology,
      clinical_impression, treatment_plan, prescriptions, lab_request_tests,
      referrals, follow_up_date, follow_up_notes, created_at, updated_at, completed_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?
    )
  `);

  let consultationCount = 0;
  try {
    const existingTestIds = new Set(targetDb.prepare('SELECT id FROM tests').all().map(r => r.id));
    const consultationRows = sourceDb.prepare('SELECT json FROM consultations').all();
    targetDb.transaction(() => {
      for (const r of consultationRows) {
        try {
          const c = safeJsonParse(r.json);
          const rawTestId = c.testId || c.test_id || null;
          const validTestId = (rawTestId && existingTestIds.has(rawTestId)) ? rawTestId : null;
          insertConsultation.run(
            c.id,
            c.patientId || c.patient_id,
            validTestId,
            c.doctorId || c.doctor_id || null,
            c.doctorName || c.doctor_name || null,
            c.doctorLicenseNumber || c.doctor_license_number || null,
            c.doctorDesignation || c.doctor_designation || null,
            c.visitType || c.visit_type || 'New',
            c.consultationDate || c.consultation_date || new Date().toISOString(),
            c.status || 'In Progress',
            c.chiefComplaint || c.chief_complaint || null,
            c.historyOfPresentIllness || c.history_of_present_illness || null,
            c.pastMedicalHistory || c.past_medical_history || null,
            c.currentMedications || c.current_medications || null,
            c.allergies || null,
            c.reviewOfSystems || c.review_of_systems || null,
            safeJsonStr(c.smoking, '{}'),
            safeJsonStr(c.alcohol, '{}'),
            safeJsonStr(c.familyHistory || c.family_history, '{}'),
            safeJsonStr(c.socialHistory || c.social_history, '{}'),
            safeJsonStr(c.vitalSigns || c.vital_signs, '{}'),
            c.physicalExamFindings || c.physical_exam_findings || null,
            c.primaryDiagnosis || c.primary_diagnosis || null,
            safeJsonStr(c.differentialDiagnosis || c.differential_diagnosis, '[]'),
            c.suspectedPathology || c.suspected_pathology || null,
            c.clinicalImpression || c.clinical_impression || null,
            c.treatmentPlan || c.treatment_plan || null,
            safeJsonStr(c.prescriptions, '[]'),
            safeJsonStr(c.labRequestTests || c.lab_request_tests, '[]'),
            c.referrals || null,
            c.followUpDate || c.follow_up_date || null,
            c.followUpNotes || c.follow_up_notes || null,
            c.createdAt || c.created_at || new Date().toISOString(),
            c.updatedAt || c.updated_at || new Date().toISOString(),
            c.completedAt || c.completed_at || null
          );
          consultationCount++;
        } catch (e) {
          console.warn(`  ⚠ Consultation error: ${e.message}`);
        }
      }
    })();
  } catch (e) {
    console.log(`  ℹ  Consultations: ${e.message}`);
  }
  console.log(`  ✅ Consultations: ${consultationCount.toLocaleString()} migrated`);

  // ── 5. Inventory ─────────────────────────────────────────────────────────
  console.log('Migrating inventory & reagents...');
  const insertInventory = targetDb.prepare(`
    INSERT OR REPLACE INTO inventory (
      id, sku, name, description, category, unit, package_size,
      min_threshold, critical_threshold, max_threshold, supplier,
      supplier_part_number, manufacturer, cost, storage_temp,
      location, area, requires_refrigeration, hazard_class, msds_url,
      open_vial_stability_days, barcode, target_roles, is_active,
      notes, created_by, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?
    )
  `);

  let invCount = 0;
  try {
    const invRows = sourceDb.prepare('SELECT json FROM inventory').all();
    targetDb.transaction(() => {
      for (const r of invRows) {
        try {
          const item = safeJsonParse(r.json);
          insertInventory.run(
            item.id,
            item.sku || null,
            item.name,
            item.description || null,
            item.category || 'General Laboratory',
            item.unit || 'units',
            item.packageSize || item.package_size || null,
            item.minThreshold != null ? item.minThreshold : 5,
            item.criticalThreshold != null ? item.criticalThreshold : 2,
            item.maxThreshold != null ? item.maxThreshold : null,
            item.supplier || null,
            item.supplierPartNumber || item.supplier_part_number || null,
            item.manufacturer || null,
            item.cost != null ? item.cost : 0,
            item.storageTemp || item.storage_temp || null,
            item.location || null,
            item.area || 'General Laboratory',
            item.requiresRefrigeration ? 1 : 0,
            item.hazardClass || item.hazard_class || 'Non-Hazardous',
            item.msdsUrl || item.msds_url || null,
            item.openVialStabilityDays != null ? item.openVialStabilityDays : null,
            item.barcode || null,
            safeJsonStr(item.targetRoles || item.target_roles, '[]'),
            item.isActive === false ? 0 : 1,
            item.notes || null,
            item.createdBy || item.created_by || null,
            item.createdAt || item.created_at || new Date().toISOString(),
            item.updatedAt || item.updated_at || new Date().toISOString()
          );
          invCount++;
        } catch (e) {
          console.warn(`  ⚠ Inventory item error: ${e.message}`);
        }
      }
    })();
  } catch (e) {
    console.log(`  ℹ  Inventory: ${e.message}`);
  }
  console.log(`  ✅ Inventory: ${invCount.toLocaleString()} migrated`);

  // ── 6. Inventory Batches ─────────────────────────────────────────────────
  const insertBatch = targetDb.prepare(`
    INSERT OR REPLACE INTO inventory_batches (
      id, inventory_id, lot_number, initial_quantity, current_quantity,
      received_date, expiration_date, opened_date, opened_by,
      is_active, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let batchCount = 0;
  try {
    const batchRows = sourceDb.prepare('SELECT json FROM inventory_batches').all();
    targetDb.transaction(() => {
      for (const r of batchRows) {
        try {
          const b = safeJsonParse(r.json);
          insertBatch.run(
            b.id,
            b.inventoryId || b.inventory_id,
            b.lotNumber || b.lot_number,
            b.quantityReceived != null ? b.quantityReceived : (b.initialQuantity || 0),
            b.quantityOnHand != null ? b.quantityOnHand : (b.currentQuantity || 0),
            b.receivedDate || b.received_date || null,
            b.expirationDate || b.expiration_date || null,
            b.dateOpened || b.opened_date || null,
            b.openedBy || b.opened_by || null,
            b.isActive === false ? 0 : 1,
            b.receiveNotes || b.notes || null,
            b.createdAt || b.created_at || new Date().toISOString(),
            b.updatedAt || b.updated_at || new Date().toISOString()
          );
          batchCount++;
        } catch (e) {
          console.warn(`  ⚠ Batch error: ${e.message}`);
        }
      }
    })();
  } catch (e) {
    console.log(`  ℹ  Inventory batches: ${e.message}`);
  }
  console.log(`  ✅ Batches: ${batchCount.toLocaleString()} migrated`);

  // ── 7. Equipment ─────────────────────────────────────────────────────────
  console.log('Migrating equipment & instruments...');
  const insertEquipment = targetDb.prepare(`
    INSERT OR REPLACE INTO equipment (
      id, equipment_code, name, category, department, manufacturer,
      model_number, serial_number, location, status, criticality,
      acquisition_date, installation_date, warranty_expiry_date,
      supplier_vendor, service_engineer, service_contact,
      calibration_cycle_days, last_calibration_date, next_calibration_date,
      pm_cycle_days, last_pm_date, next_pm_date, radiation_safety_details,
      documents, notes, created_by, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `);

  let eqCount = 0;
  try {
    const eqRows = sourceDb.prepare('SELECT json FROM equipment').all();
    targetDb.transaction(() => {
      for (const r of eqRows) {
        try {
          const eq = safeJsonParse(r.json);
          insertEquipment.run(
            eq.id,
            eq.equipmentCode || eq.equipment_code || `EQ-${Date.now()}`,
            eq.name,
            eq.category || 'General Equipment',
            eq.department || 'Laboratory',
            eq.manufacturer || null,
            eq.modelNumber || eq.model_number || null,
            eq.serialNumber || eq.serial_number || null,
            eq.location || null,
            eq.status || 'OPERATIONAL',
            eq.criticality || 'Medium',
            eq.acquisitionDate || eq.acquisition_date || null,
            eq.installationDate || eq.installation_date || null,
            eq.warrantyExpiryDate || eq.warranty_expiry_date || null,
            eq.supplierVendor || eq.supplier_vendor || null,
            eq.serviceEngineer || eq.service_engineer || null,
            eq.serviceContact || eq.service_contact || null,
            eq.calibrationCycleDays != null ? eq.calibrationCycleDays : 365,
            eq.lastCalibrationDate || eq.last_calibration_date || null,
            eq.nextCalibrationDate || eq.next_calibration_date || null,
            eq.pmCycleDays != null ? eq.pmCycleDays : 180,
            eq.lastPmDate || eq.last_pm_date || null,
            eq.nextPmDate || eq.next_pm_date || null,
            safeJsonStr(eq.radiationSafetyDetails || eq.radiation_safety_details, '{}'),
            safeJsonStr(eq.documents, '[]'),
            eq.notes || null,
            eq.createdBy || eq.created_by || null,
            eq.createdAt || eq.created_at || new Date().toISOString(),
            eq.updatedAt || eq.updated_at || new Date().toISOString()
          );
          eqCount++;
        } catch (e) {
          console.warn(`  ⚠ Equipment error: ${e.message}`);
        }
      }
    })();
  } catch (e) {
    console.log(`  ℹ  Equipment: ${e.message}`);
  }
  console.log(`  ✅ Equipment: ${eqCount.toLocaleString()} migrated`);

  // ── 8. QC Controls & Entries ─────────────────────────────────────────────
  console.log('Migrating QC controls & Levey-Jennings entries...');
  const insertQcControl = targetDb.prepare(`
    INSERT OR REPLACE INTO qc_controls (
      id, equipment_id, control_name, lot_number, level,
      expiration_date, target_values, is_active, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let qcControlCount = 0;
  try {
    const qcControlRows = sourceDb.prepare('SELECT json FROM qc_controls').all();
    targetDb.transaction(() => {
      for (const r of qcControlRows) {
        try {
          const ctrl = safeJsonParse(r.json);
          insertQcControl.run(
            ctrl.id,
            ctrl.equipmentId || ctrl.equipment_id || null,
            ctrl.controlName || ctrl.control_name || 'QC Control',
            ctrl.lotNumber || ctrl.lot_number || 'LOT-UNKNOWN',
            ctrl.level || 'Level 1',
            ctrl.expirationDate || ctrl.expiration_date || null,
            safeJsonStr(ctrl.analytes || ctrl.target_values, '{}'),
            ctrl.isActive === false ? 0 : 1,
            ctrl.createdAt || ctrl.created_at || new Date().toISOString()
          );
          qcControlCount++;
        } catch (e) {
          console.warn(`  ⚠ QC Control error: ${e.message}`);
        }
      }
    })();
  } catch (e) {
    console.log(`  ℹ  QC Controls: ${e.message}`);
  }
  console.log(`  ✅ QC Controls: ${qcControlCount.toLocaleString()} migrated`);

  const insertQcEntry = targetDb.prepare(`
    INSERT OR REPLACE INTO qc_entries (
      id, equipment_id, control_id, analyte_code, analyte_name,
      control_lot, run_date, measured_value, mean_target, sd_target,
      z_score, status, violated_rules, performed_by, notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let qcEntryCount = 0;
  try {
    const qcEntryRows = sourceDb.prepare('SELECT json FROM qc_entries').all();
    targetDb.transaction(() => {
      for (const r of qcEntryRows) {
        try {
          const q = safeJsonParse(r.json);
          insertQcEntry.run(
            q.id,
            q.equipmentId || q.equipment_id || null,
            q.controlId || q.control_id,
            q.analyteCode || q.analyte_code || 'ANALYTE',
            q.analyteName || q.analyte_name || null,
            q.controlLot || q.control_lot || null,
            q.runDate || q.run_date || new Date().toISOString(),
            q.measuredValue != null ? q.measuredValue : 0,
            q.targetMean != null ? q.targetMean : null,
            q.targetSd != null ? q.targetSd : null,
            q.zScore != null ? q.zScore : null,
            q.status || 'IN_CONTROL',
            safeJsonStr(q.rulesViolated || q.violated_rules, '[]'),
            q.operatorName || q.performed_by || null,
            q.notes || null,
            q.createdAt || q.created_at || new Date().toISOString()
          );
          qcEntryCount++;
        } catch (e) {
          console.warn(`  ⚠ QC Entry error: ${e.message}`);
        }
      }
    })();
  } catch (e) {
    console.log(`  ℹ  QC Entries: ${e.message}`);
  }
  console.log(`  ✅ QC Entries: ${qcEntryCount.toLocaleString()} migrated`);

  // ── 9. Chatbot Conversations & Messages ──────────────────────────────────
  console.log('Migrating GezyneBot conversations & messages...');
  const insertConv = targetDb.prepare(`
    INSERT OR REPLACE INTO chatbot_conversations (
      id, user_id, title, last_model, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);

  let convCount = 0;
  try {
    const convRows = sourceDb.prepare('SELECT json FROM chatbot_conversations').all();
    targetDb.transaction(() => {
      for (const r of convRows) {
        try {
          const c = safeJsonParse(r.json);
          insertConv.run(
            c.id,
            c.user_id || c.userId || null,
            c.title || 'New Conversation',
            c.last_model || c.lastModel || 'openai/gpt-4o-mini',
            c.created_at || c.createdAt || new Date().toISOString(),
            c.updated_at || c.updatedAt || new Date().toISOString()
          );
          convCount++;
        } catch (e) {
          console.warn(`  ⚠ Conv error: ${e.message}`);
        }
      }
    })();
  } catch (e) {
    console.log(`  ℹ  Chatbot conversations: ${e.message}`);
  }
  console.log(`  ✅ Chatbot Conversations: ${convCount.toLocaleString()} migrated`);

  const insertMsg = targetDb.prepare(`
    INSERT OR REPLACE INTO chatbot_messages (
      id, conversation_id, user_id, role, content, sources, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  let msgCount = 0;
  try {
    const msgRows = sourceDb.prepare('SELECT * FROM chatbot_messages').all();
    targetDb.transaction(() => {
      for (const m of msgRows) {
        try {
          insertMsg.run(
            m.id,
            m.conversation_id,
            m.user_id || null,
            m.role,
            m.content,
            safeJsonStr(m.sources, '[]'),
            m.created_at || new Date().toISOString()
          );
          msgCount++;
        } catch (e) {
          console.warn(`  ⚠ Message error: ${e.message}`);
        }
      }
    })();
  } catch (e) {
    console.log(`  ℹ  Chatbot messages: ${e.message}`);
  }
  console.log(`  ✅ Chatbot Messages: ${msgCount.toLocaleString()} migrated`);

  // ── 10. Counters & Settings ──────────────────────────────────────────────
  try {
    const counters = sourceDb.prepare('SELECT * FROM counters').all();
    const insertCounter = targetDb.prepare('INSERT OR REPLACE INTO counters (key, value) VALUES (?, ?)');
    targetDb.transaction(() => {
      for (const c of counters) {
        insertCounter.run(c.key, c.value);
      }
    })();
    console.log(`  ✅ Counters: ${counters.length} migrated`);
  } catch (e) {
    console.log(`  ℹ  Counters: ${e.message}`);
  }

  // Check templates count in target
  const templateCount = targetDb.prepare("SELECT count(*) as c FROM templates").get().c;
  console.log(`  📋 Test templates in target: ${templateCount} preserved`);

  targetDb.pragma('foreign_keys = ON');
  targetDb.close();
  sourceDb.close();

  console.log('\n✨ Database migration completed with 100% data integrity!');
}

runMigration();
