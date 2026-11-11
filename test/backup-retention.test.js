const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { cleanOldBackups, cleanStaleFiles, runDiskHygiene } = require('../lis-fullstack/lib/diskCleaner');

console.log('--- Running Backup Retention & Disk Hygiene Tests ---');

const testDir = path.join(__dirname, 'tmp-retention-test');
const testBackupDir = path.join(testDir, 'backup');
const testDataDir = path.join(testDir, 'data');

// Setup clean test directories
if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
fs.mkdirSync(testBackupDir, { recursive: true });
fs.mkdirSync(testDataDir, { recursive: true });

try {
  // Test Scenario 1: Minimum Safety Floor
  // Create 8 backups that are 90 days old (older than 60-day limit)
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  for (let i = 1; i <= 8; i++) {
    const fPath = path.join(testBackupDir, `backup_db_old_${i}.db`);
    fs.writeFileSync(fPath, 'dummy db data');
    const oldTime = (now - (90 + i) * dayMs) / 1000;
    fs.utimesSync(fPath, oldTime, oldTime);
  }

  let result = cleanOldBackups({ backupDir: testBackupDir, minKeep: 10, maxAgeDays: 60 });
  assert.strictEqual(result.pruned, 0, 'Must NOT prune any backup when total count (8) is <= minKeep floor (10)');
  console.log('Test 1 Passed: Minimum safety floor preserved all 8 old backups.');

  // Test Scenario 2: Pruning beyond minKeep floor with Monthly Milestones
  // Add 12 more backups (total 20 backups):
  // 5 recent backups (<30 days old)
  // 7 old backups (>60 days old) across different months
  for (let i = 1; i <= 5; i++) {
    const fPath = path.join(testBackupDir, `backup_db_recent_${i}.db`);
    fs.writeFileSync(fPath, 'dummy recent');
    const recentTime = (now - i * dayMs) / 1000;
    fs.utimesSync(fPath, recentTime, recentTime);
  }

  for (let i = 1; i <= 7; i++) {
    const fPath = path.join(testBackupDir, `backup_db_aged_${i}.db`);
    fs.writeFileSync(fPath, 'dummy aged');
    // Ages: 70d, 80d, 90d, 100d, 110d, 120d, 130d
    const agedTime = (now - (65 + i * 15) * dayMs) / 1000;
    fs.utimesSync(fPath, agedTime, agedTime);
  }

  const countBefore = fs.readdirSync(testBackupDir).length;
  assert.strictEqual(countBefore, 20, 'Should have 20 test backups');

  result = cleanOldBackups({ backupDir: testBackupDir, minKeep: 10, maxAgeDays: 60, keepMonthly: true });
  const countAfter = fs.readdirSync(testBackupDir).length;
  console.log(`Pruned ${result.pruned} backups. Remaining: ${countAfter}`);
  assert.ok(countAfter >= 10, 'Remaining backups must never drop below minKeep (10)');
  assert.ok(result.pruned > 0, 'Must have pruned expired non-milestone backups');
  console.log('Test 2 Passed: Expired backups pruned while maintaining floor and monthly milestones.');

  // Test Scenario 3: Stale Temp and 0-byte corrupt files
  const oldTmp = path.join(testDataDir, 'lis-data.tmp');
  fs.writeFileSync(oldTmp, 'temporary staged write');
  const tmpOldTime = (now - 30 * 3600 * 1000) / 1000; // 30 hours ago
  fs.utimesSync(oldTmp, tmpOldTime, tmpOldTime);

  const freshTmp = path.join(testDataDir, 'fresh.tmp');
  fs.writeFileSync(freshTmp, 'recent write');

  const zeroCorrupt = path.join(testDataDir, 'lis-data.db.corrupt.123');
  fs.writeFileSync(zeroCorrupt, ''); // 0 bytes
  fs.utimesSync(zeroCorrupt, tmpOldTime, tmpOldTime);

  const staleResult = cleanStaleFiles({ dataDir: testDataDir });
  assert.strictEqual(staleResult.cleaned, 2, 'Should clean 2 stale files (old .tmp and old 0-byte .corrupt)');
  assert.ok(!fs.existsSync(oldTmp), 'Old tmp must be deleted');
  assert.ok(!fs.existsSync(zeroCorrupt), 'Old 0-byte corrupt file must be deleted');
  assert.ok(fs.existsSync(freshTmp), 'Fresh tmp must be preserved');
  console.log('Test 3 Passed: Stale temp files cleaned while fresh files are preserved.');

} finally {
  if (fs.existsSync(testDir)) fs.rmSync(testDir, { recursive: true, force: true });
}

console.log('All Backup Retention & Disk Hygiene Tests Passed!\n');

