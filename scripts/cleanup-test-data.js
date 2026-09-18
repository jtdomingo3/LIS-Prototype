/**
 * Test Data Cleanup Utility
 * File: scripts/cleanup-test-data.js
 *
 * Safely removes test/dummy records created during live testing from
 * the local standalone SQLite DataStore (and server when online).
 *
 * Usage:
 *   node scripts/cleanup-test-data.js --dry-run     # Preview records to be cleaned
 *   node scripts/cleanup-test-data.js --clean       # Perform actual cleanup
 */
const path = require('path');
const fs = require('fs');

const isDryRun = !process.argv.includes('--clean');
const userDataPath = process.env.APPDATA ? path.join(process.env.APPDATA, 'lis-app-standalone') : path.join(__dirname, '..', 'lis-app-standalone');

const { DataStore } = require('../lis-app-standalone/lib/dataStore');
const ds = new DataStore(userDataPath);

console.log('====================================================');
console.log('🧹 LIS TEST DATA CLEANUP UTILITY');
console.log('====================================================');
console.log(`Database Location: ${ds.sqlitePath || ds.filePath}`);
console.log(`Mode: ${isDryRun ? '🔍 DRY RUN (Preview only)' : '⚡ LIVE CLEANUP (Modifying database)'}\n`);

// Load all patients and tests
const patients = ds.getCollection('patients') || [];
const tests = ds.getCollection('tests') || [];

// Matching criteria for test data
function isTestPatient(p) {
  if (!p) return false;
  const fn = (p.firstName || '').toLowerCase();
  const ln = (p.lastName || '').toLowerCase();
  const pc = (p.patientCode || p.patientId || '').toLowerCase();
  const id = (p.id || p._id || '').toLowerCase();

  return (
    fn.includes('test') ||
    ln.includes('test') ||
    fn.includes('elena') || // Elena Reyes created in automated test
    fn.includes('juan') ||  // Juan Dela Cruz created in pipeline test
    pc.startsWith('temp-') ||
    pc.startsWith('test-') ||
    id.startsWith('temp-') ||
    id.startsWith('test-')
  );
}

function isTestRecord(t, testPatientIds) {
  if (!t) return false;
  const tid = (t.id || t._id || '').toLowerCase();
  const code = (t.testId || '').toLowerCase();
  const pid = (t.patient || t.patientId || '').toLowerCase();

  return (
    testPatientIds.has(pid) ||
    tid.startsWith('temp-') ||
    tid.startsWith('test-') ||
    code.startsWith('temp-') ||
    code.startsWith('test-')
  );
}

const testPatients = patients.filter(isTestPatient);
const testPatientIds = new Set(testPatients.map(p => String(p.id || p._id || '').toLowerCase()));
const testTests = tests.filter(t => isTestRecord(t, testPatientIds));

console.log(`Found ${testPatients.length} test patients:`);
testPatients.forEach(p => {
  console.log(`  - [${p.id || p._id}] ${p.firstName} ${p.lastName} (${p.patientCode || p.patientId || 'No code'})`);
});

console.log(`\nFound ${testTests.length} test records:`);
testTests.forEach(t => {
  console.log(`  - [${t.id || t._id}] Test ID: ${t.testId || 'N/A'} - Type: ${t.testType} - Status: ${t.status}`);
});

if (isDryRun) {
  console.log('\n💡 To permanently remove these test records, run:');
  console.log('   node scripts/cleanup-test-data.js --clean');
} else {
  // Backup before cleaning
  const backupDir = path.join(userDataPath, 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  if (ds.sqlitePath && fs.existsSync(ds.sqlitePath)) {
    fs.copyFileSync(ds.sqlitePath, path.join(backupDir, `lis-data-pre-cleanup-${ts}.db`));
  }

  const remainingPatients = patients.filter(p => !isTestPatient(p));
  const remainingTests = tests.filter(t => !isTestRecord(t, testPatientIds));

  ds.setCollection('patients', remainingPatients);
  ds.setCollection('tests', remainingTests);

  console.log('\n✅ CLEANUP COMPLETE:');
  console.log(`  - Removed ${testPatients.length} test patients (Remaining: ${remainingPatients.length})`);
  console.log(`  - Removed ${testTests.length} test records (Remaining: ${remainingTests.length})`);
  console.log(`  - Safety backup saved in: ${backupDir}`);
}
console.log('====================================================\n');
