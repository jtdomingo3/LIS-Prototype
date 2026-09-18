/**
 * Unit Test: Offline Deletion & Server Sync Verification
 * File: test/standalone-offline-deletion-sync.test.js
 */
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { DataStore } = require('../lis-app-standalone/lib/dataStore');
const { OperationQueue } = require('../lis-app-standalone/lib/operationQueue');
const { SyncEngine } = require('../lis-app-standalone/lib/syncEngine');
const Patient = require('../lis-app-standalone/models/Patient');
const Test = require('../lis-app-standalone/models/Test');

async function runDeletionSyncTest() {
  console.log('----------------------------------------------------');
  console.log('🧪 TEST 6: Offline Record Deletion & Sync Persistence');
  console.log('----------------------------------------------------\n');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lis-del-test-'));
  const ds = new DataStore(tmpDir);
  const queue = new OperationQueue(tmpDir);
  const config = { SERVER_URL: 'http://127.0.0.1:3000', MAX_SYNC_RETRIES: 3 };
  const engine = new SyncEngine(queue, config, ds);

  global.db = {
    getPatients: () => ds.getCollection('patients'),
    savePatients: (p) => ds.setCollection('patients', p),
    getTests: () => ds.getCollection('tests'),
    saveTests: (t) => ds.setCollection('tests', t),
    getCounters: () => ds.getCollection('counters'),
    saveCounters: (c) => ds.setCollection('counters', c),
    getUsers: () => ds.getCollection('users'),
    saveUsers: (u) => ds.setCollection('users', u),
    getTemplates: () => ds.getCollection('templates'),
    saveTemplates: (t) => ds.setCollection('templates', t),
    read: () => ds.getAll(),
    write: (data) => ds.db.write(data)
  };

  try {
    // 1. Create Patient and Test offline
    console.log('1. Creating Patient and Test records offline...');
    const patient = new Patient({
      firstName: 'ToDelete',
      lastName: 'Patient',
      gender: 'Male',
      dateOfBirth: '1990-01-01'
    });
    await patient.save();

    const test = new Test({
      patient: patient.id,
      testType: 'Complete Blood Count (CBC)',
      status: 'Payment Area'
    });
    await test.save();

    assert.strictEqual(ds.getCollection('patients').length, 1);
    assert.strictEqual(ds.getCollection('tests').length, 1);
    console.log(`   ✓ Patient (${patient.id}) and Test (${test.id}) created locally`);

    // 2. Perform Cascade Deletion offline
    console.log('\n2. Performing Patient deletion (with test cascade)...');
    
    // Simulate routes/patients.js delete route
    const associatedTests = await Test.find({ patient: patient.id });
    for (const t of associatedTests) {
      await Test.findByIdAndDelete(t.id);
      queue.add({
        method: 'DELETE',
        url: `${config.SERVER_URL}/tests/${t.id}`,
        body: {}
      });
    }

    await Patient.findByIdAndDelete(patient.id);
    queue.add({
      method: 'DELETE',
      url: `${config.SERVER_URL}/patients/${patient.id}`,
      body: {}
    });

    // 3. Verify Local SQLite State
    console.log('\n3. Verifying local DataStore after deletion...');
    assert.strictEqual(ds.getCollection('patients').length, 0, 'Patients collection should be empty');
    assert.strictEqual(ds.getCollection('tests').length, 0, 'Tests collection should be empty');
    console.log('   ✓ Local SQLite DataStore has 0 patients and 0 tests');

    // 4. Verify OperationQueue has DELETE mutations
    console.log('\n4. Verifying OperationQueue recorded DELETE methods...');
    const pending = queue.getPending();
    assert.strictEqual(pending.length, 2, 'Should have 2 DELETE operations queued');
    assert.strictEqual(pending[0].method, 'DELETE', 'Test deletion should have method DELETE');
    assert.strictEqual(pending[1].method, 'DELETE', 'Patient deletion should have method DELETE');
    console.log(`   ✓ OperationQueue recorded: ${pending.map(p => `${p.method} ${p.url}`).join(' | ')}`);

    console.log('\n✅ TEST 6 PASSED: Deletion persistence & DELETE queueing verified.\n');
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
}

if (require.main === module) {
  runDeletionSyncTest().catch((err) => {
    console.error('❌ Deletion Sync Test failed:', err);
    process.exit(1);
  });
}

module.exports = { runDeletionSyncTest };
