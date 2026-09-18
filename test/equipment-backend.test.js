/**
 * Automated Verification Script for Equipment Management, Calibration Tracking,
 * Levey-Jennings Statistical QC, and NEQAS EQA Server Subsystem.
 * Located in centralized /test directory per repository standards.
 */
const path = require('path');
const fs = require('fs');
const assert = require('assert');

// Test database file in test directory
const TEST_DB_PATH = path.join(__dirname, 'test-equipment.db');
if (fs.existsSync(TEST_DB_PATH)) {
  try { fs.unlinkSync(TEST_DB_PATH); } catch (_) {}
}

async function runTests() {
  console.log('====================================================');
  console.log('  STARTING EQUIPMENT & LEVEY-JENNINGS BACKEND TESTS  ');
  console.log('====================================================\n');

  // 1. Initialize SQLite Database
  const { initDb } = require('../lis-fullstack/lib/sqliteDb');
  const db = await initDb(TEST_DB_PATH);
  global.db = db;
  console.log('✓ Step 1: Database initialized successfully. Engine:', db._engine);

  // 2. Verify Schema / Tables Creation
  const tables = db._sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
  const requiredTables = ['equipment', 'equipment_logs', 'qc_controls', 'qc_entries', 'neqas_records'];
  for (const table of requiredTables) {
    assert(tables.includes(table), `Expected table "${table}" to exist in SQLite schema.`);
  }
  console.log('✓ Step 2: All 5 required tables verified in SQLite schema:', requiredTables.join(', '));

  // 3. Test Models & Domain Logic
  const Equipment = require('../lis-fullstack/models/Equipment');
  const EquipmentLog = require('../lis-fullstack/models/EquipmentLog');
  const { QcControl, DEFAULT_CHEMISTRY_ANALYTES } = require('../lis-fullstack/models/QcControl');
  const QcEntry = require('../lis-fullstack/models/QcEntry');
  const NeqasRecord = require('../lis-fullstack/models/NeqasRecord');
  const {
    evaluateWestgardRules,
    calculateQcStatistics,
    buildLeveyJenningsDataset,
    generateDohMonthlyReport
  } = require('../lis-fullstack/lib/leveyJenningsService');

  // 3.1 Register Clinical Chemistry Equipment
  const chemEq = new Equipment({
    equipmentCode: 'EQ-CHEM-001',
    name: 'Mindray BS-240 Clinical Chemistry Analyzer',
    category: 'Clinical Chemistry Analyzer',
    department: 'Clinical Chemistry',
    manufacturer: 'Mindray',
    modelNumber: 'BS-240',
    serialNumber: 'SN-CHEM-98234',
    location: 'Chemistry Section - Bench A',
    calibrationCycleDays: 365,
    lastCalibrationDate: '2025-09-01T00:00:00.000Z',
    pmCycleDays: 180,
    lastPmDate: '2026-01-15T00:00:00.000Z'
  });
  db.saveEquipment(chemEq);
  console.log('✓ Step 3.1: Registered Clinical Chemistry Analyzer (EQ-CHEM-001).');

  // 3.2 Register Diagnostic X-Ray Unit
  const xrayEq = new Equipment({
    equipmentCode: 'EQ-XRAY-001',
    name: 'Shimadzu MobileDaRt Evolution MX7',
    category: 'Diagnostic X-Ray Unit (Mobile/Portable)',
    department: 'Radiology / X-Ray',
    manufacturer: 'Shimadzu',
    modelNumber: 'MX7',
    serialNumber: 'SN-XRAY-55219',
    location: 'X-Ray Room 1',
    calibrationCycleDays: 365,
    radiationSafetyDetails: {
      isRadiationEmitter: true,
      fdaCdrrhrRegNumber: 'FDA-CDRRHR-XR-2026-0419',
      radiationSafetyOfficer: 'Engr. J. Santos, RSO',
      tubeModel: 'Varian Rad-14',
      tubeSerialNumber: 'TB-884102',
      maxKvp: 150,
      maxMa: 500,
      totalFiltrationHvl: '2.5 mm Al eq.',
      lastRadiationSurveyDate: '2025-10-10T00:00:00.000Z',
      nextRadiationSurveyDate: '2026-10-10T00:00:00.000Z'
    }
  });
  db.saveEquipment(xrayEq);
  assert(xrayEq.isXRay, 'Expected xrayEq.isXRay to be true.');
  console.log('✓ Step 3.2: Registered Diagnostic X-Ray Unit (EQ-XRAY-001) with FDA CDRRHR specifications.');

  // 3.3 Register Custom Category Equipment (User Specified Category)
  const customEq = new Equipment({
    equipmentCode: 'EQ-CUSTOM-001',
    name: 'Dirui H-500 Urine Analyzer',
    category: 'Automated Urine Chemistry Analyzer',
    department: 'Clinical Microscopy',
    manufacturer: 'Dirui',
    serialNumber: 'SN-DIRUI-1029',
    location: 'Microscopy Bench 2'
  });
  db.saveEquipment(customEq);
  const fetchedCustom = db.getEquipmentByCode('EQ-CUSTOM-001');
  assert.strictEqual(fetchedCustom.category, 'Automated Urine Chemistry Analyzer');
  console.log('✓ Step 3.3: Registered Custom Category Equipment ("Automated Urine Chemistry Analyzer").');

  // 3.4 Verify Retrieval
  const fetchedChem = db.getEquipmentByCode('EQ-CHEM-001');
  assert(fetchedChem && fetchedChem.name === chemEq.name, 'Failed to retrieve equipment by code.');
  const chemistryList = db.getEquipmentByDepartment('Clinical Chemistry');
  assert(chemistryList.length >= 1, 'Expected at least 1 Clinical Chemistry unit.');
  console.log('✓ Step 3.4: Successfully queried equipment by code and department.');

  // 4. Test Service & Calibration Logging with Auto-Scheduling
  const calLog = new EquipmentLog({
    equipmentId: chemEq.id,
    equipmentName: chemEq.name,
    logType: 'CALIBRATION',
    serviceDate: '2026-09-08T00:00:00.000Z',
    serviceProviderType: 'EXTERNAL_ACCREDITED',
    serviceProviderName: 'Metrology Lab Inc.',
    technicianName: 'Engr. J. Santos',
    certificateNumber: 'CAL-2026-9912',
    standardReferenceUsed: 'NIST Traceable Filters Set #442',
    resultStatus: 'PASS',
    workPerformed: 'Full multi-point calibration. Optical density linearity verified within +/- 0.5% tolerance.'
  });
  db.saveEquipmentLog(calLog);

  // Auto-schedule next calibration and PM on service log
  chemEq.lastCalibrationDate = calLog.serviceDate;
  chemEq.nextCalibrationDate = chemEq.computeNextDate(chemEq.lastCalibrationDate, chemEq.calibrationCycleDays);
  chemEq.lastPmDate = calLog.serviceDate;
  chemEq.nextPmDate = chemEq.computeNextDate(chemEq.lastPmDate, chemEq.pmCycleDays);
  chemEq.evaluateStatus();
  db.saveEquipment(chemEq);

  // Verify that equipment lastCalibrationDate and nextCalibrationDate were automatically updated
  const updatedChem = new Equipment(db.getEquipmentById(chemEq.id));
  assert.strictEqual(updatedChem.lastCalibrationDate, '2026-09-08T00:00:00.000Z');
  assert.strictEqual(updatedChem.nextCalibrationDate, '2027-09-08T00:00:00.000Z');
  assert.strictEqual(updatedChem.status, 'OPERATIONAL');
  console.log(`✓ Step 4: Calibration & PM log saved. Next calibration auto-calculated: ${updatedChem.nextCalibrationDate} (Days remaining: ${updatedChem.daysUntilCalibration}). Status: ${updatedChem.status}`);

  // 5. Test Radiation Safety QA Physics Survey Logging
  const xraySurvey = new EquipmentLog({
    equipmentId: xrayEq.id,
    equipmentName: xrayEq.name,
    logType: 'RADIATION_SAFETY_SURVEY',
    serviceDate: '2026-09-08T00:00:00.000Z',
    serviceProviderType: 'INDEPENDENT_QP',
    serviceProviderName: 'Medical Physics Survey Group',
    technicianName: 'Dr. R. Alcantara, QMP',
    certificateNumber: 'RAD-SURVEY-2026-01',
    resultStatus: 'PASS',
    workPerformed: 'Radiation protection QA survey per DOH AO 2020-0035 and CDRRHR standards.',
    xrayPhysicsResults: {
      kvpPercentError: 2.1,
      exposureLinearityCol: 0.045, // Col <= 0.10 per AAPM/DOH standard
      halfValueLayerMmAl: 2.9, // HVL >= 2.5 mm Al
      radiationLeakageMrhAt1m: 24.5, // Leakage < 100 mR/h
      leadApronIntegrityCheck: 'PASS - Zero pinholes or tears detected on 0.5mm Pb eq.'
    }
  });
  db.saveEquipmentLog(xraySurvey);
  assert(xraySurvey.isPass, 'Expected radiation survey results to pass tolerances.');
  assert(xraySurvey.xrayPhysicsResults.exposureLinearityCol <= 0.10, 'Expected exposure linearity Col <= 0.10');
  assert(xraySurvey.xrayPhysicsResults.radiationLeakageMrhAt1m < 100, 'Expected leakage < 100 mR/h');
  console.log('✓ Step 5: X-Ray radiation survey logged and verified against DOH & AAPM safety thresholds.');

  // 6. Test QC Controls Registration
  const qcControl = new QcControl({
    equipmentId: chemEq.id,
    controlName: 'Bio-Rad Lyphochek Chemistry Control Level 1',
    manufacturer: 'Bio-Rad',
    lotNumber: 'LOT-2026-09A',
    level: 'Level 1 (Normal)',
    analytes: DEFAULT_CHEMISTRY_ANALYTES
  });
  db.saveQcControl(qcControl);
  const fetchedControl = db.getQcControlById(qcControl.id);
  assert(fetchedControl && fetchedControl.analytes.length >= 10, 'Expected default analytes library.');
  console.log(`✓ Step 6: Bio-Rad QC Control lot registered with ${fetchedControl.analytes.length} standard clinical chemistry analytes.`);

  // 7. Test Westgard Multi-Rule Evaluation Engine
  console.log('\n--- Testing Westgard Multi-Rule Evaluation Engine ---');
  const targetMean = 95.0; // FBS target mean
  const targetSd = 3.5;    // FBS target SD (1SD = 3.5)

  // 7.1 Normal In-Control Run (within 1SD)
  const normEval = evaluateWestgardRules({ measuredValue: 96.0, targetMean, targetSd }, []);
  assert.strictEqual(normEval.status, 'ACCEPTED');
  console.log(`  ✓ Westgard Normal Check: Measured 96.0 (Z = ${normEval.zScore}) -> ACCEPTED`);

  // 7.2 1_2s Warning Rule (> 2SD)
  const warn12s = evaluateWestgardRules({ measuredValue: 102.5, targetMean, targetSd }, []);
  assert.strictEqual(warn12s.status, 'WARNING');
  assert(warn12s.rulesViolated.includes('1_2s'));
  console.log(`  ✓ Westgard 1_2s Rule: Measured 102.5 (Z = ${warn12s.zScore}) -> WARNING (1_2s triggered)`);

  // 7.3 1_3s Rejection Rule (> 3SD, Random Error)
  const rej13s = evaluateWestgardRules({ measuredValue: 106.0, targetMean, targetSd }, []);
  assert.strictEqual(rej13s.status, 'REJECTED');
  assert(rej13s.rulesViolated.includes('1_3s'));
  console.log(`  ✓ Westgard 1_3s Rule: Measured 106.0 (Z = ${rej13s.zScore}) -> REJECTED (Random Error)`);

  // 7.4 2_2s Rejection Rule (2 consecutive runs > 2SD on same side)
  const history22s = [
    { measuredValue: 103.0, zScore: 2.29, status: 'WARNING', runDate: '2026-09-01T08:00:00.000Z' }
  ];
  const rej22s = evaluateWestgardRules({ measuredValue: 103.5, targetMean, targetSd }, history22s);
  assert.strictEqual(rej22s.status, 'REJECTED');
  assert(rej22s.rulesViolated.includes('2_2s'));
  console.log(`  ✓ Westgard 2_2s Rule: Two consecutive runs > +2SD -> REJECTED (Systematic Error)`);

  // 7.5 R_4s Rejection Rule (Difference between consecutive runs >= 4SD)
  const historyR4s = [
    { measuredValue: 102.5, zScore: 2.14, status: 'WARNING', runDate: '2026-09-01T08:00:00.000Z' }
  ];
  const rejR4s = evaluateWestgardRules({ measuredValue: 87.5, targetMean, targetSd }, historyR4s); // 87.5 is -2.14 SD -> range = 4.28 SD
  assert.strictEqual(rejR4s.status, 'REJECTED');
  assert(rejR4s.rulesViolated.includes('R_4s'));
  console.log(`  ✓ Westgard R_4s Rule: Difference between consecutive runs is 4.28 SD -> REJECTED (Random Error)`);

  // 7.6 4_1s Rejection Rule (4 consecutive runs > 1SD on same side)
  const history41s = [
    { measuredValue: 99.0, zScore: 1.14, status: 'ACCEPTED', runDate: '2026-09-01T08:00:00.000Z' },
    { measuredValue: 99.5, zScore: 1.29, status: 'ACCEPTED', runDate: '2026-09-02T08:00:00.000Z' },
    { measuredValue: 99.2, zScore: 1.20, status: 'ACCEPTED', runDate: '2026-09-03T08:00:00.000Z' }
  ];
  const rej41s = evaluateWestgardRules({ measuredValue: 99.8, targetMean, targetSd }, history41s);
  assert.strictEqual(rej41s.status, 'REJECTED');
  assert(rej41s.rulesViolated.includes('4_1s'));
  console.log(`  ✓ Westgard 4_1s Rule: 4 consecutive runs > +1SD -> REJECTED (Systematic Shift)`);

  // 7.7 10_x Rejection Rule (10 consecutive runs on same side of mean)
  const history10x = [];
  for (let i = 1; i <= 9; i++) {
    history10x.push({ measuredValue: 96.0, zScore: 0.29, status: 'ACCEPTED', runDate: `2026-09-0${i}T08:00:00.000Z` });
  }
  const rej10x = evaluateWestgardRules({ measuredValue: 96.5, targetMean, targetSd }, history10x);
  assert.strictEqual(rej10x.status, 'REJECTED');
  assert(rej10x.rulesViolated.includes('10_x'));
  console.log(`  ✓ Westgard 10_x Rule: 10 consecutive runs above mean -> REJECTED (Reagent/Calibration Drift)`);

  // 8. Test Levey-Jennings Dataset Generation & Statistics
  console.log('\n--- Testing Levey-Jennings Dataset & Statistical Aggregates ---');
  const qcEntries = [
    new QcEntry({ equipmentId: chemEq.id, controlId: qcControl.id, analyteCode: 'fbs', measuredValue: 94.8, runDate: '2026-09-01T08:00:00.000Z' }),
    new QcEntry({ equipmentId: chemEq.id, controlId: qcControl.id, analyteCode: 'fbs', measuredValue: 95.2, runDate: '2026-09-02T08:00:00.000Z' }),
    new QcEntry({ equipmentId: chemEq.id, controlId: qcControl.id, analyteCode: 'fbs', measuredValue: 96.1, runDate: '2026-09-03T08:00:00.000Z' }),
    new QcEntry({ equipmentId: chemEq.id, controlId: qcControl.id, analyteCode: 'fbs', measuredValue: 94.5, runDate: '2026-09-04T08:00:00.000Z' }),
    new QcEntry({ equipmentId: chemEq.id, controlId: qcControl.id, analyteCode: 'fbs', measuredValue: 95.7, runDate: '2026-09-05T08:00:00.000Z' }),
    new QcEntry({ equipmentId: chemEq.id, controlId: qcControl.id, analyteCode: 'fbs', measuredValue: 95.0, runDate: '2026-09-06T08:00:00.000Z' }),
    new QcEntry({ equipmentId: chemEq.id, controlId: qcControl.id, analyteCode: 'fbs', measuredValue: 96.4, runDate: '2026-09-07T08:00:00.000Z' }),
    new QcEntry({ equipmentId: chemEq.id, controlId: qcControl.id, analyteCode: 'fbs', measuredValue: 94.2, runDate: '2026-09-08T08:00:00.000Z' }),
    new QcEntry({ equipmentId: chemEq.id, controlId: qcControl.id, analyteCode: 'fbs', measuredValue: 95.3, runDate: '2026-09-09T08:00:00.000Z' }),
    new QcEntry({ equipmentId: chemEq.id, controlId: qcControl.id, analyteCode: 'fbs', measuredValue: 94.5, runDate: '2026-09-10T08:00:00.000Z' })
  ];
  qcEntries.forEach(e => db.saveQcEntry(e));

  const ljDataset = buildLeveyJenningsDataset(qcControl, 'fbs', qcEntries, { equipment: chemEq });
  assert.strictEqual(ljDataset.points.length, 10);
  assert.strictEqual(ljDataset.targetMean, 95.0);
  assert.strictEqual(ljDataset.referenceLines.plus3Sd, 105.5);
  assert.strictEqual(ljDataset.referenceLines.minus3Sd, 84.5);
  console.log(`  ✓ LJ Reference Lines: Mean = ${ljDataset.targetMean}, ±1SD = [${ljDataset.referenceLines.minus1Sd}, ${ljDataset.referenceLines.plus1Sd}], ±2SD = [${ljDataset.referenceLines.minus2Sd}, ${ljDataset.referenceLines.plus2Sd}], ±3SD = [${ljDataset.referenceLines.minus3Sd}, ${ljDataset.referenceLines.plus3Sd}]`);

  const stats = ljDataset.statistics;
  assert.strictEqual(stats.n, 10);
  assert(stats.inControl, 'Expected observed statistical performance to be within Allowable Total Error (TEa).');
  console.log(`  ✓ LJ Observed Stats: N = ${stats.n}, Mean = ${stats.observedMean}, SD = ${stats.observedSd}, %CV = ${stats.cvPercent}%, TEobs = ${stats.totalErrorObserved}% (TEa = ${stats.teaPercent}%) -> Status: ${stats.inControl ? 'IN CONTROL' : 'OUT OF CONTROL'}`);

  // 9. Test DOH Monthly Quality Control Report Generator
  const dohReport = generateDohMonthlyReport(chemEq, '2026-09', [qcControl], qcEntries);
  assert.strictEqual(dohReport.reportPeriod.year, 2026);
  assert.strictEqual(dohReport.facility.licenseNumber, '03-435-15CL-20');
  assert.strictEqual(dohReport.summary.overallCompliance, 'COMPLIANT');
  console.log('✓ Step 9: DOH Monthly Quality Control Report generated successfully with COMPLIANT rating.');

  // 10. Test NEQAS External Quality Assessment (EQA) Module
  console.log('\n--- Testing NEQAS Proficiency Testing (EQA) Engine ---');
  const neqasGood = new NeqasRecord({
    equipmentId: chemEq.id,
    cycleYear: '2026',
    eventNumber: 'Survey 1',
    nrlName: 'Lung Center of the Philippines (LCP - Clinical Chemistry)',
    sampleId: 'LCP-CC-2026-01A',
    analyteCode: 'fbs',
    analyteName: 'Glucose / Fasting Blood Sugar',
    unit: 'mg/dL',
    reportedValue: 104.0,
    peerMean: 100.0,
    peerSd: 4.0,
    peerCount: 245
  });
  db.saveNeqasRecord(neqasGood);
  assert.strictEqual(neqasGood.nrlEvaluation.sdi, 1.0);
  assert.strictEqual(neqasGood.nrlEvaluation.evaluationGrade, 'ACCEPTABLE');
  console.log(`  ✓ NEQAS Sample LCP-CC-2026-01A: Reported = 104.0, Peer Mean = 100.0, Peer SD = 4.0 -> SDI = +1.00 (Grade: ACCEPTABLE)`);

  const neqasBad = new NeqasRecord({
    equipmentId: chemEq.id,
    cycleYear: '2026',
    eventNumber: 'Survey 1',
    nrlName: 'Lung Center of the Philippines (LCP - Clinical Chemistry)',
    sampleId: 'LCP-CC-2026-01B',
    analyteCode: 'cholesterol',
    analyteName: 'Total Cholesterol',
    unit: 'mg/dL',
    reportedValue: 215.0,
    peerMean: 180.0,
    peerSd: 10.0,
    peerCount: 245
  });
  db.saveNeqasRecord(neqasBad);
  assert.strictEqual(neqasBad.nrlEvaluation.sdi, 3.5);
  assert.strictEqual(neqasBad.nrlEvaluation.evaluationGrade, 'UNSATISFACTORY');
  assert.strictEqual(neqasBad.correctiveAction.required, true);
  console.log(`  ✓ NEQAS Sample LCP-CC-2026-01B: Reported = 215.0, Peer Mean = 180.0, Peer SD = 10.0 -> SDI = +3.50 (Grade: UNSATISFACTORY, Corrective Action Required: YES)`);

  // Document corrective action
  neqasBad.correctiveAction.actionTaken = 'Re-calibrated photometer filter wheel and reconstituted fresh primary calibrator vial.';
  neqasBad.correctiveAction.actionTakenBy = 'Chief MedTech J. Domingo';
  neqasBad.correctiveAction.actionDate = new Date().toISOString();
  neqasBad.correctiveAction.closed = true;
  db.saveNeqasRecord(neqasBad);
  console.log('  ✓ NEQAS Out-of-Tolerance corrective action documented and closed for DOH compliance inspection.');

  // Clean up test DB
  try {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  } catch (_) {}

  console.log('\n====================================================');
  console.log('  ALL EQUIPMENT & QC BACKEND TESTS PASSED (10/10)   ');
  console.log('====================================================\n');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
