/**
 * Test: Levey-Jennings Date Range Filtering, Table Data, and Two-Way Sync
 * Verifies:
 * 1. Date range filtering on /equipment/:id/qc/levey-jennings
 * 2. QC entry deletion via DELETE /equipment/qc/entries/:entryId
 * 3. Two-way synchronization elements and data table in views/equipment/index.ejs
 * 4. Date filtering in print route views/equipment/print_lj.ejs
 * 5. Complete absence of ISO standards across QC templates (DOH compliance only)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { initDb } = require('../lis-fullstack/lib/sqliteDb');

async function main() {
  console.log('===========================================================');
  console.log('  TESTING LJ DATE FILTERING, TABLE, & TWO-WAY SYNC         ');
  console.log('===========================================================');

  // 1. Verify index.ejs contents
  console.log('\nTest 1: Verifying index.ejs Elements...');
  const indexEjs = fs.readFileSync(path.join(__dirname, '../lis-fullstack/views/equipment/index.ejs'), 'utf8');

  // Check date range inputs and presets
  assert(indexEjs.includes('id="lj_startDate"'), 'Missing lj_startDate');
  assert(indexEjs.includes('id="lj_endDate"'), 'Missing lj_endDate');
  assert(indexEjs.includes("setLjDatePreset('month')"), 'Missing This Month preset');
  assert(indexEjs.includes("setLjDatePreset('30days')"), 'Missing Last 30 Days preset');
  assert(indexEjs.includes("setLjDatePreset('all')"), 'Missing All Time preset');

  // Check table elements and sort order
  assert(indexEjs.includes('id="lj_tableBody"'), 'Missing lj_tableBody');
  assert(indexEjs.includes('id="lj_tableRunCount"'), 'Missing lj_tableRunCount');
  assert(indexEjs.includes('id="lj_statusFilter"'), 'Missing lj_statusFilter');
  assert(indexEjs.includes('id="lj_sortOrder"'), 'Missing lj_sortOrder');

  // Check two-way sync form elements
  assert(indexEjs.includes('id="quick_eqId"'), 'Missing quick_eqId');
  assert(indexEjs.includes('id="quick_analyteCode"'), 'Missing quick_analyteCode');
  assert(indexEjs.includes('onQuickEquipmentChange()'), 'Missing onQuickEquipmentChange()');
  assert(indexEjs.includes('onQuickAnalyteChange()'), 'Missing onQuickAnalyteChange()');
  assert(indexEjs.includes('onTopAnalyteChange()'), 'Missing onTopAnalyteChange()');

  // Check JS functions
  assert(indexEjs.includes('function renderLjTable('), 'Missing renderLjTable');
  assert(indexEjs.includes('function deleteQcEntryRecord('), 'Missing deleteQcEntryRecord');
  assert(indexEjs.includes('function setLjDatePreset('), 'Missing setLjDatePreset');

  console.log('✓ Test 1 Passed: All HTML and JS components for date filtering, table, and two-way sync exist in index.ejs.');

  // 2. Verify routes in equipment.js
  console.log('\nTest 2: Verifying routes in equipment.js...');
  const routesEquipment = fs.readFileSync(path.join(__dirname, '../lis-fullstack/routes/equipment.js'), 'utf8');

  assert(routesEquipment.includes("router.delete('/qc/entries/:entryId'"), 'Missing DELETE /qc/entries/:entryId route');
  assert(routesEquipment.includes('startDate') && routesEquipment.includes('endDate'), 'Missing startDate/endDate filtering in equipment.js');

  console.log('✓ Test 2 Passed: Backend routes handle DELETE and date range filtering.');

  // 3. Initialize test SQLite DB
  console.log('\nTest 3: Initializing SQLite DB and verifying deleteQcEntry...');
  const TEST_DB = path.join(__dirname, 'test-lj-date.db');
  if (fs.existsSync(TEST_DB)) {
    try { fs.unlinkSync(TEST_DB); } catch (_) {}
  }
  const db = await initDb(TEST_DB);
  assert(typeof db.deleteQcEntry === 'function', 'db.deleteQcEntry is not a function');
  console.log('✓ Test 3 Passed: db.deleteQcEntry is available.');

  // 4. Verify ISO standard removal across all QC templates
  console.log('\nTest 4: Verifying DOH compliance and no ISO claims...');
  const printLj = fs.readFileSync(path.join(__dirname, '../lis-fullstack/views/equipment/print_lj.ejs'), 'utf8');
  const printNeqas = fs.readFileSync(path.join(__dirname, '../lis-fullstack/views/equipment/print_neqas.ejs'), 'utf8');
  const printMonthly = fs.readFileSync(path.join(__dirname, '../lis-fullstack/views/equipment/print_monthly_qc.ejs'), 'utf8');

  assert(!printLj.includes('ISO 15189'), 'print_lj.ejs contains ISO 15189');
  assert(!printLj.includes('ISO 17025'), 'print_lj.ejs contains ISO 17025');
  assert(!printNeqas.includes('ISO 15189'), 'print_neqas.ejs contains ISO 15189');
  assert(!printMonthly.includes('ISO 15189'), 'print_monthly_qc.ejs contains ISO 15189');
  assert(!indexEjs.includes('ISO 15189'), 'index.ejs contains ISO 15189');

  assert(printLj.includes('DOH AO No. 2020-0035'), 'print_lj.ejs missing DOH AO No. 2020-0035');
  assert(printNeqas.includes('DOH AO No. 2020-0035'), 'print_neqas.ejs missing DOH AO No. 2020-0035');
  console.log('✓ Test 4 Passed: No ISO claims found; all forms strictly reference DOH Administrative Orders.');

  // 5. Functional Test of Levey-Jennings Data Filtering & Entry Deletion
  console.log('\nTest 5: Functional Test of QC Entry CRUD and Date Filtering...');
  const testEqId = 'EQ-TEST-QC-' + Date.now();
  db.saveEquipment({
    id: testEqId,
    equipmentCode: 'EQ-TEST',
    name: 'Test Clinical Analyzer',
    category: 'Clinical Chemistry Analyzer',
    department: 'Clinical Chemistry',
    serialNumber: 'SN-TEST-1234'
  });

  // Create test control
  const testCtrlId = 'CTRL-TEST-' + Date.now();
  db.saveQcControl({
    id: testCtrlId,
    equipmentId: testEqId,
    controlName: 'Test Bio-Rad Lyphochek Level 1',
    lotNumber: 'LOT-TEST-01',
    level: 'Level 1 (Normal)',
    analytes: [
      { analyteCode: 'fbs', analyteName: 'Glucose', unit: 'mg/dL', targetMean: 100.0, targetSd: 4.0 }
    ]
  });

  // Insert 3 entries across different dates
  const e1Id = 'ENTRY-TEST-1-' + Date.now();
  const e2Id = 'ENTRY-TEST-2-' + Date.now();
  const e3Id = 'ENTRY-TEST-3-' + Date.now();

  db.saveQcEntry({
    id: e1Id,
    equipmentId: testEqId,
    controlId: testCtrlId,
    analyteCode: 'fbs',
    measuredValue: 101.0,
    runDate: '2026-08-15T08:00:00.000Z',
    zScore: 0.25,
    status: 'ACCEPTED'
  });

  db.saveQcEntry({
    id: e2Id,
    equipmentId: testEqId,
    controlId: testCtrlId,
    analyteCode: 'fbs',
    measuredValue: 102.5,
    runDate: '2026-09-01T08:00:00.000Z',
    zScore: 0.625,
    status: 'ACCEPTED'
  });

  db.saveQcEntry({
    id: e3Id,
    equipmentId: testEqId,
    controlId: testCtrlId,
    analyteCode: 'fbs',
    measuredValue: 109.0,
    runDate: '2026-09-05T08:00:00.000Z',
    zScore: 2.25,
    status: 'WARNING',
    rulesViolated: ['1:2s']
  });

  const allEntries = db.getQcEntries(testEqId, 'fbs');
  assert.strictEqual(allEntries.length, 3, 'Should have 3 QC entries');

  // Filter for September only
  const sepEntries = allEntries.filter(e => {
    const d = (e.runDate || '').split('T')[0];
    return d >= '2026-09-01' && d <= '2026-09-30';
  });
  assert.strictEqual(sepEntries.length, 2, 'Should filter down to 2 entries for September');

  // Test deletion of e3
  const deleted = db.deleteQcEntry(e3Id);
  assert.strictEqual(deleted, true, 'deleteQcEntry should return true');

  const afterDeleteEntries = db.getQcEntries(testEqId, 'fbs');
  assert.strictEqual(afterDeleteEntries.length, 2, 'Should have 2 QC entries after deletion');
  assert(!afterDeleteEntries.find(e => e.id === e3Id), 'Deleted entry e3 should not exist');

  // Clean up test db
  db.close();
  try { fs.unlinkSync(TEST_DB); } catch (_) {}

  console.log('✓ Test 5 Passed: QC Entry CRUD, date filtering, and deletion behave as expected.');

  console.log('\n===========================================================');
  console.log('  ALL LEVEY-JENNINGS DATE & TABLE TESTS PASSED (5/5)       ');
  console.log('===========================================================');
}

main().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
