/**
 * Test Suite 2: Reception Multi-Station Pipeline Progression
 * Directory: test/standalone-offline-pipeline.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { DataStore } = require('../lis-app-standalone/lib/dataStore');
const Patient = require('../lis-app-standalone/models/Patient');
const Test = require('../lis-app-standalone/models/Test');

async function runReceptionPipelineTests() {
  console.log('----------------------------------------------------');
  console.log('🧪 TEST 2: Reception Multi-Station Pipeline Offline');
  console.log('----------------------------------------------------');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lis-test-pipeline-'));
  const ds = new DataStore(tmpDir);

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
    // 1. Create Patient with comprehensive package: CBC + Chest X-ray + Doctor's Check-up
    console.log('1. Registering multi-department package patient...');
    const patient = new Patient({
      firstName: 'Juan',
      lastName: 'Dela Cruz',
      gender: 'Male',
      dateOfBirth: '1985-11-20',
      phone: '09181234567'
    });
    await patient.save();

    // Clinical Lab test (CBC)
    const testClinical = new Test({
      patient: patient.id,
      testType: 'Complete Blood Count (CBC)',
      testDate: new Date().toISOString(),
      status: 'Payment Area',
      price: 200,
      requestedTests: [
        { key: 'CBC', label: 'CBC', area: 'Extraction Area', lab: 'clinical', price: 200 }
      ]
    });
    await testClinical.save();

    // Imaging test (Chest X-ray)
    const testImaging = new Test({
      patient: patient.id,
      testType: 'Chest X-ray PA',
      testDate: new Date().toISOString(),
      status: 'Payment Area',
      price: 350,
      requestedTests: [
        { key: 'CXR', label: 'Chest X-ray PA', area: 'X-ray', lab: 'imaging', price: 350 }
      ]
    });
    await testImaging.save();

    // Doctor consultation
    const testDoctor = new Test({
      patient: patient.id,
      testType: "Doctor's Physical Exam",
      testDate: new Date().toISOString(),
      status: 'Payment Area',
      price: 500,
      requestedTests: [
        { key: 'PE', label: "Physical Examination", area: "Doctor's Check-up", lab: 'consultation', price: 500 }
      ]
    });
    await testDoctor.save();

    console.log(`   ✓ Patient registered with 3 tests: ${testClinical.testId}, ${testImaging.testId}, ${testDoctor.testId}`);

    // Verify initial station is Payment Area for all
    let allTests = await Test.find({ patient: patient.id });
    assert.strictEqual(allTests.length, 3);
    allTests.forEach(t => assert.strictEqual(t.status, 'Payment Area'));
    console.log('   ✓ Initial station verified: All tests in Payment Area');

    // 2. Simulate Payment Area completion
    console.log('\n2. Processing Payment Completion...');
    await Test.findByIdAndUpdate(testClinical.id, { status: 'Extraction Area', paid: true });
    await Test.findByIdAndUpdate(testImaging.id, { status: 'X-ray', paid: true });
    await Test.findByIdAndUpdate(testDoctor.id, { status: "Doctor's Check-up", paid: true });

    allTests = await Test.find({ patient: patient.id });
    const c1 = allTests.find(t => t.id === testClinical.id);
    const i1 = allTests.find(t => t.id === testImaging.id);
    const d1 = allTests.find(t => t.id === testDoctor.id);

    assert.strictEqual(c1.status, 'Extraction Area');
    assert.strictEqual(i1.status, 'X-ray');
    assert.strictEqual(d1.status, "Doctor's Check-up");
    console.log('   ✓ Payment completed: Clinical test at Extraction Area, Imaging test at X-ray, Consultation at Doctor station');

    // 3. Simulate Extraction Area completion
    console.log('\n3. Processing Extraction Area Completion (Specimen Collected)...');
    await Test.findByIdAndUpdate(testClinical.id, { status: 'In Progress' });
    
    allTests = await Test.find({ patient: patient.id });
    const c2 = allTests.find(t => t.id === testClinical.id);
    assert.strictEqual(c2.status, 'In Progress');
    console.log('   ✓ Extraction completed: CBC moved to In Progress (Laboratory analysis)');

    // 4. Simulate X-ray Area completion
    console.log('\n4. Processing X-ray Area Completion (Imaging taken)...');
    await Test.findByIdAndUpdate(testImaging.id, { status: 'Checked' });

    allTests = await Test.find({ patient: patient.id });
    const i2 = allTests.find(t => t.id === testImaging.id);
    assert.strictEqual(i2.status, 'Checked');
    console.log('   ✓ X-ray station completed: X-ray moved to Checked (Radiologist reading)');

    // 5. Simulate Doctor Consultation completion
    console.log('\n5. Processing Doctor Consultation Completion...');
    await Test.findByIdAndUpdate(testDoctor.id, { status: 'Completed' });

    allTests = await Test.find({ patient: patient.id });
    const d2 = allTests.find(t => t.id === testDoctor.id);
    assert.strictEqual(d2.status, 'Completed');
    console.log('   ✓ Doctor Consultation completed');

    // 6. Complete Lab Result Entry & Release All
    console.log('\n6. Entering final Lab Results and releasing entire package...');
    await Test.findByIdAndUpdate(testClinical.id, {
      status: 'Completed',
      results: { cbc: 'Normal findings' }
    });
    await Test.findByIdAndUpdate(testImaging.id, {
      status: 'Completed',
      results: { impression: 'Clear lung fields, normal cardiac silhouette' }
    });

    allTests = await Test.find({ patient: patient.id });
    allTests.forEach(t => assert.strictEqual(t.status, 'Completed'));
    console.log('   ✓ All 3 tests in package reached Completed status');

    console.log('✅ TEST 2 PASSED: Reception Multi-Station Pipeline verified 100% offline.\n');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  runReceptionPipelineTests().catch(err => {
    console.error('❌ TEST 2 FAILED:', err);
    process.exit(1);
  });
}

module.exports = { runReceptionPipelineTests };
