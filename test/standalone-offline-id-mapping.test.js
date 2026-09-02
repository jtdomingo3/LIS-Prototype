/**
 * Test Suite 4: Offline Mutation Queue & Deterministic ID Mapping
 * Directory: test/standalone-offline-id-mapping.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { OperationQueue } = require('../lis-app-standalone/lib/operationQueue');
const { DataStore } = require('../lis-app-standalone/lib/dataStore');

async function runQueueIdMappingTests() {
  console.log('----------------------------------------------------');
  console.log('🧪 TEST 4: Offline Queue & Deterministic ID Mapping');
  console.log('----------------------------------------------------');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lis-test-mapping-'));
  const queue = new OperationQueue(tmpDir);
  const dataStore = new DataStore(tmpDir);
  queue.dataStore = dataStore;

  try {
    const tempPatientId = 'temp-pat-abc-123';
    const tempTestId = 'temp-tst-xyz-789';

    // 1. Save local records in SQLite DataStore with temp IDs
    console.log('1. Writing records with temp IDs to SQLite...');
    dataStore.setCollection('patients', [
      { id: tempPatientId, firstName: 'Roberto', lastName: 'Gomez', phone: '09175551234' }
    ]);
    dataStore.setCollection('tests', [
      { id: tempTestId, patient: tempPatientId, testType: 'Fasting Blood Sugar', status: 'Payment Area' }
    ]);

    assert.strictEqual(dataStore.getCollection('patients').length, 1);
    assert.strictEqual(dataStore.getCollection('tests').length, 1);
    console.log('   ✓ Initial records created with temp IDs');

    // 2. Queue chained operations referencing temp IDs
    console.log('2. Adding chained mutation operations to Queue...');
    queue.add({
      method: 'POST',
      url: 'http://127.0.0.1:3000/patients',
      body: { id: tempPatientId, firstName: 'Roberto', lastName: 'Gomez' }
    });

    queue.add({
      method: 'POST',
      url: 'http://127.0.0.1:3000/tests',
      body: {
        patient: tempPatientId,
        createdTests: [{ id: tempTestId, patient: tempPatientId, testType: 'Fasting Blood Sugar' }]
      }
    });

    queue.add({
      method: 'POST',
      url: `http://127.0.0.1:3000/tests/${tempTestId}/results`,
      body: { fbs_value: '95', status: 'Completed' }
    });

    assert.strictEqual(queue.countPending(), 3);
    console.log('   ✓ 3 dependent operations queued');

    // 3. Simulate Server ID resolution for Patient: temp-pat-abc-123 -> srv-pat-uuid-999
    console.log('3. Simulating server ID resolution for Patient...');
    const serverPatId = 'srv-pat-uuid-999';
    queue.replaceTempId(tempPatientId, serverPatId);

    // Verify SQLite DataStore was updated
    const updatedPatients = dataStore.getCollection('patients');
    assert.strictEqual(updatedPatients[0].id, serverPatId, 'Patient id in SQLite should be updated to serverPatId');

    // Verify tests pointing to patient were updated
    const updatedTests = dataStore.getCollection('tests');
    assert.strictEqual(updatedTests[0].patient, serverPatId, 'Test patient reference in SQLite should be updated');

    // Verify pending operations in queue were rewritten
    const pendingOps1 = queue.getPending();
    assert.strictEqual(pendingOps1[1].body.patient, serverPatId, 'Queued test mutation body.patient should be updated');
    console.log('   ✓ replaceTempId updated Patient ID across SQLite DataStore and queued operations');

    // 4. Simulate Server ID resolution for Test: temp-tst-xyz-789 -> srv-tst-uuid-888
    console.log('4. Simulating server ID resolution for Test...');
    const serverTestId = 'srv-tst-uuid-888';
    queue.replaceTempId(tempTestId, serverTestId);

    const updatedTests2 = dataStore.getCollection('tests');
    assert.strictEqual(updatedTests2[0].id, serverTestId, 'Test id in SQLite should be updated to serverTestId');

    // Verify queued result entry URL was rewritten
    const pendingOps2 = queue.getPending();
    assert.ok(pendingOps2[2].url.includes(serverTestId), 'Queued result operation URL should contain new serverTestId');
    console.log('   ✓ replaceTempId updated Test ID across SQLite and operation URLs');

    console.log('✅ TEST 4 PASSED: Offline Queue & Deterministic ID Mapping verified.\n');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  runQueueIdMappingTests().catch(err => {
    console.error('❌ TEST 4 FAILED:', err);
    process.exit(1);
  });
}

module.exports = { runQueueIdMappingTests };
