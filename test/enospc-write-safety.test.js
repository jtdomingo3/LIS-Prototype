const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createDb, findLatestHealthyBackup } = require('../lis-fullstack/lib/sqliteDb');

console.log('--- Running ENOSPC Write Safety & Auto-Recovery Tests ---');

const testDir = path.join(__dirname, 'tmp-enospc-test');
const testDbPath = path.join(testDir, 'lis-data.db');

if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
fs.mkdirSync(testDir, { recursive: true });

(async () => {
  try {
    // 1. Initialize a healthy database with 5 test patients
    const db = createDb(testDbPath);
    if (db._readyPromise) await db._readyPromise;

    const seedPatients = [
      { id: 'p1', patientId: 'PID-1', firstName: 'Juan', lastName: 'Dela Cruz', createdAt: '2026-11-10T10:00:00.000Z' },
      { id: 'p2', patientId: 'PID-2', firstName: 'Maria', lastName: 'Santos', createdAt: '2026-11-10T11:00:00.000Z' },
      { id: 'p3', patientId: 'PID-3', firstName: 'Pedro', lastName: 'Reyes', createdAt: '2026-11-10T12:00:00.000Z' },
      { id: 'p4', patientId: 'PID-4', firstName: 'Ana', lastName: 'Aquino', createdAt: '2026-11-10T13:00:00.000Z' },
      { id: 'p5', patientId: 'PID-5', firstName: 'Carlos', lastName: 'Garcia', createdAt: '2026-11-10T14:00:00.000Z' }
    ];

    db.savePatients(seedPatients);
    if (typeof db.checkpoint === 'function') db.checkpoint();

    const initialStat = fs.statSync(testDbPath);
    assert.ok(initialStat.size > 0, 'Database file must have non-zero size');
    console.log(`Test DB initialized: ${initialStat.size} bytes, ${db.getPatients().length} patients.`);

    // 2. Simulate ENOSPC during staged write:
    // If fs.writeFileSync throws ENOSPC when writing to the .tmp file,
    // the original testDbPath must remain COMPLETELY UNTOUCHED (not truncated to 0 bytes).
    const originalWriteFileSync = fs.writeFileSync;
    let enospcTriggered = false;

    // Intercept fs.writeFileSync to throw ENOSPC on .tmp file writes
    fs.writeFileSync = function (filePath, data, options) {
      if (typeof filePath === 'string' && filePath.endsWith('.tmp')) {
        enospcTriggered = true;
        const err = new Error('ENOSPC: no space left on device, write');
        err.code = 'ENOSPC';
        throw err;
      }
      return originalWriteFileSync.apply(this, arguments);
    };

    try {
      db.upsertPatient({ id: 'p6', patientId: 'PID-6', firstName: 'Elena', lastName: 'Ramos', createdAt: '2026-11-11T08:00:00.000Z' });
      if (typeof db.checkpoint === 'function') {
        db.checkpoint();
      }
    } catch (e) {
      // expected or caught
    } finally {
      fs.writeFileSync = originalWriteFileSync;
    }

    // Verify: The existing DB file must still exist and must NOT be 0 bytes!
    const postEnospcStat = fs.statSync(testDbPath);
    assert.ok(postEnospcStat.size > 0, 'CRITICAL: Database file must NEVER be truncated to 0 bytes when disk is full');
    console.log(`Test 1 Passed: Database remained safe (${postEnospcStat.size} bytes) despite ENOSPC simulation.`);

    // 3. Test Auto-Recovery from Backup when 0-byte database is encountered:
    // Create a mock backup in test directory
    const mockBackupDir = path.join(testDir, 'backup');
    fs.mkdirSync(mockBackupDir, { recursive: true });
    const mockBackupFile = path.join(mockBackupDir, 'backup_db_healthy.db');
    fs.copyFileSync(testDbPath, mockBackupFile);

    // Close open handle
    db.close();

    // Now corrupt the primary DB file by truncating to 0 bytes (simulating the bug that wiped the client's database)
    fs.writeFileSync(testDbPath, '');
    assert.strictEqual(fs.statSync(testDbPath).size, 0, 'Test setup: DB is 0 bytes');

    // Verify findLatestHealthyBackup discovers our backup
    const healthyBackup = findLatestHealthyBackup(testDbPath);
    console.log('Latest healthy backup found:', healthyBackup ? path.basename(healthyBackup) : 'None');
    assert.ok(healthyBackup, 'Must find a healthy backup for recovery');

    // Now re-initialize createDb on the 0-byte file:
    // It should automatically recover from backup rather than wiping data!
    console.log('Testing createDb auto-recovery on 0-byte database...');
    const recoveredDb = createDb(testDbPath);
    if (recoveredDb._readyPromise) await recoveredDb._readyPromise;

    const recoveredPatients = recoveredDb.getPatients();
    console.log(`Recovered patients count: ${recoveredPatients.length}`);
    assert.ok(recoveredPatients.length >= 5, 'Must have auto-recovered all clinical patients from backup');
    assert.ok(recoveredPatients.some(p => p.firstName === 'Juan'), 'Juan must be present in recovered database');
    assert.ok(recoveredPatients.some(p => p.firstName === 'Elena'), 'Elena must be present in recovered database');
    console.log('Test 2 Passed: 0-byte database was auto-recovered from healthy backup without data loss!');

    recoveredDb.close();
    console.log('All ENOSPC Write Safety & Recovery Tests Passed!\n');
  } catch (err) {
    console.error('Test Failed:', err);
    process.exit(1);
  } finally {
    if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
  }
})();
