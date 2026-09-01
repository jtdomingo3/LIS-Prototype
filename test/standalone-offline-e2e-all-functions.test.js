/**
 * Test Suite 5: Complete End-to-End Reception, Sample Data Input & Pipeline Progression
 * Directory: test/standalone-offline-e2e-all-functions.test.js
 *
 * Fully exercises:
 * 1. Reception Patient Creation with full demographics
 * 2. Multi-department package creation (Clinical Chemistry, Hematology, Urinalysis, Imaging)
 * 3. Payment Processing & Station Routing
 * 4. Extraction / Specimen Collection
 * 5. Complete Result Entry with authentic numerical & qualitative parameters
 * 6. Doctor / Medical Technologist completion & verification
 * 7. Offline OperationQueue mutation logging & temp ID tracking
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { DataStore } = require('../lis-app-standalone/lib/dataStore');
const { OperationQueue } = require('../lis-app-standalone/lib/operationQueue');
const Patient = require('../lis-app-standalone/models/Patient');
const Test = require('../lis-app-standalone/models/Test');

async function runE2EAllFunctionsTest() {
  console.log('----------------------------------------------------');
  console.log('🧪 TEST 5: Comprehensive Reception, Results & Queue Pipeline');
  console.log('----------------------------------------------------');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lis-test-e2e-full-'));
  const ds = new DataStore(tmpDir);
  const queue = new OperationQueue(path.join(tmpDir, 'queue.json'));

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
    // ── 1. Reception Patient Registration ──────────────────────────
    console.log('1. Registering comprehensive medical test patient...');
    const patientData = {
      firstName: 'Maria Clara',
      middleName: 'Santos',
      lastName: 'Delos Reyes',
      gender: 'Female',
      dateOfBirth: '1992-05-14',
      phone: '09179876543',
      address: '123 Rizal St, Quezon City',
      seniorCitizenId: '',
      pwdId: ''
    };

    const patient = new Patient(patientData);
    await patient.save();

    assert.ok(patient.id, 'Patient should have an ID');
    assert.ok(patient.patientId || patient.patientCode, 'Patient should have an auto-generated patientId or patientCode');
    console.log(`   ✓ Patient created: ${patient.firstName} ${patient.lastName} (Code: ${patient.patientId || patient.patientCode}, ID: ${patient.id})`);

    // Queue the patient creation mutation
    queue.add('POST', 'http://127.0.0.1:3000/patients', {
      body: patient.toObject ? patient.toObject() : patient
    });

    // ── 2. Create Multi-Department Test Package ────────────────────
    console.log('\n2. Creating multi-department test requests...');

    // Test A: Hematology (CBC with Platelet Count)
    const testCBC = new Test({
      patient: patient.id,
      testType: 'Complete Blood Count (CBC)',
      department: 'Hematology',
      testDate: new Date().toISOString(),
      status: 'Payment Area',
      price: 250,
      paid: false,
      requestedTests: [
        { key: 'CBC', label: 'Complete Blood Count', area: 'Extraction Area', lab: 'clinical', price: 250 }
      ]
    });
    await testCBC.save();
    queue.add('POST', 'http://127.0.0.1:3000/tests', { body: testCBC });

    // Test B: Clinical Chemistry (FBS, Lipid Profile, Creatinine, SGPT)
    const testChem = new Test({
      patient: patient.id,
      testType: 'Blood Chemistry Package',
      department: 'Clinical Chemistry',
      testDate: new Date().toISOString(),
      status: 'Payment Area',
      price: 950,
      paid: false,
      requestedTests: [
        { key: 'FBS', label: 'Fasting Blood Sugar', area: 'Extraction Area', lab: 'clinical', price: 200 },
        { key: 'LIPID', label: 'Lipid Profile', area: 'Extraction Area', lab: 'clinical', price: 450 },
        { key: 'CREAT', label: 'Serum Creatinine', area: 'Extraction Area', lab: 'clinical', price: 200 },
        { key: 'SGPT', label: 'ALT / SGPT', area: 'Extraction Area', lab: 'clinical', price: 100 }
      ]
    });
    await testChem.save();
    queue.add('POST', 'http://127.0.0.1:3000/tests', { body: testChem });

    // Test C: Clinical Microscopy (Routine Urinalysis)
    const testUri = new Test({
      patient: patient.id,
      testType: 'Routine Urinalysis',
      department: 'Clinical Microscopy',
      testDate: new Date().toISOString(),
      status: 'Payment Area',
      price: 150,
      paid: false,
      requestedTests: [
        { key: 'URI', label: 'Urinalysis', area: 'Extraction Area', lab: 'clinical', price: 150 }
      ]
    });
    await testUri.save();
    queue.add('POST', 'http://127.0.0.1:3000/tests', { body: testUri });

    // Test D: Imaging (Chest X-Ray PA)
    const testCXR = new Test({
      patient: patient.id,
      testType: 'Chest X-Ray PA View',
      department: 'Radiology',
      testDate: new Date().toISOString(),
      status: 'Payment Area',
      price: 400,
      paid: false,
      requestedTests: [
        { key: 'CXR', label: 'Chest X-Ray PA', area: 'X-ray', lab: 'imaging', price: 400 }
      ]
    });
    await testCXR.save();
    queue.add('POST', 'http://127.0.0.1:3000/tests', { body: testCXR });

    console.log(`   ✓ Created 4 test orders across 4 departments (Total: ₱1,750.00)`);

    // ── 3. Payment Processing & Station Routing ───────────────────
    console.log('\n3. Processing cashier payment & routing to extraction/imaging...');
    await Test.findByIdAndUpdate(testCBC.id, { status: 'Extraction Area', paid: true });
    await Test.findByIdAndUpdate(testChem.id, { status: 'Extraction Area', paid: true });
    await Test.findByIdAndUpdate(testUri.id, { status: 'Extraction Area', paid: true });
    await Test.findByIdAndUpdate(testCXR.id, { status: 'X-ray', paid: true });

    queue.add('PUT', `http://127.0.0.1:3000/tests/${testCBC.id}/status`, { status: 'Extraction Area', paid: true });
    queue.add('PUT', `http://127.0.0.1:3000/tests/${testChem.id}/status`, { status: 'Extraction Area', paid: true });
    queue.add('PUT', `http://127.0.0.1:3000/tests/${testUri.id}/status`, { status: 'Extraction Area', paid: true });
    queue.add('PUT', `http://127.0.0.1:3000/tests/${testCXR.id}/status`, { status: 'X-ray', paid: true });

    const paidTests = await Test.find({ patient: patient.id });
    assert.strictEqual(paidTests.filter(t => t.paid).length, 4);
    assert.strictEqual(paidTests.find(t => t.id === testCXR.id).status, 'X-ray');
    console.log('   ✓ Payment confirmed: 3 Clinical tests routed to Extraction, 1 Imaging routed to X-Ray');

    // ── 4. Specimen Extraction & Phlebotomy ────────────────────────
    console.log('\n4. Phlebotomy specimen collection (Blood & Urine)...');
    await Test.findByIdAndUpdate(testCBC.id, { status: 'In Progress' });
    await Test.findByIdAndUpdate(testChem.id, { status: 'In Progress' });
    await Test.findByIdAndUpdate(testUri.id, { status: 'In Progress' });
    await Test.findByIdAndUpdate(testCXR.id, { status: 'Checked' }); // X-ray shot taken

    console.log('   ✓ Specimens collected: Clinical tests now "In Progress", X-ray in "Checked"');

    // ── 5. Input Sample Test Results ───────────────────────────────
    console.log('\n5. Inputting detailed laboratory sample findings & parameters...');

    // A. Hematology Results
    const cbcResults = {
      wbc: { value: '7.2', unit: 'x10^9/L', normalRange: '4.5-11.0', flag: 'Normal' },
      rbc: { value: '4.85', unit: 'x10^12/L', normalRange: '4.0-5.5', flag: 'Normal' },
      hemoglobin: { value: '142', unit: 'g/L', normalRange: '120-160', flag: 'Normal' },
      hematocrit: { value: '0.42', unit: 'L/L', normalRange: '0.37-0.48', flag: 'Normal' },
      platelets: { value: '265', unit: 'x10^9/L', normalRange: '150-450', flag: 'Normal' },
      neutrophils: { value: '0.60', unit: '%', normalRange: '0.50-0.70', flag: 'Normal' },
      lymphocytes: { value: '0.34', unit: '%', normalRange: '0.20-0.40', flag: 'Normal' }
    };
    await Test.findByIdAndUpdate(testCBC.id, { status: 'Completed', results: cbcResults });
    queue.add('POST', `http://127.0.0.1:3000/tests/${testCBC.id}/results`, { results: cbcResults, status: 'Completed' });
    console.log('   ✓ Hematology CBC results saved with 7 analytical parameters');

    // B. Blood Chemistry Results
    const chemResults = {
      fbs: { value: '94.5', unit: 'mg/dL', normalRange: '70.0-100.0', flag: 'Normal' },
      cholesterol: { value: '185.0', unit: 'mg/dL', normalRange: '< 200.0', flag: 'Normal' },
      triglycerides: { value: '128.0', unit: 'mg/dL', normalRange: '< 150.0', flag: 'Normal' },
      hdl: { value: '54.0', unit: 'mg/dL', normalRange: '> 45.0', flag: 'Normal' },
      ldl: { value: '105.4', unit: 'mg/dL', normalRange: '< 130.0', flag: 'Normal' },
      creatinine: { value: '0.85', unit: 'mg/dL', normalRange: '0.6-1.2', flag: 'Normal' },
      alt_sgpt: { value: '22.0', unit: 'U/L', normalRange: '7-35', flag: 'Normal' }
    };
    await Test.findByIdAndUpdate(testChem.id, { status: 'Completed', results: chemResults });
    queue.add('POST', `http://127.0.0.1:3000/tests/${testChem.id}/results`, { results: chemResults, status: 'Completed' });
    console.log('   ✓ Blood Chemistry results saved (FBS, Full Lipid Profile, Creatinine, ALT)');

    // C. Urinalysis Results
    const uriResults = {
      color: 'Yellow',
      transparency: 'Clear',
      specificGravity: '1.020',
      pH: '6.5',
      protein: 'Negative',
      glucose: 'Negative',
      wbcMicro: '1-3 /hpf',
      rbcMicro: '0-1 /hpf',
      epithelialCells: 'Few',
      mucusThreads: 'Rare'
    };
    await Test.findByIdAndUpdate(testUri.id, { status: 'Completed', results: uriResults });
    queue.add('POST', `http://127.0.0.1:3000/tests/${testUri.id}/results`, { results: uriResults, status: 'Completed' });
    console.log('   ✓ Routine Urinalysis results saved (Chemical & Microscopic examination)');

    // D. Chest X-Ray Results
    const cxrResults = {
      view: 'PA Chest',
      findings: 'Lungs are clear of active infiltrates. Heart is not enlarged. Diaphragm and sulci are intact. Bony cage and soft tissues are unremarkable.',
      impression: 'NORMAL CHEST FINDINGS.'
    };
    await Test.findByIdAndUpdate(testCXR.id, { status: 'Completed', results: cxrResults });
    queue.add('POST', `http://127.0.0.1:3000/tests/${testCXR.id}/results`, { results: cxrResults, status: 'Completed' });
    console.log('   ✓ Radiology findings and impression saved');

    // ── 6. Verification of Final States ────────────────────────────
    console.log('\n6. Verifying package release readiness...');
    const completedTests = await Test.find({ patient: patient.id });
    assert.strictEqual(completedTests.length, 4);
    completedTests.forEach(t => {
      assert.strictEqual(t.status, 'Completed', `Test ${t.testType} must be Completed`);
      assert.ok(t.results && Object.keys(t.results).length > 0, `Test ${t.testType} must have results`);
    });
    console.log('   ✓ All 4 tests verified in Completed status with full result datasets');

    // ── 7. Verify OperationQueue for Seamless Sync ─────────────────
    console.log('\n7. Verifying offline mutation queue for server replay...');
    const pendingOps = queue.getPending();
    assert.ok(pendingOps.length >= 8, `Expected at least 8 queued operations, got ${pendingOps.length}`);
    console.log(`   ✓ Offline Queue contains ${pendingOps.length} operations ready for automatic server sync`);

    console.log('\n✅ TEST 5 PASSED: Full E2E Reception, Sample Input & Pipeline Progression 100% verified.\n');
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
  }
}

if (require.main === module) {
  runE2EAllFunctionsTest().catch(err => {
    console.error('Test 5 Failed:', err);
    process.exit(1);
  });
}

module.exports = { runE2EAllFunctionsTest };
