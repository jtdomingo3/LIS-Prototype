/**
 * Test Suite 1: SQLite DataStore & Models Offline CRUD
 * Directory: test/standalone-offline-crud.test.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { DataStore } = require('../lis-app-standalone/lib/dataStore');
const Patient = require('../lis-app-standalone/models/Patient');
const Test = require('../lis-app-standalone/models/Test');

async function runDatastoreCrudTests() {
  console.log('----------------------------------------------------');
  console.log('🧪 TEST 1: SQLite DataStore & Models Offline CRUD');
  console.log('----------------------------------------------------');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lis-test-crud-'));
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
    // 1. Patient Creation
    console.log('1. Testing offline Patient creation & counter auto-generation...');
    const p1 = new Patient({
      firstName: 'Maria',
      lastName: 'Santos',
      gender: 'Female',
      dateOfBirth: '1992-04-12',
      phone: '09171234567',
      address: '123 Main St, Manila'
    });
    await p1.save();

    assert.ok(p1.id, 'Patient should have an internal ID');
    assert.ok(p1.patientId, 'Patient should have an auto-generated human-readable patientId');
    console.log(`   ✓ Patient created: ${p1.firstName} ${p1.lastName} (ID: ${p1.id}, PatientId: ${p1.patientId})`);

    // 2. Patient Lookups (by id, by patientId, search)
    console.log('2. Testing offline Patient lookups...');
    const foundById = await Patient.findById(p1.id);
    assert.strictEqual(foundById.firstName, 'Maria');

    const foundByHumanId = await Patient.findById(p1.patientId);
    assert.strictEqual(foundByHumanId.lastName, 'Santos');

    const searchResults = await Patient.find({ search: 'Maria' });
    assert.strictEqual(searchResults.length, 1);
    console.log('   ✓ Lookups by UUID, patientId, and search string passed');

    // 3. Patient Updates
    console.log('3. Testing offline Patient update...');
    await Patient.findByIdAndUpdate(p1.id, { phone: '09998887777', address: '456 New Blvd, QC' });
    const updatedPatient = await Patient.findById(p1.id);
    assert.strictEqual(updatedPatient.phone, '09998887777');
    assert.strictEqual(updatedPatient.address, '456 New Blvd, QC');
    console.log('   ✓ Patient record updated successfully in SQLite');

    // 4. Test Creation & Counter Sequence
    console.log('4. Testing offline Test creation & test counter sequence...');
    const t1 = new Test({
      patient: p1.id,
      testType: 'Complete Blood Count (CBC)',
      testDate: new Date().toISOString(),
      status: 'Payment Area',
      price: 180,
      requestedTests: [
        { key: 'CBC', label: 'Complete Blood Count', area: 'Extraction Area', lab: 'clinical', price: 180 }
      ]
    });
    await t1.save();

    assert.ok(t1.id, 'Test should have a UUID');
    assert.ok(t1.testId, 'Test should have an auto-generated testId');
    console.log(`   ✓ Test created: ${t1.testType} (ID: ${t1.id}, TestId: ${t1.testId}, Status: ${t1.status})`);

    // 5. Test lookup and patient resolution
    console.log('5. Testing offline Test lookup and patient resolution...');
    const foundTest = await Test.findById(t1.id);
    assert.strictEqual(foundTest.patient, p1.id);
    const testPatient = await Patient.findById(foundTest.patient);
    assert.strictEqual(testPatient.firstName, 'Maria');
    console.log('   ✓ Test patient reference resolved correctly');

    // 6. Test Result Entry & Status Update
    console.log('6. Testing offline Test result entry and completion...');
    await Test.findByIdAndUpdate(t1.id, {
      status: 'Completed',
      results: {
        wbc: { value: '6.5', unit: 'x10^9/L', normalRange: '4.5-11.0', flag: 'Normal' },
        rbc: { value: '4.8', unit: 'x10^12/L', normalRange: '4.0-5.5', flag: 'Normal' },
        hemoglobin: { value: '140', unit: 'g/L', normalRange: '120-160', flag: 'Normal' },
        hematocrit: { value: '0.42', unit: 'L/L', normalRange: '0.37-0.48', flag: 'Normal' }
      }
    });

    const completedTest = await Test.findById(t1.id);
    assert.strictEqual(completedTest.status, 'Completed');
    assert.strictEqual(completedTest.results.wbc.value, '6.5');
    assert.strictEqual(completedTest.results.hemoglobin.flag, 'Normal');
    console.log('   ✓ Test results and completion status saved in SQLite');

    console.log('✅ TEST 1 PASSED: SQLite DataStore CRUD & Models functioning 100% offline.\n');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

if (require.main === module) {
  runDatastoreCrudTests().catch(err => {
    console.error('❌ TEST 1 FAILED:', err);
    process.exit(1);
  });
}

module.exports = { runDatastoreCrudTests };
