/**
 * JSON → SQLite Migration Tool
 * ================================
 * Migrates data from the old LIS file-based JSON system to the new SQLite database.
 *
 * Usage:
 *   cd backend && npm run migrate
 *
 * Or directly:
 *   npx ts-node tools/migrate-json-to-sqlite.ts [--data path/to/data.json] [--users path/to/data-users.json]
 *
 * This tool reads:
 *   - data.json        (patients, tests, templates, counters)
 *   - data-users.json  (user accounts with bcrypt passwords)
 *
 * And inserts them into the SQLite database defined by backend/.env DB_PATH
 */

import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import crypto from 'crypto';

// ── Configuration ──────────────────────────────────────────────────────

const args = process.argv.slice(2);
function getArg(name: string, fallback: string): string {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}

const DATA_JSON_PATH = getArg('data', path.join(__dirname, '..', '..', 'lis-fullstack', 'data.json'));
const USERS_JSON_PATH = getArg('users', path.join(__dirname, '..', '..', 'lis-fullstack', 'data-users.json'));
const DB_PATH = getArg('db', path.join(__dirname, '..', 'backend', 'data', 'lis.db'));
const USER_DATA_KEY = getArg('key', process.env.DATA_USERS_KEY || process.env.USER_DATA_KEY || '');

// ── Helpers ────────────────────────────────────────────────────────────

function deriveKey(secret: string): Buffer {
  return crypto.createHash('sha256').update(String(secret)).digest();
}

function decryptUsersJson(raw: string): any[] {
  if (!USER_DATA_KEY) return JSON.parse(raw);
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return JSON.parse(raw || '[]');
  }
  if (!parsed || !parsed.data) return parsed; // not encrypted
  const key = deriveKey(USER_DATA_KEY);
  const iv = Buffer.from(parsed.iv, 'base64');
  const tag = Buffer.from(parsed.tag, 'base64');
  const encrypted = Buffer.from(parsed.data, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(dec.toString('utf8'));
}

// ── Main Migration ─────────────────────────────────────────────────────

function migrate() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  LIS JSON → SQLite Migration Tool                      ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log();

  // Validate input files
  if (!fs.existsSync(DATA_JSON_PATH)) {
    console.error(`❌  data.json not found at: ${DATA_JSON_PATH}`);
    console.error(`    Use --data <path> to specify the location.`);
    process.exit(1);
  }

  if (!fs.existsSync(USERS_JSON_PATH)) {
    console.error(`❌  data-users.json not found at: ${USERS_JSON_PATH}`);
    console.error(`    Use --users <path> to specify the location.`);
    process.exit(1);
  }

  // Ensure DB directory exists
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  console.log(`📄  Data file:  ${DATA_JSON_PATH}`);
  console.log(`👤  Users file: ${USERS_JSON_PATH}`);
  console.log(`🗄️  Database:   ${DB_PATH}`);
  console.log();

  // Read JSON data
  console.log('Reading JSON files...');
  const dataRaw = fs.readFileSync(DATA_JSON_PATH, 'utf-8');
  const data = JSON.parse(dataRaw);

  const usersRaw = fs.readFileSync(USERS_JSON_PATH, 'utf-8');
  const users: any[] = decryptUsersJson(usersRaw);

  const patients: any[] = data.patients || [];
  const tests: any[] = data.tests || [];
  const templates: any[] = data.templates || [];
  const counters: Record<string, number> = data.counters || {};

  console.log(`  Users:     ${users.length}`);
  console.log(`  Patients:  ${patients.length}`);
  console.log(`  Tests:     ${tests.length}`);
  console.log(`  Templates: ${templates.length}`);
  console.log(`  Counters:  ${Object.keys(counters).length}`);
  console.log();

  // Open SQLite database
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Create schema
  console.log('Creating schema...');
  const schemaPath = path.join(__dirname, '..', 'backend', 'src', 'db', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');

  // Strip SQL comments before splitting by semicolons
  const stripped = schema.replace(/--[^\n]*/g, '');
  const stmts = stripped.split(';').map(s => s.trim()).filter(s => s.length > 0);
  for (const stmt of stmts) {
    try {
      db.exec(stmt + ';');
    } catch (err: any) {
      // Ignore if table already exists
      if (!err.message.includes('already exists')) {
        console.warn(`  ⚠  ${err.message.substring(0, 80)}`);
      }
    }
  }

  // ── Insert Users ───────────────────────────────────────────────────

  console.log('Migrating users...');
  const insertUser = db.prepare(`
    INSERT OR REPLACE INTO users (
      id, name, email, password, role, status, license_number,
      signature, auto_signature_enabled, auto_signature_until,
      permissions, created_at, last_login
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let userCount = 0;
  const insertUsers = db.transaction(() => {
    for (const u of users) {
      try {
        const autoSig = u.autoSignature || {};
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
          JSON.stringify(u.permissions || {}),
          u.createdAt || new Date().toISOString(),
          u.lastLogin || null
        );
        userCount++;
      } catch (err: any) {
        console.warn(`  ⚠  User ${u.email}: ${err.message}`);
      }
    }
  });
  insertUsers();
  console.log(`  ✅  ${userCount} users migrated`);

  // ── Insert Patients ────────────────────────────────────────────────

  console.log('Migrating patients...');
  const insertPatient = db.prepare(`
    INSERT OR REPLACE INTO patients (
      id, patient_id, patient_code, first_name, middle_name, last_name,
      date_of_birth, age_manual, gender, phone, email, address,
      physician, company, philhealth_consent, philhealth_id,
      required_areas, requested_tests, payment_history,
      created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let patientCount = 0;
  const insertPatients = db.transaction(() => {
    for (const p of patients) {
      try {
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
          JSON.stringify(p.requiredAreas || []),
          JSON.stringify(p.requestedTests || []),
          JSON.stringify(p.paymentHistory || []),
          p.createdBy || null,
          p.createdAt || new Date().toISOString(),
          p.updatedAt || p.createdAt || new Date().toISOString()
        );
        patientCount++;
      } catch (err: any) {
        console.warn(`  ⚠  Patient ${p.patientId || p.id}: ${err.message}`);
      }
    }
  });
  insertPatients();
  console.log(`  ✅  ${patientCount} patients migrated`);

  // ── Insert Tests ───────────────────────────────────────────────────

  console.log('Migrating tests...');
  const insertTest = db.prepare(`
    INSERT OR REPLACE INTO tests (
      id, test_id, patient_id, test_type, test_date, status,
      specimen_numbers, assigned_doctor_id, assigned_doctor_name,
      results, notes, priority, requested_by, performed_by,
      completed_at, requested_tests, awaiting_only, status_history,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let testCount = 0;
  let testSkipped = 0;

  // Collect valid patient IDs for FK validation
  const validPatientIds = new Set(patients.map(p => p.id));

  const insertTests = db.transaction(() => {
    for (const t of tests) {
      try {
        // The old data uses 'patient' as the FK field name
        const patientId = t.patient || t.patient_id || t.patientId;

        // Skip tests with no patient reference or orphaned references
        if (!patientId) {
          testSkipped++;
          continue;
        }

        // If patient doesn't exist, create a placeholder
        if (!validPatientIds.has(patientId)) {
          try {
            insertPatient.run(
              patientId, null, null, 'Unknown', null, 'Patient',
              null, null, null, null, null, null, null, null, 0, null,
              '[]', '[]', '[]', null, new Date().toISOString(), new Date().toISOString()
            );
            validPatientIds.add(patientId);
            console.log(`  ℹ  Created placeholder patient for orphan test: ${patientId}`);
          } catch { /* ignore if already exists */ }
        }

        insertTest.run(
          t.id,
          t.testId || null,
          patientId,
          t.testType || 'Unknown',
          t.testDate || t.createdAt || new Date().toISOString(),
          t.status || 'Pending',
          JSON.stringify(t.specimenNumbers || {}),
          t.assignedDoctorId || null,
          t.assignedDoctorName || null,
          JSON.stringify(t.results || {}),
          t.notes || null,
          t.priority || 'Normal',
          t.requestedBy || null,
          t.performedBy || null,
          t.completedAt || null,
          JSON.stringify(t.requestedTests || []),
          t.awaitingOnly ? 1 : 0,
          JSON.stringify(t.statusHistory || []),
          t.createdAt || new Date().toISOString(),
          t.updatedAt || t.createdAt || new Date().toISOString()
        );
        testCount++;
      } catch (err: any) {
        testSkipped++;
        console.warn(`  ⚠  Test ${t.testId || t.id}: ${err.message}`);
      }
    }
  });
  insertTests();
  console.log(`  ✅  ${testCount} tests migrated (${testSkipped} skipped)`);

  // ── Insert Templates ───────────────────────────────────────────────

  console.log('Migrating templates...');
  const insertTemplate = db.prepare(`
    INSERT OR REPLACE INTO templates (
      id, name, test_type, fields, footer_notes, is_active,
      created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let templateCount = 0;
  const insertTemplates = db.transaction(() => {
    for (const tmpl of templates) {
      try {
        insertTemplate.run(
          tmpl.id,
          tmpl.name || 'Untitled',
          tmpl.testType || null,
          JSON.stringify(tmpl.fields || []),
          tmpl.footerNotes || null,
          tmpl.isActive !== false ? 1 : 0,
          tmpl.createdBy || null,
          tmpl.createdAt || new Date().toISOString(),
          tmpl.updatedAt || tmpl.createdAt || new Date().toISOString()
        );
        templateCount++;
      } catch (err: any) {
        console.warn(`  ⚠  Template ${tmpl.name || tmpl.id}: ${err.message}`);
      }
    }
  });
  insertTemplates();
  console.log(`  ✅  ${templateCount} templates migrated`);

  // ── Insert Counters ────────────────────────────────────────────────

  console.log('Migrating counters...');
  const insertCounter = db.prepare(`
    INSERT OR REPLACE INTO counters (key, value) VALUES (?, ?)
  `);

  let counterCount = 0;
  const insertCounters = db.transaction(() => {
    for (const [key, value] of Object.entries(counters)) {
      try {
        // Map old counter keys (e.g. "Blood Chemistry" → "test_BC")
        const mappedKey = key.startsWith('test_') ? key : `test_${key}`;
        insertCounter.run(mappedKey, typeof value === 'number' ? value : parseInt(String(value)) || 0);
        counterCount++;
      } catch (err: any) {
        console.warn(`  ⚠  Counter ${key}: ${err.message}`);
      }
    }
  });
  insertCounters();
  console.log(`  ✅  ${counterCount} counters migrated`);

  // ── Done ───────────────────────────────────────────────────────────

  db.close();

  console.log();
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  Migration complete!                                    ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Users:     ${String(userCount).padStart(6)}                                  ║`);
  console.log(`║  Patients:  ${String(patientCount).padStart(6)}                                  ║`);
  console.log(`║  Tests:     ${String(testCount).padStart(6)}  (${testSkipped} skipped)${' '.repeat(Math.max(0, 18 - String(testSkipped).length - 10))}║`);
  console.log(`║  Templates: ${String(templateCount).padStart(6)}                                  ║`);
  console.log(`║  Counters:  ${String(counterCount).padStart(6)}                                  ║`);
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Database:  ${DB_PATH.substring(0, 42).padEnd(42)} ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
}

migrate();
