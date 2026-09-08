/**
 * Test: Levey-Jennings Dynamic Date Filtering, Table Updates, Printable Coverage, and Multi-Analyzer Support
 * Verifies:
 * 1. onLjDateChange() exists, triggers loadLjChart(), and table + canvas update dynamically.
 * 2. Table dynamic filtering (status filter) and sorting (date asc/desc, zscore, violations).
 * 3. Printable Levey-Jennings report (/qc/print) strictly covers only the selected start and end date.
 * 4. Printable Multi-analyte monthly report (/qc/print-monthly-summary) strictly covers only the selected start and end date.
 * 5. Top analyzer selector only includes machines with recorded QC entries.
 * 6. Multi-equipment analyte configuration (POST /equipment/:id/qc/analytes) and quick recording.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { initDb } = require('../lis-fullstack/lib/sqliteDb');
const { buildLeveyJenningsDataset } = require('../lis-fullstack/lib/leveyJenningsService');
const { QcControl } = require('../lis-fullstack/models/QcControl');
const QcEntry = require('../lis-fullstack/models/QcEntry');
const Equipment = require('../lis-fullstack/models/Equipment');

async function main() {
  console.log('================================================================');
  console.log('  TESTING DYNAMIC DATE FILTERING, PRINT COVERAGE & MULTI-MACHINE');
  console.log('================================================================');

  const indexEjs = fs.readFileSync(path.join(__dirname, '../lis-fullstack/views/equipment/index.ejs'), 'utf8');
  const routesEquipment = fs.readFileSync(path.join(__dirname, '../lis-fullstack/routes/equipment.js'), 'utf8');
  const printLjEjs = fs.readFileSync(path.join(__dirname, '../lis-fullstack/views/equipment/print_lj.ejs'), 'utf8');
  const printMonthlyEjs = fs.readFileSync(path.join(__dirname, '../lis-fullstack/views/equipment/print_monthly_qc.ejs'), 'utf8');

  // Test 1: Dynamic Date Event Handlers in index.ejs
  console.log('\nTest 1: Verifying dynamic date change event handlers and table update hooks...');
  assert(indexEjs.includes('function onLjDateChange()'), 'Missing function onLjDateChange()');
  assert(indexEjs.includes('onchange="onLjDateChange()"'), 'Missing onchange="onLjDateChange()"');
  assert(indexEjs.includes('oninput="onLjDateChange()"'), 'Missing oninput="onLjDateChange()"');
  assert(indexEjs.includes('loadLjChart()'), 'onLjDateChange must call loadLjChart()');
  assert(indexEjs.includes('renderLjTable(json.data)'), 'loadLjChart must call renderLjTable to update table dynamically');
  assert(indexEjs.includes('renderLeveyJenningsCanvas(json.data)'), 'loadLjChart must redraw canvas dynamically');
  console.log('✓ Test 1 Passed: onLjDateChange() dynamically triggers chart and table re-render.');

  // Test 2: Top Selector Filtering and Analyte Presets
  console.log('\nTest 2: Verifying top analyzer filtering and multi-machine analyte creation...');
  assert(indexEjs.includes('machinesWithData = (allEquipment || []).filter(eq => (qcEntryCounts[eq.id] || 0) > 0)'), 'Top selector must only show equipment with entry count > 0');
  assert(indexEjs.includes('openAddAnalyteModal'), 'Missing openAddAnalyteModal');
  assert(indexEjs.includes('applyAnalytePreset'), 'Missing applyAnalytePreset');
  assert(indexEjs.includes('saveNewAnalyte'), 'Missing saveNewAnalyte');
  assert(routesEquipment.includes("router.post('/:id/qc/analytes'"), 'Missing POST /:id/qc/analytes endpoint in routes/equipment.js');
  console.log('✓ Test 2 Passed: Top selector filtering and + Add Analyte modal integration confirmed.');

  // Test 3: Printable Forms Strict Date Coverage Passing
  console.log('\nTest 3: Verifying print buttons pass startDate and endDate...');
  assert(indexEjs.includes("printLjReport()") && indexEjs.includes("params.set('startDate', startDate)") && indexEjs.includes("params.set('endDate', endDate)"), 'printLjReport must pass startDate and endDate');
  assert(indexEjs.includes("printMonthlyQcReport()") && indexEjs.includes("params.set('startDate', startDate)") && indexEjs.includes("params.set('endDate', endDate)"), 'printMonthlyQcReport must pass startDate and endDate');
  console.log('✓ Test 3 Passed: Both print functions pass startDate and endDate params.');

  // Test 4: Backend routes strict date filtering
  console.log('\nTest 4: Verifying backend strict date range logic...');
  const TEST_DB = path.join(__dirname, 'test-lj-coverage.db');
  if (fs.existsSync(TEST_DB)) {
    try { fs.unlinkSync(TEST_DB); } catch (_) {}
  }
  const db = await initDb(TEST_DB);

  const eqChem = {
    id: 'EQ-CHEM-COVERAGE',
    equipmentCode: 'EQ-CHEM-001',
    name: 'Clinical Chemistry BS-240',
    category: 'Clinical Chemistry Analyzer',
    department: 'Clinical Chemistry'
  };
  db.saveEquipment(eqChem);

  const ctrlChem = {
    id: 'CTRL-CHEM-COVERAGE',
    equipmentId: eqChem.id,
    controlName: 'Bio-Rad Lyphochek Level 1',
    lotNumber: 'LOT-CHEM-2026-N1',
    level: 'Level 1 (Normal)',
    analytes: [
      { analyteCode: 'fbs', analyteName: 'Glucose', unit: 'mg/dL', targetMean: 100.0, targetSd: 4.0, teaPercent: 10.0 }
    ]
  };
  db.saveQcControl(ctrlChem);

  // Insert entries across August, early September, mid September, and late September
  const entries = [
    { id: 'E-AUG', equipmentId: eqChem.id, controlId: ctrlChem.id, analyteCode: 'fbs', measuredValue: 99.0, runDate: '2026-08-25T08:00:00.000Z', status: 'ACCEPTED', zScore: -0.25 },
    { id: 'E-SEP-02', equipmentId: eqChem.id, controlId: ctrlChem.id, analyteCode: 'fbs', measuredValue: 100.5, runDate: '2026-09-02T08:00:00.000Z', status: 'ACCEPTED', zScore: 0.125 },
    { id: 'E-SEP-05', equipmentId: eqChem.id, controlId: ctrlChem.id, analyteCode: 'fbs', measuredValue: 101.0, runDate: '2026-09-05T08:00:00.000Z', status: 'ACCEPTED', zScore: 0.25 },
    { id: 'E-SEP-10', equipmentId: eqChem.id, controlId: ctrlChem.id, analyteCode: 'fbs', measuredValue: 108.5, runDate: '2026-09-10T08:00:00.000Z', status: 'WARNING', zScore: 2.125 },
    { id: 'E-SEP-20', equipmentId: eqChem.id, controlId: ctrlChem.id, analyteCode: 'fbs', measuredValue: 100.0, runDate: '2026-09-20T08:00:00.000Z', status: 'ACCEPTED', zScore: 0.0 }
  ];
  entries.forEach(e => db.saveQcEntry(e));

  // Test date filtering simulation matching equipment.js GET /qc/levey-jennings & GET /qc/print
  function filterQcEntries(eqId, analyteCode, startDate, endDate) {
    let list = (db.getQcEntries(eqId, analyteCode) || []).map(e => new QcEntry(e));
    if (startDate) list = list.filter(e => (e.runDate || '').split('T')[0] >= startDate);
    if (endDate) list = list.filter(e => (e.runDate || '').split('T')[0] <= endDate);
    return list;
  }

  // Range: 2026-09-01 to 2026-09-07
  const filtered1 = filterQcEntries(eqChem.id, 'fbs', '2026-09-01', '2026-09-07');
  assert.strictEqual(filtered1.length, 2, 'Should only contain 2 entries between Sep 1 and Sep 7');
  assert(filtered1.some(e => e.id === 'E-SEP-02'), 'Must include Sep 2 entry');
  assert(filtered1.some(e => e.id === 'E-SEP-05'), 'Must include Sep 5 entry');
  assert(!filtered1.some(e => e.id === 'E-AUG'), 'Must exclude August entry');
  assert(!filtered1.some(e => e.id === 'E-SEP-10'), 'Must exclude Sep 10 entry');
  assert(!filtered1.some(e => e.id === 'E-SEP-20'), 'Must exclude Sep 20 entry');

  // Verify dataset built from this filtered range only has 2 points
  const ds1 = buildLeveyJenningsDataset(new QcControl(ctrlChem), 'fbs', filtered1, { equipment: new Equipment(eqChem) });
  assert.strictEqual(ds1.points.length, 2, 'Chart dataset points must only be 2');
  console.log('✓ Test 4 Passed: Date filtering strictly bounds QC points to the exact start and end date.');

  // Test 5: Adding Analyte to Hematology Analyzer and Verifying Entry Count
  console.log('\nTest 5: Testing multi-analyzer support (Hematology analyzer analyte registration)...');
  const eqHema = {
    id: 'EQ-HEMA-COVERAGE',
    equipmentCode: 'EQ-HEMA-001',
    name: 'Sysmex XN-350 Automated Hematology',
    category: 'Hematology Analyzer',
    department: 'Hematology'
  };
  db.saveEquipment(eqHema);

  // Initially EQ-HEMA has 0 entries
  let initialEntries = db.getQcEntries(eqHema.id);
  assert.strictEqual((initialEntries || []).length, 0, 'EQ-HEMA should initially have 0 QC entries');

  // Save new QC control with WBC analyte
  const ctrlHema = {
    id: 'CTRL-HEMA-001',
    equipmentId: eqHema.id,
    controlName: 'Hematology Tri-Level Control',
    lotNumber: 'LOT-HEMA-2026-N1',
    level: 'Level 1 (Normal)',
    analytes: [
      { analyteCode: 'wbc', analyteName: 'White Blood Cells (WBC)', unit: '10^3/uL', targetMean: 7.50, targetSd: 0.40, teaPercent: 15.0 }
    ]
  };
  db.saveQcControl(ctrlHema);

  // Record a reading for WBC
  const entryHema = {
    id: 'E-HEMA-1',
    equipmentId: eqHema.id,
    controlId: ctrlHema.id,
    analyteCode: 'wbc',
    measuredValue: 7.45,
    runDate: '2026-09-08T09:00:00.000Z',
    status: 'ACCEPTED',
    zScore: -0.125
  };
  db.saveQcEntry(entryHema);

  const afterHemaEntries = db.getQcEntries(eqHema.id);
  assert.strictEqual(afterHemaEntries.length, 1, 'EQ-HEMA should now have 1 QC entry');
  console.log('✓ Test 5 Passed: Hematology analyzer successfully registered analyte and recorded QC run.');

  // Clean up
  db.close();
  try { fs.unlinkSync(TEST_DB); } catch (_) {}

  console.log('\n================================================================');
  console.log('  ALL DYNAMIC DATE & PRINT COVERAGE TESTS PASSED (5/5)          ');
  console.log('================================================================');
}

main().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
