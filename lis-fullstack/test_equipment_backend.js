/**
 * Automated Verification Script for Equipment Management, Calibration Tracking,
 * Levey-Jennings Statistical QC, and NEQAS EQA Server Subsystem.
 */
const path = require('path');
const fs = require('fs');
const assert = require('assert');

// Test database file
const TEST_DB_PATH = path.join(__dirname, 'test-equipment.db');
if (fs.existsSync(TEST_DB_PATH)) {
  try { fs.unlinkSync(TEST_DB_PATH); } catch (_) {}
}

async function runTests() {
  console.log('====================================================');
  console.log('  STARTING EQUIPMENT & LEVEY-JENNINGS BACKEND TESTS  ');
  console.log('====================================================\n');

  // 1. Initialize SQLite Database
  const { initDb } = require('./lib/sqliteDb');
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
  const Equipment = require('./models/Equipment');
  const EquipmentLog = require('./models/EquipmentLog');
  const { QcControl, DEFAULT_CHEMISTRY_ANALYTES } = require('./models/QcControl');
  const QcEntry = require('./models/QcEntry');
  const NeqasRecord = require('./models/NeqasRecord');
  const {
    evaluateWestgardRules,
    calculateQcStatistics,
    buildLeveyJenningsDataset,
    generateDohMonthlyReport
  } = require('./lib/leveyJenningsService');

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
  assert(chemEq.isChemistry, 'Expected chemEq.isChemistry to be true.');
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
  assert(chemistryList.length >= 1, 'Failed to query equipment by department.');
  console.log('✓ Step 3.3: Successfully queried equipment by code and department.');

  // 4. Test Calibration Logging & Automatic Due Date Recalculation
  const calLog = new EquipmentLog({
    equipmentId: chemEq.id,
    logType: 'CALIBRATION',
    serviceDate: '2026-09-08T00:00:00.000Z',
    serviceProviderType: 'Accredited Metrology Body (ISO 17025)',
    serviceProviderName: 'Standard Precision Metrology Corp.',
    technicianName: 'Engr. Robert D. Cruz',
    certificateNumber: 'CAL-2026-CHEM-8819',
    standardReferenceUsed: 'NIST Traceable Multimeter SN: 9912, Calibrated Standard Filters',
    findings: 'Instrument optical alignment verified. Photometer calibrated across 12 wavelengths.',
    workPerformed: 'Replaced halogen lamp, aligned flow cell, performed 12-point calibration verification.',
    resultStatus: 'PASS',
    downtimeHours: 4.5
  });
  db.saveEquipmentLog(calLog);

  // Auto-schedule next calibration (365 days from 2026-09-08 -> 2027-09-08)
  chemEq.lastCalibrationDate = calLog.serviceDate;
  chemEq.nextCalibrationDate = chemEq.computeNextDate(calLog.serviceDate, chemEq.calibrationCycleDays);
  // Comprehensive annual service also includes PM
  chemEq.lastPmDate = calLog.serviceDate;
  chemEq.nextPmDate = chemEq.computeNextDate(calLog.serviceDate, chemEq.pmCycleDays);
  chemEq.evaluateStatus();
  db.saveEquipment(chemEq);

  assert.strictEqual(chemEq.status, 'OPERATIONAL');
  assert(chemEq.daysUntilCalibration > 300, `Expected >300 days until next calibration, got ${chemEq.daysUntilCalibration}`);
  console.log(`✓ Step 4: Calibration & PM log saved. Next calibration auto-calculated: ${chemEq.nextCalibrationDate} (Days remaining: ${chemEq.daysUntilCalibration}). Status: ${chemEq.status}`);

  // 5. Test Diagnostic X-Ray Physics Survey Logging (DOH AO 2020-0035 / AAPM Tolerances)
  const xrayLog = new EquipmentLog({
    equipmentId: xrayEq.id,
    logType: 'RADIATION_SAFETY_SURVEY',
    serviceDate: '2026-09-08T00:00:00.000Z',
    serviceProviderType: 'DOH / FDA Certified Physicist',
    serviceProviderName: 'Philippine Radiation Safety & Health Consultants',
    technicianName: 'Dr. M. Rivera, Medical Physicist',
    certificateNumber: 'RAD-PHYS-2026-0042',
    standardReferenceUsed: 'PTW Ionization Chamber SN: 7721, Radcal 1015 Dosimeter',
    xrayPhysicsResults: {
      kvpSet: 80,
      kvpMeasured: 79.2,
      timerSetMs: 100,
      timerMeasuredMs: 101.5,
      exposureLinearityCol: 0.04, // Must be <= 0.10 per AAPM/DOH
      halfValueLayerMmAl: 2.8,
      collimatorAlignmentPercentSid: 1.2, // Must be <= 2.0%
      radiationLeakageMrhAt1m: 14.5, // Must be < 100 mR/h per DOH limit
      leadApronsInspected: true,
      leadApronsCondition: 'Pass - All 6 lead aprons intact with no shielding cracks'
    },
    resultStatus: 'PASS',
    nextDueDate: '2027-09-08T00:00:00.000Z'
  });
  db.saveEquipmentLog(xrayLog);

  assert(xrayLog.xrayPhysicsResults.exposureLinearityCol <= 0.10, 'Exposure linearity exceeds allowable limit of 0.10');
  assert(xrayLog.xrayPhysicsResults.radiationLeakageMrhAt1m < 100, 'Radiation leakage exceeds DOH 100 mR/h threshold');
  console.log('✓ Step 5: X-Ray radiation survey logged and verified against DOH & AAPM safety thresholds.');

  // 6. Test QC Control Material Registration
  const qcControl = new QcControl({
    equipmentId: chemEq.id,
    controlName: 'Bio-Rad Lyphochek Assayed Chemistry Control Level 1 (Normal)',
    lotNumber: 'LOT-2026-09A',
    level: 'Level 1 (Normal)',
    expirationDate: '2027-06-30T00:00:00.000Z',
    analytes: DEFAULT_CHEMISTRY_ANALYTES
  });
  db.saveQcControl(qcControl);

  const gluDef = qcControl.getAnalyte('fbs');
  assert(gluDef && gluDef.targetMean === 95.0, 'Glucose target mean not configured properly.');
  console.log('✓ Step 6: Bio-Rad QC Control lot registered with 15 standard clinical chemistry analytes.');

  // 7. Test Levey-Jennings Engine & Westgard Multi-Rules
  console.log('\n--- Testing Westgard Multi-Rule Evaluation Engine ---');
  
  // Rule Check 1: Normal value within ±1SD -> ACCEPTED
  const res1 = evaluateWestgardRules({ measuredValue: 96.0, targetMean: 95.0, targetSd: 3.5 }, []);
  assert.strictEqual(res1.status, 'ACCEPTED');
  console.log('  ✓ Westgard Normal Check: Measured 96.0 (Z = +0.29) -> ACCEPTED');

  // Rule Check 2: 1_2s Warning rule (|Z| > 2.0)
  const res2 = evaluateWestgardRules({ measuredValue: 102.5, targetMean: 95.0, targetSd: 3.5 }, []);
  assert.strictEqual(res2.status, 'WARNING');
  assert(res2.rulesViolated.includes('1_2s'), 'Expected 1_2s rule violation.');
  console.log('  ✓ Westgard 1_2s Rule: Measured 102.5 (Z = +2.14) -> WARNING (1_2s triggered)');

  // Rule Check 3: 1_3s Rejection rule (|Z| > 3.0, Random Error)
  const res3 = evaluateWestgardRules({ measuredValue: 106.0, targetMean: 95.0, targetSd: 3.5 }, []);
  assert.strictEqual(res3.status, 'REJECTED');
  assert(res3.rulesViolated.includes('1_3s'), 'Expected 1_3s rule violation.');
  console.log('  ✓ Westgard 1_3s Rule: Measured 106.0 (Z = +3.14) -> REJECTED (Random Error)');

  // Rule Check 4: 2_2s Rejection rule (2 consecutive runs > +2SD, Systematic Error)
  const historyFor2_2s = [
    { measuredValue: 102.5, zScore: 2.14 } // Previous run > +2SD
  ];
  const res4 = evaluateWestgardRules({ measuredValue: 103.0, targetMean: 95.0, targetSd: 3.5 }, historyFor2_2s);
  assert.strictEqual(res4.status, 'REJECTED');
  assert(res4.rulesViolated.includes('2_2s'), 'Expected 2_2s rule violation.');
  console.log('  ✓ Westgard 2_2s Rule: Two consecutive runs > +2SD -> REJECTED (Systematic Error)');

  // Rule Check 5: R_4s Rejection rule (Range >= 4SD between consecutive runs)
  const historyForR4s = [
    { measuredValue: 87.5, zScore: -2.14 } // Previous run was < -2SD
  ];
  const res5 = evaluateWestgardRules({ measuredValue: 102.5, targetMean: 95.0, targetSd: 3.5 }, historyForR4s);
  assert.strictEqual(res5.status, 'REJECTED');
  assert(res5.rulesViolated.includes('R_4s'), 'Expected R_4s rule violation.');
  console.log('  ✓ Westgard R_4s Rule: Difference between consecutive runs is 4.28 SD -> REJECTED (Random Error)');

  // Rule Check 6: 4_1s Rejection rule (4 consecutive runs > +1SD)
  const historyFor4_1s = [
    { measuredValue: 99.0, zScore: 1.14 },
    { measuredValue: 99.5, zScore: 1.29 },
    { measuredValue: 100.0, zScore: 1.43 }
  ];
  const res6 = evaluateWestgardRules({ measuredValue: 99.2, targetMean: 95.0, targetSd: 3.5 }, historyFor4_1s);
  assert.strictEqual(res6.status, 'REJECTED');
  assert(res6.rulesViolated.includes('4_1s'), 'Expected 4_1s rule violation.');
  console.log('  ✓ Westgard 4_1s Rule: 4 consecutive runs > +1SD -> REJECTED (Systematic Shift)');

  // Rule Check 7: 10_x Rejection rule (10 consecutive runs on same side of mean)
  const historyFor10x = [];
  for (let i = 0; i < 9; i++) {
    historyFor10x.push({ measuredValue: 96.0, zScore: 0.29 });
  }
  const res7 = evaluateWestgardRules({ measuredValue: 97.0, targetMean: 95.0, targetSd: 3.5 }, historyFor10x);
  assert.strictEqual(res7.status, 'REJECTED');
  assert(res7.rulesViolated.includes('10_x'), 'Expected 10_x rule violation.');
  console.log('  ✓ Westgard 10_x Rule: 10 consecutive runs above mean -> REJECTED (Reagent/Calibration Drift)');

  // 8. Test Levey-Jennings Dataset Builder & Statistics
  console.log('\n--- Testing Levey-Jennings Dataset & Statistical Aggregates ---');
  const simulatedRuns = [];
  const baseDate = new Date('2026-09-01T08:00:00.000Z');
  const values = [94.5, 95.2, 96.1, 94.8, 95.5, 93.9, 95.8, 96.2, 95.0, 94.7];

  for (let i = 0; i < values.length; i++) {
    const runDate = new Date(baseDate.getTime() + (i * 24 * 60 * 60 * 1000)).toISOString();
    const entry = new QcEntry({
      equipmentId: chemEq.id,
      controlId: qcControl.id,
      controlLot: qcControl.lotNumber,
      analyteCode: 'fbs',
      analyteName: 'Glucose / Fasting Blood Sugar',
      unit: 'mg/dL',
      runDate,
      runNumber: 1,
      measuredValue: values[i],
      targetMean: 95.0,
      targetSd: 3.5
    });
    db.saveQcEntry(entry);
    simulatedRuns.push(entry);
  }

  const ljDataset = buildLeveyJenningsDataset(qcControl, 'fbs', simulatedRuns, { equipment: chemEq });
  assert.strictEqual(ljDataset.points.length, 10);
  assert.strictEqual(ljDataset.referenceLines.mean, 95.0);
  assert.strictEqual(ljDataset.referenceLines.plus3Sd, 105.5);
  assert.strictEqual(ljDataset.referenceLines.minus3Sd, 84.5);
  assert(ljDataset.statistics.observedMean > 94.0 && ljDataset.statistics.observedMean < 96.0);
  assert(ljDataset.statistics.cvPercent < 5.0, `Expected %CV < 5%, got ${ljDataset.statistics.cvPercent}%`);
  assert(ljDataset.statistics.inControl, 'Expected overall QC statistics to be in-control.');

  console.log(`  ✓ LJ Reference Lines: Mean = ${ljDataset.referenceLines.mean}, ±1SD = [${ljDataset.referenceLines.minus1Sd}, ${ljDataset.referenceLines.plus1Sd}], ±2SD = [${ljDataset.referenceLines.minus2Sd}, ${ljDataset.referenceLines.plus2Sd}], ±3SD = [${ljDataset.referenceLines.minus3Sd}, ${ljDataset.referenceLines.plus3Sd}]`);
  console.log(`  ✓ LJ Observed Stats: N = ${ljDataset.statistics.n}, Mean = ${ljDataset.statistics.observedMean}, SD = ${ljDataset.statistics.observedSd}, %CV = ${ljDataset.statistics.cvPercent}%, TEobs = ${ljDataset.statistics.totalErrorObserved}% (TEa = ${ljDataset.statistics.teaPercent}%) -> Status: IN CONTROL`);

  // 9. Test DOH Monthly IQC Report Generation
  const dohReport = generateDohMonthlyReport(chemEq, '2026-09', [qcControl], simulatedRuns);
  assert.strictEqual(dohReport.facility.licenseNumber, '03-435-15CL-20');
  assert.strictEqual(dohReport.summary.totalQcRuns, 10);
  assert.strictEqual(dohReport.summary.overallCompliance, 'COMPLIANT');
  console.log('✓ Step 9: DOH Monthly Quality Control Report generated successfully with COMPLIANT rating.');

  // 10. Test NEQAS EQA Workflow
  console.log('\n--- Testing NEQAS Proficiency Testing (EQA) Engine ---');
  const neqasGood = new NeqasRecord({
    equipmentId: chemEq.id,
    cycleYear: '2026',
    eventNumber: 'Survey 1',
    nrlName: 'Lung Center of the Philippines (LCP - Clinical Chemistry)',
    sampleId: 'LCP-CC-2026-01A',
    analyteCode: 'fbs',
    analyteName: 'Glucose',
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
