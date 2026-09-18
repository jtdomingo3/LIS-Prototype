const assert = require('assert');
const path = require('path');
const fs = require('fs');

const TMP_DIR = path.join(__dirname, 'tmp-pipeline-full-test');
if (fs.existsSync(TMP_DIR)) fs.rmSync(TMP_DIR, { recursive: true, force: true });
fs.mkdirSync(TMP_DIR, { recursive: true });

const dbPath = path.join(TMP_DIR, 'lis-data.db');
const { createDb } = require('../lis-app-standalone/lib/sqliteDb');
global.db = createDb(dbPath);

const Patient = require('../lis-app-standalone/models/Patient');
const Test = require('../lis-app-standalone/models/Test');

// Test the reception module functions directly
const receptionRouter = require('../lis-app-standalone/routes/reception');

async function runPipelineTest() {
  console.log('--- STARTING MULTI-STATION PIPELINE PROGRESSION TEST ---');

  // Start local server instance first
  const http = require('http');
  const { createLocalServer } = require('../lis-app-standalone/lib/localServer');
  const { DataStore } = require('../lis-app-standalone/lib/dataStore');
  const { OperationQueue } = require('../lis-app-standalone/lib/operationQueue');
  const { PageCache } = require('../lis-app-standalone/lib/pageCache');

  const dataStore = new DataStore(TMP_DIR);
  const operationQueue = new OperationQueue(TMP_DIR);
  const pageCache = new PageCache(TMP_DIR);
  // Seed default admin user
  dataStore.setCollection('users', [
    {
      id: 'admin-1',
      name: 'Administrator',
      email: 'admin@example.com',
      role: 'Admin',
      password: '$2b$10$hashedpasswordstring'
    }
  ]);

  const testPort = 31899;
  const serverInstance = createLocalServer(pageCache, operationQueue, { LOCAL_PORT: testPort, SERVER_URL: 'http://127.0.0.1:3000' }, dataStore);
  if (serverInstance.setAutoLoginEmail) serverInstance.setAutoLoginEmail('admin@example.com');
  await new Promise(r => setTimeout(r, 300));

  // 1. Create Patient
  const patient = new Patient({
    firstName: 'Maria',
    lastName: 'Santos',
    gender: 'Female',
    phone: '09171234567',
    patientCode: 'GCL-20260901-99999'
  });
  await patient.save();
  console.log('✓ Created patient:', patient.firstName, patient.lastName, patient.patientCode);

  // 2. Create tests for all stations
  const testTypes = [
    { type: 'hematology', label: 'Complete Blood Count' },
    { type: 'drugtest', label: 'Drug Test' },
    { type: 'ultrasound', label: 'Whole Abdomen Ultrasound' },
    { type: 'echocardiography-2d', label: '2D Echocardiography' },
    { type: 'xray', label: 'Chest X-Ray PA' },
    { type: 'ecg', label: 'Electrocardiogram (ECG)' },
    { type: 'doctor', label: "Doctor's Check-up - Dr. Lorenzo" }
  ];

  const createdTests = [];
  for (const item of testTypes) {
    const t = new Test({
      patient: patient.id,
      testType: item.label,
      status: 'Payment Area',
      requestedTests: [{ key: item.type, label: item.label, amount: 100 }]
    });
    await t.save();
    createdTests.push(t);
  }
  console.log(`✓ Created ${createdTests.length} tests in Payment Area`);

  function makeReq(path, method, body = null) {
    return new Promise((resolve, reject) => {
      let payload = '';
      const headers = { 'Cookie': 'connect.sid=fake-session' };
      if (body) {
        payload = new URLSearchParams(body).toString();
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
        headers['Content-Length'] = Buffer.byteLength(payload);
      }
      const req = http.request({
        hostname: '127.0.0.1',
        port: testPort,
        path,
        method,
        headers,
        timeout: 5000
      }, res => {
        let resBody = '';
        res.on('data', chunk => { resBody += chunk.toString(); });
        res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: resBody }));
      });
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  // Step 1: Complete Payment Area
  console.log('\n1. Completing Payment Area...');
  let res = await makeReq('/reception/complete', 'POST', {
    patientId: patient.id,
    area: 'Payment Area',
    testIds: createdTests.map(t => t.id).join(','),
    amount_clinical: '500',
    amount_xray: '100'
  });
  assert.strictEqual(res.statusCode, 302);

  // Verify status after Payment Area -> Extraction Area
  let testsAfterPayment = await Test.find({ patient: patient.id });
  let activeInExtraction = testsAfterPayment.filter(t => t.status === 'Extraction Area');
  let pendingTests = testsAfterPayment.filter(t => t.status === 'Pending');
  console.log(`   Status after Payment: Extraction Area count = ${activeInExtraction.length}, Pending count = ${pendingTests.length}`);
  assert.strictEqual(activeInExtraction.length, 1, 'CBC should be in Extraction Area');
  assert.strictEqual(activeInExtraction[0].testType, 'Complete Blood Count');

  // Step 2: Complete Extraction Area
  console.log('\n2. Completing Extraction Area...');
  res = await makeReq('/reception/complete', 'POST', {
    patientId: patient.id,
    area: 'Extraction Area',
    testIds: activeInExtraction.map(t => t.id).join(',')
  });
  assert.strictEqual(res.statusCode, 302);

  let testsAfterExtraction = await Test.find({ patient: patient.id });
  let activeInDrugTest = testsAfterExtraction.filter(t => t.status === 'Drug Test');
  console.log(`   Status after Extraction: Drug Test count = ${activeInDrugTest.length}`);
  assert.strictEqual(activeInDrugTest.length, 1, 'Should advance to Drug Test');
  assert.strictEqual(activeInDrugTest[0].testType, 'Drug Test');

  // Step 3: Complete Drug Test
  console.log('\n3. Completing Drug Test...');
  res = await makeReq('/reception/complete', 'POST', {
    patientId: patient.id,
    area: 'Drug Test',
    testIds: activeInDrugTest.map(t => t.id).join(',')
  });
  assert.strictEqual(res.statusCode, 302);

  let testsAfterDrugTest = await Test.find({ patient: patient.id });
  let activeInUltrasound = testsAfterDrugTest.filter(t => t.status === 'Ultrasound');
  console.log(`   Status after Drug Test: Ultrasound count = ${activeInUltrasound.length}`);
  assert.strictEqual(activeInUltrasound.length, 1, 'Should advance to Ultrasound');

  // Step 4: Complete Ultrasound
  console.log('\n4. Completing Ultrasound...');
  res = await makeReq('/reception/complete', 'POST', {
    patientId: patient.id,
    area: 'Ultrasound',
    testIds: activeInUltrasound.map(t => t.id).join(',')
  });
  assert.strictEqual(res.statusCode, 302);

  let testsAfterUltrasound = await Test.find({ patient: patient.id });
  let activeIn2DEcho = testsAfterUltrasound.filter(t => t.status === '2D Echo');
  console.log(`   Status after Ultrasound: 2D Echo count = ${activeIn2DEcho.length}`);
  assert.strictEqual(activeIn2DEcho.length, 1, 'Should advance to 2D Echo');

  // Step 5: Complete 2D Echo
  console.log('\n5. Completing 2D Echo...');
  res = await makeReq('/reception/complete', 'POST', {
    patientId: patient.id,
    area: '2D Echo',
    testIds: activeIn2DEcho.map(t => t.id).join(',')
  });
  assert.strictEqual(res.statusCode, 302);

  let testsAfter2DEcho = await Test.find({ patient: patient.id });
  let activeInXray = testsAfter2DEcho.filter(t => t.status === 'X-ray');
  console.log(`   Status after 2D Echo: X-ray count = ${activeInXray.length}`);
  assert.strictEqual(activeInXray.length, 1, 'Should advance to X-ray');

  // Step 6: Complete X-ray
  console.log('\n6. Completing X-ray...');
  res = await makeReq('/reception/complete', 'POST', {
    patientId: patient.id,
    area: 'X-ray',
    testIds: activeInXray.map(t => t.id).join(',')
  });
  assert.strictEqual(res.statusCode, 302);

  let testsAfterXray = await Test.find({ patient: patient.id });
  let activeInECG = testsAfterXray.filter(t => t.status === 'ECG');
  console.log(`   Status after X-ray: ECG count = ${activeInECG.length}`);
  assert.strictEqual(activeInECG.length, 1, 'Should advance to ECG');

  // Step 7: Complete ECG
  console.log('\n7. Completing ECG...');
  res = await makeReq('/reception/complete', 'POST', {
    patientId: patient.id,
    area: 'ECG',
    testIds: activeInECG.map(t => t.id).join(',')
  });
  assert.strictEqual(res.statusCode, 302);

  let testsAfterECG = await Test.find({ patient: patient.id });
  let activeInDoctor = testsAfterECG.filter(t => t.status === "Doctor's Check-up - Dr. Lorenzo");
  console.log(`   Status after ECG: Doctor Check-up count = ${activeInDoctor.length}`);
  assert.strictEqual(activeInDoctor.length, 1, 'Should advance to Doctor Check-up');

  // Step 8: Complete Doctor Check-up
  console.log('\n8. Completing Doctor Check-up...');
  res = await makeReq('/reception/complete', 'POST', {
    patientId: patient.id,
    area: "Doctor's Check-up - Dr. Lorenzo",
    testIds: activeInDoctor.map(t => t.id).join(',')
  });
  assert.strictEqual(res.statusCode, 302);

  let testsAfterDoctor = await Test.find({ patient: patient.id });
  let allCompletedOrChecked = testsAfterDoctor.every(t => ['Checked', 'In Progress', 'Completed'].includes(t.status));
  console.log(`   Status after Doctor Check-up: all tests processed = ${allCompletedOrChecked}`);
  assert.strictEqual(allCompletedOrChecked, true);

  console.log('\n🎉 ALL 8 PIPELINE STAGES VERIFIED PERFECTLY (Payment -> Extraction -> Drug Test -> Ultrasound -> 2D Echo -> X-ray -> ECG -> Doctor Check-up)!');

  // Cleanup
  serverInstance.close();
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
}

runPipelineTest().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
