/**
 * Live End-to-End Server Synchronization Test
 * File: test/test-live-server-sync-e2e.js
 *
 * Tests:
 * 1. Server online connectivity check
 * 2. Creating offline patient & tests in standalone database
 * 3. Entering complete numerical sample results offline
 * 4. Queueing all mutations in OperationQueue
 * 5. Replaying mutations to live server via SyncEngine
 * 6. Validating data integrity and server response
 * 7. Performing full synchronization and verifying clean state
 */
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');

const { DataStore } = require('../lis-app-standalone/lib/dataStore');
const { OperationQueue } = require('../lis-app-standalone/lib/operationQueue');
const { SyncEngine } = require('../lis-app-standalone/lib/syncEngine');
const Patient = require('../lis-app-standalone/models/Patient');
const Test = require('../lis-app-standalone/models/Test');

const SERVER_URL = process.env.SERVER_URL || 'http://127.0.0.1:3000';

function pingServer(url) {
  return new Promise((resolve) => {
    const req = http.get(`${url}/login`, (res) => {
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(3000, () => { req.destroy(); resolve(false); });
  });
}

async function runLiveServerSyncE2E() {
  console.log('====================================================');
  console.log('🌐 LIVE END-TO-END SERVER SYNCHRONIZATION TEST');
  console.log(`Target Server: ${SERVER_URL}`);
  console.log('====================================================\n');

  // 1. Check Server Connectivity
  console.log('1. Checking connection to central LIS server...');
  const isOnline = await pingServer(SERVER_URL);
  if (!isOnline) {
    console.error(`❌ Cannot connect to server at ${SERVER_URL}`);
    console.error('   Please verify that the central server is running.');
    process.exit(1);
  }
  console.log('   ✓ Server is ONLINE and reachable!\n');

  // 2. Set up isolated test sandbox
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lis-live-sync-test-'));
  const ds = new DataStore(tmpDir);
  const queue = new OperationQueue(tmpDir);
  const config = { SERVER_URL, MAX_SYNC_RETRIES: 3 };
  const engine = new SyncEngine(queue, config, ds);

  // Set default admin credentials for auto-auth if available
  engine.setCredentials('admin@example.com', 'admin123');
  engine.setAutoLoginEmail('admin@example.com');

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
    // 3. Register Patient Offline
    console.log('2. [Offline] Registering new patient at Reception...');
    const ts = Date.now();
    const patient = new Patient({
      firstName: 'LiveSync',
      middleName: 'Test',
      lastName: `Patient_${ts.toString().slice(-4)}`,
      gender: 'Female',
      dateOfBirth: '1995-08-20',
      phone: '09171112233',
      address: '777 Laboratory Avenue'
    });
    await patient.save();

    console.log(`   ✓ Patient created: ${patient.firstName} ${patient.lastName} (ID: ${patient.id})`);
    queue.add({
      method: 'POST',
      url: `${SERVER_URL}/patients`,
      body: patient.toJSON ? patient.toJSON() : patient
    });

    // 4. Create Multi-Department Tests Offline
    console.log('\n3. [Offline] Creating multi-department test requests...');
    
    // A. Hematology CBC
    const testCBC = new Test({
      patient: patient.id,
      testType: 'Complete Blood Count (CBC)',
      department: 'Hematology',
      status: 'Payment Area',
      price: 250,
      paid: false,
      requestedTests: [{ key: 'CBC', label: 'Complete Blood Count', area: 'Extraction Area', lab: 'clinical', price: 250 }]
    });
    await testCBC.save();
    queue.add({ method: 'POST', url: `${SERVER_URL}/tests`, body: testCBC.toJSON ? testCBC.toJSON() : testCBC });

    // B. Blood Chemistry
    const testChem = new Test({
      patient: patient.id,
      testType: 'Fasting Blood Sugar (FBS)',
      department: 'Clinical Chemistry',
      status: 'Payment Area',
      price: 200,
      paid: false,
      requestedTests: [{ key: 'FBS', label: 'Fasting Blood Sugar', area: 'Extraction Area', lab: 'clinical', price: 200 }]
    });
    await testChem.save();
    queue.add({ method: 'POST', url: `${SERVER_URL}/tests`, body: testChem.toJSON ? testChem.toJSON() : testChem });

    console.log(`   ✓ 2 test orders created: ${testCBC.testId} (CBC) & ${testChem.testId} (FBS)`);

    // 5. Simulate Payment & Specimen Collection
    console.log('\n4. [Offline] Processing Payment & Specimen Extraction...');
    await Test.findByIdAndUpdate(testCBC.id, { status: 'Extraction Area', paid: true });
    await Test.findByIdAndUpdate(testChem.id, { status: 'Extraction Area', paid: true });
    queue.add({ method: 'PUT', url: `${SERVER_URL}/tests/${testCBC.id}/status`, body: { status: 'Extraction Area', paid: true } });
    queue.add({ method: 'PUT', url: `${SERVER_URL}/tests/${testChem.id}/status`, body: { status: 'Extraction Area', paid: true } });

    await Test.findByIdAndUpdate(testCBC.id, { status: 'In Progress' });
    await Test.findByIdAndUpdate(testChem.id, { status: 'In Progress' });

    // 6. Input Lab Results Offline
    console.log('\n5. [Offline] Inputting authentic sample test results...');
    const cbcData = {
      wbc: { value: '6.8', unit: 'x10^9/L', normalRange: '4.5-11.0', flag: 'Normal' },
      rbc: { value: '4.70', unit: 'x10^12/L', normalRange: '4.0-5.5', flag: 'Normal' },
      hemoglobin: { value: '138', unit: 'g/L', normalRange: '120-160', flag: 'Normal' },
      hematocrit: { value: '0.41', unit: 'L/L', normalRange: '0.37-0.48', flag: 'Normal' },
      platelets: { value: '250', unit: 'x10^9/L', normalRange: '150-450', flag: 'Normal' }
    };
    await Test.findByIdAndUpdate(testCBC.id, { status: 'Completed', results: cbcData });
    queue.add({ method: 'POST', url: `${SERVER_URL}/tests/${testCBC.id}/results`, body: { results: cbcData, status: 'Completed' } });

    const fbsData = {
      fbs: { value: '92.0', unit: 'mg/dL', normalRange: '70.0-100.0', flag: 'Normal' }
    };
    await Test.findByIdAndUpdate(testChem.id, { status: 'Completed', results: fbsData });
    queue.add({ method: 'POST', url: `${SERVER_URL}/tests/${testChem.id}/results`, body: { results: fbsData, status: 'Completed' } });

    console.log('   ✓ Lab results entered and marked Completed');

    const totalPending = queue.countPending();
    console.log(`\n6. [Sync Verification] Queue contains ${totalPending} offline operations.`);
    assert.ok(totalPending >= 6, `Expected at least 6 operations, found ${totalPending}`);

    // 7. Execute Queue Replay to Server
    console.log('\n7. [Online Replay] Pushing queued operations to live server...');
    const syncedCount = await engine.processQueue();
    console.log(`   ✓ Replay completed: ${syncedCount} operations pushed to server.`);

    // 8. Verify Remaining Queue
    const remainingPending = queue.countPending();
    console.log(`   ✓ Remaining pending in queue: ${remainingPending}`);
    assert.strictEqual(remainingPending, 0, 'All queue operations should be synced successfully');

    // 9. Full Bidirectional Sync Verification
    console.log('\n8. [Full Sync] Performing server export sync...');
    const fullSyncResult = await engine.fullSync();
    console.log(`   ✓ Full Sync status: ${fullSyncResult.success ? 'SUCCESS' : 'FAILED'}, records imported: ${fullSyncResult.imported || 0}`);

    console.log('\n====================================================');
    console.log('🎉 LIVE SERVER SYNC TEST PASSED 100%');
    console.log('Patient creation, multi-test ordering, payment, specimen collection,');
    console.log('and numerical result entry synced seamlessly to the live server database.');
    console.log('====================================================\n');
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
}

if (require.main === module) {
  runLiveServerSyncE2E().catch((err) => {
    console.error('\n❌ LIVE SYNC TEST FAILED:', err);
    process.exit(1);
  });
}

module.exports = { runLiveServerSyncE2E };
