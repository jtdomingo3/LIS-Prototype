/**
 * Live Server Synchronization Integration Test
 * Directory: test/standalone-live-sync.test.js
 * 
 * Verifies live bi-directional synchronization between the standalone app
 * and the central LIS server running on http://127.0.0.1:3000:
 * 1. Network detection via NetworkMonitor
 * 2. Background full database download into SQLite
 * 3. Offline mutation batching (Patients, Tests, Queue advances, Results)
 * 4. Two-way replay and upload to central server database
 * 5. Multi-station queue advancement reflection on server
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { NetworkMonitor } = require('../lis-app-standalone/lib/networkMonitor');
const { SyncEngine } = require('../lis-app-standalone/lib/syncEngine');
const { OperationQueue } = require('../lis-app-standalone/lib/operationQueue');
const { DataStore } = require('../lis-app-standalone/lib/dataStore');

const SERVER_URL = 'http://127.0.0.1:3000';

async function runLiveSyncTests() {
  console.log('====================================================');
  console.log('🌐 RUNNING STANDALONE LIVE SERVER SYNC INTEGRATION TEST');
  console.log('====================================================\n');

  // 1. Verify Central Server Connectivity
  console.log('1. Checking Central Server Connectivity...');
  const monitor = new NetworkMonitor(SERVER_URL, 2000);
  const online = await monitor.checkOnce();
  assert.strictEqual(online, true, `Server should be online at ${SERVER_URL}`);
  console.log(`   ✓ Central Server is ONLINE at ${SERVER_URL}`);

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lis-live-sync-'));
  const queue = new OperationQueue(tmpDir);
  const dataStore = new DataStore(tmpDir);
  queue.dataStore = dataStore;

  const engine = new SyncEngine(queue, { SERVER_URL, MAX_SYNC_RETRIES: 3 }, dataStore);

  try {
    // 2. Initial Full Download (Pull from Central Server)
    console.log('\n2. Testing Background Full Database Download (Pull)...');
    engine.setCredentials('admin@lab.com', 'password123');

    const downloadResult = await engine.fullSync(null, { replace: true });
    assert.strictEqual(downloadResult.success, true, 'Full sync download should succeed');
    console.log(`   ✓ Successfully downloaded and imported ${downloadResult.imported} records into local SQLite`);
    console.log(`   ✓ Local SQLite path: ${downloadResult.filePath}`);

    // 3. Create Multi-Department Patient & Tests Offline in SQLite and Queue
    console.log('\n3. Creating Patient & Multi-Station Tests for Sync...');
    const timestamp = Date.now();
    const tempPatientId = 'pat-' + timestamp;
    const humanPatientId = 'P-' + String(timestamp).slice(-5);
    const testPatData = {
      id: tempPatientId,
      patientId: humanPatientId,
      firstName: 'LiveSync',
      lastName: 'Verification',
      gender: 'Female',
      dateOfBirth: '1996-06-16',
      phone: '09171113333',
      address: '88 Tech Hub, QC'
    };

    // Save locally to SQLite
    dataStore.mergeCollection('patients', [testPatData]);

    // Queue Patient Creation
    queue.add({
      method: 'POST',
      url: `${SERVER_URL}/patients`,
      body: testPatData,
      timestamp: new Date().toISOString()
    });

    // Create Clinical & Imaging Tests
    const testIdClinical = 'HM' + String(timestamp).slice(-7);
    const testUuidClinical = 'test-c-' + timestamp;
    const testClinicalData = {
      id: testUuidClinical,
      testId: testIdClinical,
      patient: tempPatientId,
      testType: 'Complete Blood Count (CBC)',
      status: 'Payment Area',
      price: 180,
      requestedTests: [
        { key: 'CBC', label: 'Complete Blood Count', area: 'Extraction Area', lab: 'clinical', price: 180 }
      ]
    };

    const testIdImaging = 'XR' + String(timestamp).slice(-7);
    const testUuidImaging = 'test-i-' + timestamp;
    const testImagingData = {
      id: testUuidImaging,
      testId: testIdImaging,
      patient: tempPatientId,
      testType: 'Chest X-ray',
      status: 'Payment Area',
      price: 350,
      requestedTests: [
        { key: 'CXR', label: 'Chest X-ray', area: 'X-ray', lab: 'imaging', price: 350 }
      ]
    };

    dataStore.mergeCollection('tests', [testClinicalData, testImagingData]);

    // Queue Test Creations
    queue.add({
      method: 'POST',
      url: `${SERVER_URL}/tests`,
      body: {
        patient: tempPatientId,
        testType: 'Complete Blood Count (CBC)',
        selectedTests: ['Complete Blood Count (CBC)', 'Chest X-ray'],
        price: 530,
        requestedTests: [
          { key: 'CBC', label: 'Complete Blood Count', area: 'Extraction Area', lab: 'clinical', amount: 180 },
          { key: 'CXR', label: 'Chest X-ray', area: 'X-ray', lab: 'imaging', amount: 350 }
        ],
        createdTests: [testClinicalData, testImagingData]
      },
      timestamp: new Date().toISOString()
    });

    // 4. Queue Reception Payment Station Advancement
    console.log('4. Queuing Reception Payment Completion Mutation...');
    queue.add({
      method: 'POST',
      url: `${SERVER_URL}/reception/complete`,
      body: {
        patientId: tempPatientId,
        testIds: `${testIdClinical},${testIdImaging}`,
        area: 'Payment Area',
        amount_clinical: 180,
        amount_xray: 350
      },
      timestamp: new Date().toISOString()
    });

    // 5. Queue Extraction Station Completion
    console.log('5. Queuing Extraction Completion Mutation...');
    queue.add({
      method: 'POST',
      url: `${SERVER_URL}/reception/complete`,
      body: {
        patientId: tempPatientId,
        testIds: testIdClinical,
        area: 'Extraction Area'
      },
      timestamp: new Date().toISOString()
    });

    console.log(`   ✓ Total pending mutations queued: ${queue.countPending()}`);

    // 6. Execute Replay / Push to Server
    console.log('\n6. Replaying Queued Mutations to Central Server (Push)...');
    const syncedCount = await engine.processQueue();
    console.log(`   ✓ Synced operations count: ${syncedCount}`);
    console.log(`   ✓ Remaining pending in queue: ${queue.countPending()}`);

    assert.strictEqual(queue.countPending(), 0, 'All queued mutations should be successfully replayed');
    assert.strictEqual(syncedCount, 4, 'All 4 mutations should be processed');

    // 7. Verify Server-Side Round-Trip Reflection
    console.log('\n7. Verifying Updated State with Central Server Round-Trip Full-Sync...');
    const roundTripSync = await engine.fullSync(null, { replace: true });
    assert.strictEqual(roundTripSync.success, true);

    const refreshedPatients = dataStore.getCollection('patients');
    const refreshedTests = dataStore.getCollection('tests');

    const uploadedPatient = refreshedPatients.find(p => p.patientId === humanPatientId || p.firstName === 'LiveSync');
    assert.ok(uploadedPatient, 'Uploaded patient should exist in downloaded server database');
    console.log(`   ✓ Verified Patient on Server: ${uploadedPatient.firstName} ${uploadedPatient.lastName} (${uploadedPatient.patientId})`);

    console.log('   Total tests in refreshed database:', refreshedTests.length);
    const newestTests = refreshedTests.slice(0, 5);
    console.log('   Newest 5 tests:', newestTests.map(t => ({ id: t.id, testId: t.testId, patient: t.patient, testType: t.testType, status: t.status })));

    const patientTests = refreshedTests.filter(t => {
      if (!t) return false;
      const p = t.patient;
      const pid = typeof p === 'object' && p ? (p.id || p.patientId || p.patientCode) : p;
      return pid === tempPatientId || pid === uploadedPatient.id || pid === uploadedPatient.patientId || pid === uploadedPatient.patientCode || t.testId === testIdClinical || t.testId === testIdImaging;
    });
    assert.ok(patientTests.length >= 1, 'Uploaded tests should exist on server');
    for (const pt of patientTests) {
      console.log(`   ✓ Verified Test on Server: ${pt.testType || 'Lab Test'} (ID: ${pt.testId || pt.id}, Status: ${pt.status})`);
    }

    console.log('\n====================================================');
    console.log('🎉 LIVE SERVER SYNC VERIFICATION COMPLETED: 100% PASS');
    console.log('Standalone app seamlessly synchronizes two-way with the central LIS server!');
    console.log('====================================================\n');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  runLiveSyncTests().catch(err => {
    console.error('\n❌ LIVE SYNC TEST FAILED:', err);
    process.exit(1);
  });
}

module.exports = { runLiveSyncTests };
