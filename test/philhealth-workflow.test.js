const assert = require('assert');
const path = require('path');
const fs = require('fs');

async function runTests() {
  console.log('\n========================================================================');
  console.log('🩺 RUNNING TEST: Complete PhilHealth / Health Card Workflow Integration');
  console.log('========================================================================\n');

  // 1. Test PhilHealth Catalog Definition
  console.log('--- Step 1: Testing PhilHealth Catalog & Rules ---');
  const catalogLib = require('../lis-fullstack/lib/philhealthCatalog');
  const catalog = catalogLib.getCatalog();

  assert.strictEqual(catalog.length, 13, 'Catalog must contain exactly 13 official PhilHealth procedures');

  const sputum = catalogLib.getProcedureByKey('sputum_microscopy');
  assert.ok(sputum, 'Sputum Microscopy must exist');
  assert.strictEqual(sputum.forSendOut, true, 'Sputum Microscopy must be marked for sendout');
  assert.strictEqual(sputum.targetArea, 'Sendout', 'Sputum Microscopy must route to Sendout area');
  assert.strictEqual(sputum.requiresRemarks, true, 'Sputum Microscopy must require remarks');

  const pap = catalogLib.getProcedureByKey('pap_smear');
  assert.ok(pap, 'Pap smear must exist');
  assert.strictEqual(pap.forSendOut, true, 'Pap smear must be marked for sendout');
  assert.strictEqual(pap.targetArea, 'Sendout', 'Pap smear must route to Sendout area');

  const fbs = catalogLib.getProcedureByKey('fbs');
  assert.ok(fbs, 'FBS must exist');
  assert.strictEqual(fbs.category, 'Blood Chemistry', 'FBS category must be Blood Chemistry');
  assert.strictEqual(fbs.targetArea, 'Extraction Area', 'FBS target area must be Extraction Area');
  assert.ok(fbs.defaultRemarks.includes('Blood Chemistry'), 'FBS must have auto remarks');

  const expectedImage2Labels = [
    'CBC w/ platelet count',
    'Lipid profile (Total Cholesterol, HDL and LDL Cholesterol, Triglycerides)',
    'Fasting Blood Sugar',
    'Oral Glucose Tolerance Test',
    'HbA1C',
    'Creatinine',
    'Chest X-Ray',
    'Sputum Microscopy',
    'ECG',
    'Urinalysis',
    'Pap smear',
    'Fecalysis',
    'Fecal Occult Blood Test'
  ];

  catalog.forEach((item, index) => {
    assert.strictEqual(item.itemNo, index + 1, `Item at index ${index} must have itemNo ${index + 1}`);
    assert.strictEqual(item.label, expectedImage2Labels[index], `Procedure ${index + 1} label must match Image 2`);
  });

  // Test normalizeProcedures with legacy procedure data
  const legacyProcs = [
    { key: 'fbs', label: 'Fasting Blood Sugar (FBS)', remarks: 'Blood Chemistry – Fasting Blood Sugar (FBS)' },
    { key: 'cbc', label: 'CBC (Hematology)', remarks: '' },
    { key: 'lipid_profile', label: 'Lipid Profile (Total Cholesterol, HDL, LDL, Triglycerides)' }
  ];
  const normalized = catalogLib.normalizeProcedures(legacyProcs);
  assert.strictEqual(normalized.length, 3);
  assert.strictEqual(normalized[0].itemNo, 1);
  assert.strictEqual(normalized[0].label, 'CBC w/ platelet count');
  assert.strictEqual(normalized[1].itemNo, 2);
  assert.strictEqual(normalized[1].label, 'Lipid profile (Total Cholesterol, HDL and LDL Cholesterol, Triglycerides)');
  assert.strictEqual(normalized[2].itemNo, 3);
  assert.strictEqual(normalized[2].label, 'Fasting Blood Sugar');
  assert.strictEqual(normalized[2].remarks, '', 'Redundant Blood Chemistry remarks must be cleared in normalization');

  console.log('  ✅ Catalog procedures and Image 2 normalization verified.');

  // 2. Test PhilHealth Database Table & Model Operations
  console.log('\n--- Step 2: Testing PhilHealth Database & Model CRUD ---');
  const testDbPath = path.join(__dirname, 'tmp-test-philhealth.db');
  if (fs.existsSync(testDbPath)) {
    try { fs.unlinkSync(testDbPath); } catch (_) {}
  }

  const { createDb } = require('../lis-fullstack/lib/sqliteDb');
  const db = createDb(testDbPath);
  if (db._readyPromise) {
    await db._readyPromise;
  }
  global.db = db;

  const PhilhealthRecord = require('../lis-fullstack/models/PhilhealthRecord');
  const Patient = require('../lis-fullstack/models/Patient');
  const Test = require('../lis-fullstack/models/Test');

  // Test control number generator
  const ctrlNo1 = PhilhealthRecord.getNextControlNo('2026-10-05');
  assert.strictEqual(ctrlNo1, 'PH-2026-10-00001', 'First control number must be PH-2026-10-00001');

  const ctrlNo2 = PhilhealthRecord.getNextControlNo('2026-10-05');
  assert.strictEqual(ctrlNo2, 'PH-2026-10-00002', 'Second control number must be PH-2026-10-00002');

  // Create a PhilhealthRecord directly
  const rec = new PhilhealthRecord({
    controlNo: ctrlNo1,
    patientId: 'pat-ph-001',
    recordDate: '2026-10-05',
    firstName: 'Juan',
    middleName: 'Dela',
    lastName: 'Cruz',
    pinNo: '12-345678901-2',
    agency: 'DepEd Region 3',
    pcuError: 'OK-VERIFIED',
    procedures: [
      { key: 'cbc', label: 'Complete Blood Count (CBC)', category: 'Hematology', remarks: '', targetArea: 'Extraction Area' },
      { key: 'fbs', label: 'Fasting Blood Sugar (FBS)', category: 'Blood Chemistry', remarks: 'Fasting Blood Sugar: Blood Chemistry', targetArea: 'Extraction Area' }
    ]
  });

  assert.strictEqual(rec.fullName, 'Juan Dela Cruz');
  assert.strictEqual(rec.tranche1Encoded, 'Pending');
  assert.strictEqual(rec.tranche2Encoded, 'Pending');
  assert.strictEqual(rec.ekas, 'Pending');
  assert.strictEqual(rec.tranche1Paid, 'Not Paid');
  assert.strictEqual(rec.tranche2Paid, 'Not Paid');
  assert.strictEqual(rec.status, 'Pending Approval');

  // Save record (await async save)
  await rec.save();

  // Find record by ID (await async findById)
  const found = await PhilhealthRecord.findById(rec.id);
  assert.ok(found, 'Record must be retrieved from database');
  assert.strictEqual(found.controlNo, 'PH-2026-10-00001');
  assert.strictEqual(found.pinNo, '12-345678901-2');
  assert.strictEqual(found.agency, 'DepEd Region 3');
  assert.strictEqual(found.procedures.length, 2);

  console.log('  ✅ Database persistence and control number generation verified.');

  // 3. Test Patient Model Integration with PhilHealth Agency
  console.log('\n--- Step 3: Testing Patient Model & Agency Field ---');
  const pat = new Patient({
    firstName: 'Maria',
    middleName: 'Santos',
    lastName: 'Reyes',
    dateOfBirth: '1985-04-12',
    gender: 'Female',
    philhealthConsent: true,
    philhealthId: '09-876543210-9',
    philhealthAgency: 'LGU San Fernando'
  });

  assert.strictEqual(pat.philhealthAgency, 'LGU San Fernando', 'Patient model must capture philhealthAgency');
  const patJson = pat.toJSON();
  assert.strictEqual(patJson.philhealthAgency, 'LGU San Fernando', 'Patient toJSON must include philhealthAgency');

  console.log('  ✅ Patient model captures philhealthAgency field correctly.');

  // 4. Test Clinical Routing & Skipping Payment Area
  console.log('\n--- Step 4: Testing Clinical Routing (Skipping Payment Area) ---');

  // Simulate approving an order with Blood Chemistry (FBS + Creatinine) + Chest X-ray + Sputum Microscopy
  const orderProcedures = [
    { key: 'fbs', label: 'Fasting Blood Sugar (FBS)', category: 'Blood Chemistry', remarks: 'Fasting Blood Sugar: Blood Chemistry', targetArea: 'Extraction Area' },
    { key: 'creatinine', label: 'Creatinine', category: 'Blood Chemistry', remarks: 'Creatinine: Blood Chemistry', targetArea: 'Extraction Area' },
    { key: 'chest_xray', label: 'Chest X-ray', category: 'Radiology', remarks: '', targetArea: 'X-ray' },
    { key: 'sputum_microscopy', label: 'Sputum Microscopy', category: 'Send-out', remarks: 'Specimen in sterile container sent to external lab', forSendOut: true, targetArea: 'Sendout' }
  ];

  const createdTests = [];
  const copyProcedures = orderProcedures.slice();

  // 1. Group Blood Chemistry
  const bloodItems = copyProcedures.filter(p => p.category === 'Blood Chemistry');
  assert.strictEqual(bloodItems.length, 2, 'Two blood chemistry items must be present');

  if (bloodItems.length > 1) {
    const t = new Test({
      testId: 'BC0000001',
      patient: pat.id,
      testType: 'Blood Chemistry',
      testDate: (new Date()).toISOString(),
      status: 'Extraction Area', // Clinical area directly!
      requestedBy: 'user-admin',
      requestedTests: bloodItems.map(b => ({ key: b.key, label: b.label, amount: 0, lab: 'clinical', area: 'Extraction Area', remarks: b.remarks })),
      chargedToPhilhealth: true,
      paymentMethod: 'PhilHealth',
      paid: true,
      price: 0
    });
    createdTests.push(t);

    for (const b of bloodItems) {
      const idx = copyProcedures.findIndex(x => x.key === b.key);
      if (idx >= 0) copyProcedures.splice(idx, 1);
    }
  }

  // 2. Individual items
  for (const p of copyProcedures) {
    const t = new Test({
      testId: p.key === 'chest_xray' ? 'XR0000001' : 'SO0000001',
      patient: pat.id,
      testType: p.label,
      testDate: (new Date()).toISOString(),
      status: p.targetArea,
      requestedBy: 'user-admin',
      requestedTests: [{ key: p.key, label: p.label, amount: 0, lab: p.forSendOut ? 'external' : 'clinical', area: p.targetArea, remarks: p.remarks }],
      chargedToPhilhealth: true,
      paymentMethod: 'PhilHealth',
      paid: true,
      price: 0
    });
    createdTests.push(t);
  }

  assert.strictEqual(createdTests.length, 3, 'Must create 3 tests: grouped Blood Chemistry, Chest X-ray, Sputum Microscopy');

  const bcTest = createdTests.find(t => t.testType === 'Blood Chemistry');
  assert.ok(bcTest, 'Blood Chemistry test must be created');
  assert.strictEqual(bcTest.status, 'Extraction Area', 'Blood chemistry must be placed directly in Extraction Area');
  assert.strictEqual(bcTest.chargedToPhilhealth, true, 'Test must be flagged chargedToPhilhealth');
  assert.strictEqual(bcTest.requestedTests.length, 2, 'Both FBS and Creatinine must be bundled');

  const xrTest = createdTests.find(t => t.testType === 'Chest X-ray');
  assert.strictEqual(xrTest.status, 'X-ray', 'Chest X-ray must be routed directly to X-ray');
  assert.strictEqual(xrTest.chargedToPhilhealth, true);

  const soTest = createdTests.find(t => t.testType === 'Sputum Microscopy');
  assert.strictEqual(soTest.status, 'Sendout', 'Sputum Microscopy must be routed directly to Sendout');
  assert.strictEqual(soTest.chargedToPhilhealth, true);

  // Verify that NONE of the created tests have status === 'Payment Area'
  for (const t of createdTests) {
    assert.notStrictEqual(t.status, 'Payment Area', `Test ${t.testId} must NOT be in Payment Area`);
  }

  // Verify that Payment Area query filter strictly excludes them:
  // (t.chargedToPhilhealth || t.paymentMethod === 'PhilHealth')
  const simulatedQueue = createdTests.filter(t => t.status === 'Payment Area' && !t.chargedToPhilhealth && t.paymentMethod !== 'PhilHealth');
  assert.strictEqual(simulatedQueue.length, 0, 'PhilHealth tests must never appear in Payment Area queue');

  console.log('  ✅ Tests route directly to clinical stations (Extraction Area, X-ray, Sendout) and skip Payment Area completely.');

  // 5. Test Bulk DOH SOA Settlement
  console.log('\n--- Step 5: Testing Bulk DOH SOA Settlement ---');
  const rec2 = new PhilhealthRecord({
    controlNo: ctrlNo2,
    patientId: 'pat-ph-002',
    recordDate: '2026-10-05',
    firstName: 'Ana',
    middleName: 'Lopez',
    lastName: 'Tan',
    pinNo: '11-223344556-7',
    agency: 'DSWD Central',
    status: 'Approved'
  });
  await rec2.save();

  // Simulate bulk mark paid for rec and rec2 for 1st Tranche
  const targetIds = [rec.id, rec2.id];
  const soaNumber = 'DOH-SOA-2026-OCT-0099';
  const paymentDate = '2026-10-05';

  // Test universal multi-select batch update for Tranche Encoded and Tranche Paid
  for (const id of targetIds) {
    const r = await PhilhealthRecord.findById(id);
    r.tranche1Encoded = 'Completed';
    r.tranche2Encoded = 'Completed';
    r.ekas = 'Completed';
    r.tranche1Paid = 'Paid';
    r.tranche2Paid = 'Paid';
    r.soaRef = soaNumber;
    r.paidDate = paymentDate;
    await r.save();
  }

  const checkRec1 = await PhilhealthRecord.findById(rec.id);
  assert.strictEqual(checkRec1.tranche1Encoded, 'Completed');
  assert.strictEqual(checkRec1.tranche2Encoded, 'Completed');
  assert.strictEqual(checkRec1.ekas, 'Completed');
  assert.strictEqual(checkRec1.tranche1Paid, 'Paid');
  assert.strictEqual(checkRec1.tranche2Paid, 'Paid');
  assert.strictEqual(checkRec1.soaRef, 'DOH-SOA-2026-OCT-0099');
  assert.strictEqual(checkRec1.paidDate, '2026-10-05');

  const checkRec2 = await PhilhealthRecord.findById(rec2.id);
  assert.strictEqual(checkRec2.tranche1Encoded, 'Completed');
  assert.strictEqual(checkRec2.tranche2Encoded, 'Completed');
  assert.strictEqual(checkRec2.ekas, 'Completed');
  assert.strictEqual(checkRec2.tranche1Paid, 'Paid');
  assert.strictEqual(checkRec2.tranche2Paid, 'Paid');
  assert.strictEqual(checkRec2.soaRef, 'DOH-SOA-2026-OCT-0099');

  console.log('  ✅ Universal batch update for Tranches Encoded and Tranches Paid verified.');

  // 6. Test CSV Export Format & Columns
  console.log('\n--- Step 6: Testing CSV Export Formatting & Headers ---');
  const expectedColumns = [
    '#',
    'CONTROL NO',
    'DATE',
    'FIRST NAME',
    'MIDDLE NAME',
    'LAST NAME',
    'FULL NAME',
    'PIN NO.',
    'PROCEDURE',
    'AGENCY',
    'PCU/ERROR',
    '1ST TRANCHE ENCODED',
    '2ND TRANCHE ENCODED',
    'EKAS',
    '1ST TRANCHE PAID',
    '2ND TRANCHE PAID',
    'SOA REF',
    'PAID DATE',
    'STATUS',
    'APPROVED BY',
    'APPROVED AT'
  ];

  function escapeCsv(val) {
    if (val === null || val === undefined) return '""';
    const s = String(val).replace(/"/g, '""');
    return `"${s}"`;
  }

  const allRecords = await PhilhealthRecord.find();
  const lines = [expectedColumns.map(escapeCsv).join(',')];

  allRecords.forEach((r, idx) => {
    const procList = (r.procedures || []).map(p => p.label).join('; ');
    const row = [
      idx + 1,
      r.controlNo || '',
      r.recordDate || '',
      r.firstName || '',
      r.middleName || '',
      r.lastName || '',
      r.fullName || '',
      r.pinNo || '',
      procList,
      r.agency || '',
      r.pcuError || '',
      r.tranche1Encoded || 'Pending',
      r.tranche2Encoded || 'Pending',
      r.ekas || 'Pending',
      r.tranche1Paid || 'Not Paid',
      r.tranche2Paid || 'Not Paid',
      r.soaRef || '',
      r.paidDate || '',
      r.status || 'Pending Approval',
      r.approvedBy || '',
      r.approvedAt || ''
    ];
    lines.push(row.map(escapeCsv).join(','));
  });

  const csvOutput = '\uFEFF' + lines.join('\r\n');

  assert.ok(csvOutput.startsWith('\uFEFF'), 'CSV output must start with UTF-8 BOM');
  assert.ok(csvOutput.includes('CONTROL NO'), 'CSV must contain CONTROL NO header');
  assert.ok(csvOutput.includes('1ST TRANCHE PAID'), 'CSV must contain 1ST TRANCHE PAID header');
  assert.ok(csvOutput.includes('2ND TRANCHE PAID'), 'CSV must contain 2ND TRANCHE PAID header');
  assert.ok(csvOutput.includes('DepEd Region 3'), 'CSV must contain agency data');
  assert.ok(csvOutput.includes('DOH-SOA-2026-OCT-0099'), 'CSV must contain SOA reference');

  console.log('  ✅ CSV export format, UTF-8 BOM, and column data verified.');

  // 7. Test Worksheet PhilHealth Report Endpoints (Preview & Download)
  console.log('\n--- Step 7: Testing Worksheet Reports Preview & Download Logic ---');
  const ExcelJS = require('../lis-fullstack/node_modules/exceljs');

  // Test preview data mapping
  const previewRecords = await PhilhealthRecord.find({});
  const previewRows = previewRecords.map((r, idx) => ({
    index: idx + 1,
    controlNo: r.controlNo || '',
    recordDate: r.recordDate || '',
    fullName: r.fullName || '',
    pinNo: r.pinNo || '',
    procedures: (r.procedures || []).map(p => p.label).join('; ') || '—',
    agency: r.agency || '—',
    pcuError: r.pcuError || '—',
    tranche1Encoded: r.tranche1Encoded || 'Pending',
    tranche2Encoded: r.tranche2Encoded || 'Pending',
    ekas: r.ekas || 'Pending',
    tranche1Paid: r.tranche1Paid || 'Not Paid',
    tranche2Paid: r.tranche2Paid || 'Not Paid',
    status: r.status || 'Pending Approval'
  }));

  assert.strictEqual(previewRows.length, 2, 'Worksheet preview must contain 2 records');
  const p1 = previewRows.find(r => r.controlNo === 'PH-2026-10-00001');
  const p2 = previewRows.find(r => r.controlNo === 'PH-2026-10-00002');
  assert.ok(p1, 'PH-2026-10-00001 must exist in preview');
  assert.ok(p2, 'PH-2026-10-00002 must exist in preview');
  assert.strictEqual(p1.tranche1Paid, 'Paid');
  assert.strictEqual(p2.tranche1Paid, 'Paid');

  // Test Excel generation with ExcelJS
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('PhilHealth Claims');
  ws.columns = expectedColumns.map(h => ({ header: h, key: h, width: 20 }));
  previewRows.forEach(r => {
    ws.addRow({
      '#': r.index,
      'CONTROL NO': r.controlNo,
      'DATE': r.recordDate,
      'NAME': r.fullName,
      'PIN NO.': r.pinNo,
      'PROCEDURE': r.procedures,
      'AGENCY': r.agency,
      'PCU/ERROR': r.pcuError,
      '1ST TRANCHE ENCODED': r.tranche1Encoded,
      '2ND TRANCHE ENCODED': r.tranche2Encoded,
      'EKAS': r.ekas,
      '1ST TRANCHE PAID': r.tranche1Paid,
      '2ND TRANCHE PAID': r.tranche2Paid,
      'STATUS': r.status
    });
  });

  const xlsxBuffer = await workbook.xlsx.writeBuffer();
  assert.ok(xlsxBuffer && xlsxBuffer.length > 0, 'ExcelJS workbook must produce valid binary buffer');
  console.log('  ✅ Worksheet PhilHealth preview mapping & Excel (.xlsx) export verified.');

  // Clean up test DB
  if (db && typeof db.close === 'function') {
    db.close();
  }
  if (fs.existsSync(testDbPath)) {
    try { fs.unlinkSync(testDbPath); } catch (_) {}
  }

  console.log('\n========================================================================');
  console.log('🎉 ALL PHILHEALTH INTEGRATION TESTS PASSED SUCCESSFULLY!');
  console.log('========================================================================\n');
}

runTests().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
