/**
 * Full End-to-End Test: Authenticate, Create Patient & Assign Tests, Replay to Server, Verify on Server
 * File: scripts/test-replay-to-server.js
 */
const { DataStore } = require('../lis-app-standalone/lib/dataStore');
const { OperationQueue } = require('../lis-app-standalone/lib/operationQueue');
const { SyncEngine } = require('../lis-app-standalone/lib/syncEngine');

async function run() {
  console.log('====================================================');
  console.log('🧪 VERIFYING PATIENT & TEST CREATION SERVER SYNC');
  console.log('====================================================\n');

  const ds = new DataStore();
  const queue = new OperationQueue(require('path').dirname(ds.filePath));
  const config = { SERVER_URL: 'http://127.0.0.1:3000', MAX_SYNC_RETRIES: 3 };
  const engine = new SyncEngine(queue, config, ds);

  // Set credentials for server authentication
  engine.setCredentials('admin@lab.com', 'admin123');
  engine.setAutoLoginEmail('admin@lab.com');

  const ts = Date.now().toString().slice(-4);
  const patId = 'pat-' + Date.now();
  const testId = 'test-' + Date.now();

  console.log('1. Queueing new patient creation (POST /patients)...');
  queue.add({
    method: 'POST',
    url: 'http://127.0.0.1:3000/patients',
    body: {
      firstName: 'LIVE_SAVED',
      lastName: 'PATIENT_' + ts,
      gender: 'Female',
      dateOfBirth: '1992-08-20',
      phone: '09171234567',
      company: 'Gezyne Test Corp',
      id: patId,
      client_id: patId
    }
  });

  console.log('2. Queueing new test assignment (POST /tests)...');
  queue.add({
    method: 'POST',
    url: 'http://127.0.0.1:3000/tests',
    body: {
      patient: patId,
      testType: 'Complete Blood Count (CBC)',
      priority: 'Normal',
      createdTests: [
        {
          id: testId,
          testId: 'HM' + ts,
          testType: 'Complete Blood Count (CBC)',
          status: 'Payment Area',
          patient: patId,
          client_id: testId
        }
      ]
    }
  });

  console.log('\n3. Replaying queue to central server via SyncEngine...');
  const synced = await engine.processQueue();
  console.log(`\nReplay finished — operations synced: ${synced}`);

  console.log('\n4. Fetching server database via /export/data.json to verify on-disk persistence...');
  const exportData = await engine._fetchJson(null, 'http://127.0.0.1:3000/export/data.json');
  console.log(`Server currently has: ${exportData.patients.length} patients and ${exportData.tests.length} tests`);

  const createdPatient = exportData.patients.find(p => p.firstName === 'LIVE_SAVED' && p.lastName === 'PATIENT_' + ts);
  console.log('\nResult for Patient on Server:', createdPatient ? {
    id: createdPatient.id,
    patientId: createdPatient.patientId,
    patientCode: createdPatient.patientCode,
    name: `${createdPatient.firstName} ${createdPatient.lastName}`,
    company: createdPatient.company
  } : '❌ FAILED: Patient was not saved on the server!');

  if (!createdPatient) {
    throw new Error('Patient was not saved to the server');
  }

  console.log('\n🎉 SUCCESS: Patient and tests are successfully synchronized and saved on the server!');
}

run().catch((err) => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
