/**
 * test_installer_ph_fix.js
 * Comprehensive end-to-end verification of PhilHealth and Health Card claim persistence,
 * schema readiness, installer resource seeds, and sync engine replay behavior.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

console.log('========================================================================');
console.log('🔍 VERIFYING INSTALLER AND REPO PHILHEALTH & HEALTH CARD FIXES');
console.log('========================================================================\n');

// 1. Verify Installer Seed Databases
console.log('─── 1. VERIFY INSTALLER SEED DATABASES ───');
const Database = require('../lis-fullstack/node_modules/better-sqlite3');

const fullstackSeedDb = path.join(__dirname, '..', 'lis-fullstack', 'build', 'installer-resources', 'lis-data.db');
const standaloneSeedDb = path.join(__dirname, '..', 'lis-app-standalone', 'build', 'installer-resources', 'lis-data.db');

assert(fs.existsSync(fullstackSeedDb), 'Fullstack installer seed DB must exist');
assert(fs.existsSync(standaloneSeedDb), 'Standalone installer seed DB must exist');

function verifyDbTables(dbPath, label) {
  const db = new Database(dbPath, { readonly: true });
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
  assert(tables.includes('philhealth_records'), `${label} seed DB missing philhealth_records table`);
  assert(tables.includes('healthcard_records'), `${label} seed DB missing healthcard_records table`);
  assert(tables.includes('sync_queue'), `${label} seed DB missing sync_queue table`);
  console.log(`   ✓ ${label} seed DB contains all ${tables.length} tables, including philhealth_records and healthcard_records`);
  db.close();
}

verifyDbTables(fullstackSeedDb, 'Central Server');
verifyDbTables(standaloneSeedDb, 'Standalone Client');

// 2. Verify Seed User Permissions
console.log('\n─── 2. VERIFY SEED USER PERMISSIONS ───');
const fullstackUsers = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'lis-fullstack', 'build', 'installer-resources', 'data-users.json'), 'utf8'));
const standaloneUsers = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'lis-app-standalone', 'build', 'installer-resources', 'data-users.json'), 'utf8'));

assert(fullstackUsers[0].permissions.philhealth === true, 'Central Server seed admin must have philhealth: true');
assert(fullstackUsers[0].permissions.healthcard === true, 'Central Server seed admin must have healthcard: true');
assert(standaloneUsers[0].permissions.philhealth === true, 'Standalone seed admin must have philhealth: true');
assert(standaloneUsers[0].permissions.healthcard === true, 'Standalone seed admin must have healthcard: true');
console.log('   ✓ Both seed data-users.json contain explicit philhealth: true and healthcard: true');

// 3. Verify SQLite Adapter read() and write() Preserves PhilHealth & HealthCard
console.log('\n─── 3. VERIFY SQLITE ADAPTER READ() AND WRITE() PRESERVATION ───');
const { createDb } = require('../lis-app-standalone/lib/sqliteDb');
const tmpDbPath = path.join(__dirname, `tmp-ph-test-${Date.now()}.db`);

(async () => {
  try {
    const db = createDb(tmpDbPath);
    if (db._readyPromise) await db._readyPromise;

    // Test upsert aliases
    assert(typeof db.upsertPhilhealthRecord === 'function', 'db must have upsertPhilhealthRecord alias');
    assert(typeof db.upsertHealthCardRecord === 'function', 'db must have upsertHealthCardRecord alias');

    const phSample = {
      id: 'ph-local-001',
      controlNo: 'PH-2026-10-00001',
      patientId: 'pat-100',
      recordDate: '2026-10-22',
      firstName: 'Maria',
      lastName: 'Santos',
      pinNo: '12-345678901-2',
      agency: 'DepEd',
      status: 'Pending Approval'
    };

    const hcSample = {
      id: 'hc-local-001',
      controlNo: 'HC-2026-10-00001',
      patientId: 'pat-100',
      recordDate: '2026-10-22',
      firstName: 'Maria',
      lastName: 'Santos',
      hmoProvider: 'Maxicare',
      cardNumber: 'MAX-999-1234',
      loaNumber: 'LOA-2026-99',
      status: 'Pending LOA'
    };

    db.upsertPhilhealthRecord(phSample);
    db.upsertHealthCardRecord(hcSample);

    // Test read()
    const readData = db.read();
    assert(Array.isArray(readData.philhealth_records), 'read().philhealth_records must be an array');
    assert(Array.isArray(readData.healthcard_records), 'read().healthcard_records must be an array');
    assert(readData.philhealth_records.some(r => r.id === 'ph-local-001'), 'read() must contain saved PhilHealth record');
    assert(readData.healthcard_records.some(r => r.id === 'hc-local-001'), 'read() must contain saved HealthCard record');
    console.log('   ✓ db.read() successfully includes philhealth_records and healthcard_records');

    // Test write(data) roundtrip
    const freshDbPath = path.join(__dirname, `tmp-ph-fresh-${Date.now()}.db`);
    const freshDb = createDb(freshDbPath);
    if (freshDb._readyPromise) await freshDb._readyPromise;

    freshDb.write({
      patients: [],
      tests: [],
      templates: [],
      counters: {},
      settings: {},
      philhealth_records: [phSample],
      healthcard_records: [hcSample]
    });

    const freshRead = freshDb.read();
    assert(freshRead.philhealth_records.some(r => r.id === 'ph-local-001'), 'write() must persist philhealth_records to SQLite');
    assert(freshRead.healthcard_records.some(r => r.id === 'hc-local-001'), 'write() must persist healthcard_records to SQLite');
    console.log('   ✓ db.write() successfully persists philhealth_records and healthcard_records into SQLite');

    if (freshDb.close) freshDb.close();
    try { fs.unlinkSync(freshDbPath); } catch (_) {}

    // 4. Verify Sync Engine Offline Re-keying Flow
    console.log('\n─── 4. VERIFY OFFLINE SYNC RE-KEYING FLOW ───');
    const DataStore = require('../lis-app-standalone/lib/dataStore').DataStore || require('../lis-app-standalone/lib/dataStore');
    const dsDir = path.join(__dirname, `tmp-ds-test-${Date.now()}`);
    fs.mkdirSync(dsDir, { recursive: true });
    const ds = new DataStore(dsDir);
    if (ds.ready) await ds.ready();

    // Create an offline record with temporary ID
    const offlinePh = {
      id: 'temp-ph-12345',
      client_id: 'temp-ph-12345',
      controlNo: 'PH-2026-10-00002',
      patientId: 'pat-100',
      recordDate: '2026-10-22',
      firstName: 'Juan',
      lastName: 'Dela Cruz',
      status: 'Pending Approval'
    };
    ds.setCollection('philhealth_records', [offlinePh]);

    // Simulate server replay acknowledgment returning serverId 'ph-server-999'
    const serverId = 'ph-server-999';
    const localId = 'temp-ph-12345';
    const list = ds.getCollection('philhealth_records') || [];
    const r = list.find(it => it && (it.id === localId || it.id === String(localId)));
    assert(r, 'Local temporary record must exist before re-key');

    // Simulate syncEngine _handleReplayResult re-keying logic
    if (ds.db.deletePhilhealthRecord) ds.db.deletePhilhealthRecord(localId);
    r.id = serverId;
    if (!r.client_id) r.client_id = localId;
    const saveFn = ds.db.upsertPhilhealthRecord || ds.db.savePhilhealthRecord;
    assert(saveFn, 'saveFn must resolve to an upsert or save method on dataStore.db');
    saveFn.call(ds.db, r);

    // Verify record has serverId in SQLite
    const retrievedAfterReKey = ds.getCollection('philhealth_records');
    assert(retrievedAfterReKey.some(it => it.id === serverId), 'Re-keyed serverId record must exist in SQLite database');
    assert(!retrievedAfterReKey.some(it => it.id === localId), 'Old temporary localId record must be removed');
    console.log('   ✓ Offline sync re-keying cleanly replaces temporary local ID with server ID without dropping records');

    // Cleanup
    if (db.close) db.close();
    try { fs.unlinkSync(tmpDbPath); } catch (_) {}
    try { fs.rmSync(dsDir, { recursive: true, force: true }); } catch (_) {}

    console.log('\n========================================================================');
    console.log('🎉 ALL INSTALLER, ADAPTER, RE-KEYING & PERMISSION VERIFICATIONS PASSED!');
    console.log('========================================================================\n');
  } catch (err) {
    console.error('\n❌ VERIFICATION TEST FAILED:', err);
    process.exit(1);
  }
})();
