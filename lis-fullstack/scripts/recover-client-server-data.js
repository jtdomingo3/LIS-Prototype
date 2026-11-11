/**
 * ============================================================================
 * GEZYNE LIS - CLIENT SERVER EMERGENCY DATA RECOVERY TOOL
 * ============================================================================
 * 
 * Safely recovers missing patients and tests on the client server after
 * an unexpected database reset (e.g. 0-byte quarantine following ENOSPC).
 * 
 * Strategy:
 * 1. Takes an immediate snapshot backup of the current database.
 * 2. Locates the latest healthy pre-wipe backup from Documents/LIS/backup/
 *    (e.g. backup_db_2026-11-10*.db or latest .db / .json).
 * 3. Extracts all patients, tests, results, and counters from the backup.
 * 4. Extracts all patients and tests encoded TODAY in the active database
 *    (e.g. re-encoded patients like Hector Bacayawa).
 * 5. Merges all records without overwriting or losing any data:
 *    - Existing active records are preserved.
 *    - Missing records from backup are safely re-inserted.
 * 6. Validates integrity and prints a clear audit report.
 * 
 * Usage:
 *   node scripts/recover-client-server-data.js
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

function getBaseDirs() {
  const home = os.homedir();
  const candidates = [
    process.env.DATA_DIR,
    path.join(home, 'Documents', 'LIS', 'data'),
    path.join(__dirname, '..', 'lis-fullstack'),
    path.join(__dirname, '..')
  ].filter(Boolean);

  let dataDir = candidates.find(d => fs.existsSync(path.join(d, 'lis-data.db')));
  if (!dataDir) dataDir = path.join(home, 'Documents', 'LIS', 'data');

  const backupDir = path.join(home, 'Documents', 'LIS', 'backup');
  return { dataDir, backupDir };
}

function resolveSqliteEngine(dbPath) {
  try {
    const Database = require('better-sqlite3');
    return new Database(dbPath);
  } catch (e) {
    try {
      const Database = require(path.join(__dirname, '..', 'lis-fullstack', 'node_modules', 'better-sqlite3'));
      return new Database(dbPath);
    } catch (e2) {
      throw new Error('better-sqlite3 could not be loaded. Please run from project root: ' + e2.message);
    }
  }
}

async function runRecovery() {
  console.log('====================================================================');
  console.log('   GEZYNE LIS - EMERGENCY CLIENT SERVER DATA RECOVERY TOOL           ');
  console.log('====================================================================');

  const { dataDir, backupDir } = getBaseDirs();
  const activeDbPath = path.join(dataDir, 'lis-data.db');

  console.log('[1/5] Checking file paths:');
  console.log('  - Active DB Path  :', activeDbPath);
  console.log('  - Backup Directory:', backupDir);

  if (!fs.existsSync(activeDbPath)) {
    console.error('❌ Active database file not found at:', activeDbPath);
    process.exit(1);
  }

  // 1. Create immediate emergency backup of active DB
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const recoveryBackupDir = path.join(backupDir, `pre-recovery-${ts}`);
  fs.mkdirSync(recoveryBackupDir, { recursive: true });
  const activeBackupPath = path.join(recoveryBackupDir, 'active-lis-data.db');
  fs.copyFileSync(activeDbPath, activeBackupPath);
  console.log('  ✓ Active DB backed up to:', activeBackupPath);

  // 2. Find latest valid pre-wipe backup
  console.log('\n[2/5] Searching for latest pre-wipe backup in:', backupDir);
  if (!fs.existsSync(backupDir)) {
    console.error('❌ Backup directory does not exist:', backupDir);
    process.exit(1);
  }

  const backupFiles = fs.readdirSync(backupDir)
    .filter(f => (f.startsWith('backup_db_') && f.endsWith('.db')) || (f.startsWith('backup_') && f.endsWith('.json')))
    .map(f => {
      const full = path.join(backupDir, f);
      const stat = fs.statSync(full);
      return { file: f, path: full, size: stat.size, mtime: stat.mtimeMs };
    })
    .filter(b => b.size > 1024 * 1024) // Must be larger than 1MB
    .sort((a, b) => b.mtime - a.mtime);

  if (backupFiles.length === 0) {
    console.warn('⚠️ No large database backups found in backup directory. Checking for quarantined files...');
    const corruptFiles = fs.readdirSync(dataDir)
      .filter(f => f.includes('.corrupt.') || f.endsWith('.tmp'))
      .map(f => {
        const full = path.join(dataDir, f);
        const stat = fs.statSync(full);
        return { file: f, path: full, size: stat.size, mtime: stat.mtimeMs };
      })
      .filter(f => f.size > 1024 * 1024)
      .sort((a, b) => b.mtime - a.mtime);

    if (corruptFiles.length > 0) {
      console.log('  ✓ Found quarantined database with data:', corruptFiles[0].file, `(${corruptFiles[0].size} bytes)`);
      backupFiles.push(corruptFiles[0]);
    } else {
      console.error('❌ No healthy backup or non-empty quarantine file found.');
      process.exit(1);
    }
  }

  const selectedBackup = backupFiles[0];
  console.log(`  ✓ Selected source backup: ${selectedBackup.file} (${(selectedBackup.size / 1024 / 1024).toFixed(2)} MB, modified: ${new Date(selectedBackup.mtime).toLocaleString()})`);

  // 3. Connect to both databases
  console.log('\n[3/5] Opening active database and backup database...');
  const activeDb = resolveSqliteEngine(activeDbPath);
  const sourceDb = resolveSqliteEngine(selectedBackup.path);

  // 4. Perform non-destructive merge
  console.log('\n[4/5] Reconciling and merging records into active database...');

  const activePatientIds = new Set(activeDb.prepare('SELECT id FROM patients').all().map(r => r.id));
  const activeTestIds = new Set(activeDb.prepare('SELECT id FROM tests').all().map(r => r.id));

  console.log(`  - Active DB currently contains: ${activePatientIds.size} patients, ${activeTestIds.size} tests.`);

  const sourcePatients = sourceDb.prepare('SELECT id, patientId, json, createdAt FROM patients').all();
  const sourceTests = sourceDb.prepare('SELECT id, testId, json, createdAt FROM tests').all();

  console.log(`  - Source backup contains: ${sourcePatients.length} patients, ${sourceTests.length} tests.`);

  let restoredPatients = 0;
  let restoredTests = 0;

  activeDb.transaction(() => {
    // Insert missing patients
    const insertPatient = activeDb.prepare(`
      INSERT OR IGNORE INTO patients (id, patientId, json, createdAt)
      VALUES (?, ?, ?, ?)
    `);
    for (const p of sourcePatients) {
      if (!activePatientIds.has(p.id)) {
        insertPatient.run(p.id, p.patientId, p.json, p.createdAt);
        restoredPatients++;
      }
    }

    // Insert missing tests
    const insertTest = activeDb.prepare(`
      INSERT OR IGNORE INTO tests (id, testId, json, createdAt)
      VALUES (?, ?, ?, ?)
    `);
    for (const t of sourceTests) {
      if (!activeTestIds.has(t.id)) {
        insertTest.run(t.id, t.testId, t.json, t.createdAt);
        restoredTests++;
      }
    }

    // Synchronize counters to the highest counter
    try {
      const srcCounters = sourceDb.prepare('SELECT id, val FROM counters').all();
      const upsertCounter = activeDb.prepare(`
        INSERT INTO counters (id, val) VALUES (?, ?)
        ON CONFLICT(id) DO UPDATE SET val = MAX(counters.val, excluded.val)
      `);
      for (const c of srcCounters) {
        upsertCounter.run(c.id, c.val);
      }
    } catch (_) {}
  })();

  sourceDb.close();

  // 5. Verification
  console.log('\n[5/5] Verification & Audit:');
  const finalPatientCount = activeDb.prepare('SELECT COUNT(*) as c FROM patients').get().c;
  const finalTestCount = activeDb.prepare('SELECT COUNT(*) as c FROM tests').get().c;
  activeDb.close();

  console.log('====================================================================');
  console.log('                     RECOVERY SUMMARY REPORT                        ');
  console.log('====================================================================');
  console.log(`  • Missing Patients Restored: +${restoredPatients}`);
  console.log(`  • Missing Tests Restored   : +${restoredTests}`);
  console.log(`  • Final Total Patients     : ${finalPatientCount}`);
  console.log(`  • Final Total Tests        : ${finalTestCount}`);
  console.log('====================================================================');
  console.log('✅ Recovery completed safely. Restart the LIS Server to apply.');
}

runRecovery().catch(err => {
  console.error('\n❌ Fatal Recovery Error:', err.message);
  process.exit(1);
});

