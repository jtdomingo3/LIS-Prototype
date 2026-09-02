const path = require('path');
const fs = require('fs');
const { DataStore } = require('./lib/dataStore');
const { createOfflineDb } = require('./lib/offlineDb');

function assert(condition, message) {
  if (!condition) {
    console.error('FAIL:', message);
    process.exit(1);
  }
}

(async () => {
  const tmpDir = path.join(__dirname, 'tmp-test-sqlite');
  try { if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  fs.mkdirSync(tmpDir, { recursive: true });

  console.log('--- Test 1: Fresh SQLite DataStore creation ---');
  const ds1 = new DataStore(path.join(tmpDir, 'store1'));
  ds1.setCollection('patients', [
    { id: 'p1', patientId: 'PID-001', firstName: 'John', lastName: 'Doe', createdAt: new Date().toISOString() }
  ]);
  ds1.setCollection('tests', [
    { id: 't1', testId: 'TID-001', patient: 'p1', testType: 'CBC', status: 'Completed', updatedAt: new Date().toISOString() }
  ]);
  ds1.setMeta('lastFullSync', '2026-08-30T12:00:00Z');

  const pList = ds1.getCollection('patients');
  assert(pList.length === 1 && pList[0].firstName === 'John', 'Patient collection write/read failed');
  const tList = ds1.getCollection('tests');
  assert(tList.length === 1 && tList[0].testType === 'CBC', 'Test collection write/read failed');
  assert(ds1.getMeta('lastFullSync') === '2026-08-30T12:00:00Z', 'Meta write/read failed');
  console.log('✓ Fresh SQLite DataStore creation passed');

  console.log('--- Test 2: offlineDb global.db interface compatibility ---');
  const db = createOfflineDb(ds1);
  const p = db.getPatientById('p1');
  assert(p && p.lastName === 'Doe', 'getPatientById failed');
  const t = db.getTestById('t1');
  assert(t && t.status === 'Completed', 'getTestById failed');
  console.log('✓ offlineDb compatibility passed');

  console.log('--- Test 3: Auto-migration from legacy data.json ---');
  const store2Dir = path.join(tmpDir, 'store2');
  fs.mkdirSync(store2Dir, { recursive: true });
  const sampleJson = {
    patients: [
      { id: 'p-migrated-1', patientId: 'MIG-01', firstName: 'Maria', lastName: 'Santos', createdAt: new Date().toISOString() }
    ],
    tests: [
      { id: 't-migrated-1', testId: 'MIG-T01', patient: 'p-migrated-1', testType: 'Urinalysis', status: 'Pending', createdAt: new Date().toISOString() }
    ],
    users: [
      { id: 'u1', email: 'admin@gezyne.com', role: 'Admin', password: '$2a$10$encryptedhash' }
    ],
    counters: { patient: 42 },
    settings: { clinicName: 'Gezyne Clinical Laboratory' },
    __meta: { lastFullSync: '2026-08-01T00:00:00Z' }
  };
  fs.writeFileSync(path.join(store2Dir, 'data.json'), JSON.stringify(sampleJson, null, 2), 'utf8');

  // Instantiate DataStore on store2Dir -> should auto migrate to lis-data.db and rename data.json to data.json.migrated
  const ds2 = new DataStore(store2Dir);
  const migPatients = ds2.getCollection('patients');
  const migTests = ds2.getCollection('tests');
  const migUsers = ds2.getCollection('users');
  const migCounters = ds2.getCollection('counters');
  const migMeta = ds2.getMeta('lastFullSync');

  assert(migPatients.length === 1 && migPatients[0].firstName === 'Maria', 'Migrated patient count/data mismatch');
  assert(migTests.length === 1 && migTests[0].testType === 'Urinalysis', 'Migrated test count/data mismatch');
  assert(migUsers.length === 1 && migUsers[0].email === 'admin@gezyne.com', 'Migrated user count/data mismatch');
  assert(migCounters.patient === 42, 'Migrated counter mismatch');
  assert(migMeta === '2026-08-01T00:00:00Z', 'Migrated meta mismatch');
  assert(fs.existsSync(path.join(store2Dir, 'data.json.migrated')), 'data.json was not renamed to .migrated');
  console.log('✓ Auto-migration passed');

  console.log('ALL SQLITE DATASTORE TESTS PASSED!');
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  process.exit(0);
})();
