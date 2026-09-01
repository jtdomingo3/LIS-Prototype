/**
 * Test Suite 3: Local Express Server HTTP API & Routes Offline
 * Directory: test/standalone-offline-routes.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { createLocalServer } = require('../lis-app-standalone/lib/localServer');
const { DataStore } = require('../lis-app-standalone/lib/dataStore');
const { OperationQueue } = require('../lis-app-standalone/lib/operationQueue');
const { PageCache } = require('../lis-app-standalone/lib/pageCache');

function makeRequest(port, method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    let payload = '';
    const reqHeaders = Object.assign({}, headers);
    if (body) {
      if (typeof body === 'object') {
        payload = new URLSearchParams(body).toString();
        reqHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
      } else {
        payload = body;
      }
      reqHeaders['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: reqHeaders,
      timeout: 5000
    }, res => {
      let resBody = '';
      res.on('data', chunk => { resBody += chunk.toString(); });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: resBody
        });
      });
    });

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runLocalServerRouteTests() {
  console.log('----------------------------------------------------');
  console.log('🧪 TEST 3: Local Server HTTP Routes & Queuing');
  console.log('----------------------------------------------------');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lis-test-server-'));
  const testPort = 31000 + Math.floor(Math.random() * 500);

  const ds = new DataStore(tmpDir);
  const queue = new OperationQueue(tmpDir);
  const pageCache = new PageCache(tmpDir);

  // Seed default admin user
  ds.setCollection('users', [
    {
      id: 'admin-1',
      name: 'Administrator',
      email: 'admin@example.com',
      role: 'Admin',
      password: '$2b$10$hashedpasswordstring'
    }
  ]);

  const server = createLocalServer(pageCache, queue, { LOCAL_PORT: testPort, SERVER_URL: 'http://127.0.0.1:3000' }, ds);
  if (server.setAutoLoginEmail) server.setAutoLoginEmail('admin@example.com');
  await new Promise(r => setTimeout(r, 200));

  try {
    // 1. Test GET /patients
    console.log('1. Testing GET /patients...');
    const resPatients = await makeRequest(testPort, 'GET', '/patients');
    assert.strictEqual(resPatients.statusCode, 200, 'GET /patients should return 200');
    console.log('   ✓ GET /patients returned 200 OK');

    // 2. Test POST /patients (Register patient offline)
    console.log('2. Testing POST /patients (Register patient offline)...');
    const patPayload = {
      firstName: 'Elena',
      lastName: 'Reyes',
      gender: 'Female',
      dateOfBirth: '1990-09-09',
      phone: '09201112222',
      address: '789 Pine St, Pasig'
    };
    const resCreatePat = await makeRequest(testPort, 'POST', '/patients', patPayload);
    assert.ok(resCreatePat.statusCode === 200 || resCreatePat.statusCode === 302, 'POST /patients should succeed');

    const patientsInDb = ds.getCollection('patients');
    const createdPatient = patientsInDb.find(p => p.firstName === 'Elena' && p.lastName === 'Reyes');
    assert.ok(createdPatient, 'Patient should be saved in SQLite DataStore');
    assert.ok(createdPatient.id, 'Patient should have an ID');
    console.log(`   ✓ Patient created: ${createdPatient.firstName} ${createdPatient.lastName} (${createdPatient.id})`);

    // Verify operation was queued
    assert.ok(queue.countPending() >= 1, 'Operation should be queued in OperationQueue');
    console.log(`   ✓ Mutation queued in OperationQueue (pending: ${queue.countPending()})`);

    // 3. Test POST /tests (Create test offline)
    console.log('3. Testing POST /tests (Create test offline)...');
    const testPayload = {
      patient: createdPatient.id,
      testType: 'Lipid Profile',
      price: 450,
      'requestedTests[0][key]': 'LIPID',
      'requestedTests[0][label]': 'Lipid Profile',
      'requestedTests[0][area]': 'Extraction Area',
      'requestedTests[0][lab]': 'clinical',
      'requestedTests[0][price]': '450'
    };
    const resCreateTest = await makeRequest(testPort, 'POST', '/tests', testPayload);
    assert.ok(resCreateTest.statusCode === 200 || resCreateTest.statusCode === 302, 'POST /tests should succeed');

    const testsInDb = ds.getCollection('tests');
    const createdTest = testsInDb.find(t => t.patient === createdPatient.id || (typeof t.patient === 'object' && t.patient && t.patient.id === createdPatient.id));
    assert.ok(createdTest, 'Test should be saved in SQLite DataStore');
    console.log(`   ✓ Test created in SQLite: ${createdTest.testType} (${createdTest.id || createdTest.testId})`);
    console.log(`   ✓ Total pending queued operations: ${queue.countPending()}`);

    // 4. Test GET /dashboard
    console.log('4. Testing GET /dashboard...');
    const resDash = await makeRequest(testPort, 'GET', '/dashboard');
    assert.strictEqual(resDash.statusCode, 200, 'GET /dashboard should return 200 OK');
    console.log('   ✓ GET /dashboard returned 200 OK');

    console.log('✅ TEST 3 PASSED: Local Server Routes & Operation Queuing working 100% offline.\n');
  } finally {
    server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  runLocalServerRouteTests().catch(err => {
    console.error('❌ TEST 3 FAILED:', err);
    process.exit(1);
  });
}

module.exports = { runLocalServerRouteTests };
