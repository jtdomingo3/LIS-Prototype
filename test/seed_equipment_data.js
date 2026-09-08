/**
 * Seed Script: Laboratory Equipment, Calibrations, Levey-Jennings QC & NEQAS
 * Centralized in /test directory per repository standards.
 * Populates realistic clinical laboratory & radiology data into the active SQLite database.
 */
const path = require('path');
const { getDataDir, dataFile } = require('../lis-fullstack/lib/dataPath');
const { createDb } = require('../lis-fullstack/lib/sqliteDb');
const Equipment = require('../lis-fullstack/models/Equipment');
const EquipmentLog = require('../lis-fullstack/models/EquipmentLog');
const { QcControl, DEFAULT_CHEMISTRY_ANALYTES } = require('../lis-fullstack/models/QcControl');
const QcEntry = require('../lis-fullstack/models/QcEntry');
const NeqasRecord = require('../lis-fullstack/models/NeqasRecord');
const { evaluateWestgardRules } = require('../lis-fullstack/lib/leveyJenningsService');

async function seed() {
  const dbFile = dataFile('lis-data.db');
  console.log(`[Seed] Connecting to active database: ${dbFile}`);

  const db = createDb(dbFile);
  global.db = db;

  console.log('[Seed] Populating realistic equipment registry...');

  const now = new Date();
  const daysAgo = (d) => new Date(now.getTime() - (d * 24 * 60 * 60 * 1000)).toISOString();
  const daysFromNow = (d) => new Date(now.getTime() + (d * 24 * 60 * 60 * 1000)).toISOString();

  const equipmentList = [
    new Equipment({
      equipmentCode: 'EQ-CHEM-001',
      name: 'Mindray BS-240 Clinical Chemistry Analyzer',
      category: 'Clinical Chemistry Analyzer',
      department: 'Clinical Chemistry',
      manufacturer: 'Mindray Bio-Medical',
      modelNumber: 'BS-240',
      serialNumber: 'SN-BS240-884210',
      location: 'Main Chemistry Bench 1',
      calibrationCycleDays: 365,
      lastCalibrationDate: daysAgo(180),
      pmCycleDays: 180,
      lastPmDate: daysAgo(60),
      notes: 'Fully automated clinical chemistry analyzer with 24-hour refrigerated reagent carousel. Dedicated for routine lipid, renal, liver, and cardiac panels.'
    }),
    new Equipment({
      equipmentCode: 'EQ-HEMA-001',
      name: 'Sysmex XN-550 Automated Hematology Analyzer',
      category: 'Hematology Analyzer',
      department: 'Hematology',
      manufacturer: 'Sysmex Corporation',
      modelNumber: 'XN-550',
      serialNumber: 'SN-XN550-41029',
      location: 'Hematology Station Bench 2',
      calibrationCycleDays: 365,
      lastCalibrationDate: daysAgo(350), // Calibration due soon in 15 days!
      pmCycleDays: 180,
      lastPmDate: daysAgo(120),
      notes: '5-part differential automated hematology analyzer with fluorescent flow cytometry technology. Annual recalibration due soon.'
    }),
    new Equipment({
      equipmentCode: 'EQ-XRAY-001',
      name: 'Shimadzu RADspeed Pro High-Frequency Diagnostic X-Ray System',
      category: 'Diagnostic X-Ray Unit (Stationary)',
      department: 'Radiology / X-Ray',
      manufacturer: 'Shimadzu Medical Systems',
      modelNumber: 'RADspeed Pro',
      serialNumber: 'SN-XR-992014',
      location: 'X-Ray Room 1 (Lead-Lined 2.0mm Pb eq.)',
      calibrationCycleDays: 365,
      lastCalibrationDate: daysAgo(90),
      pmCycleDays: 180,
      lastPmDate: daysAgo(90),
      radiationSafetyDetails: {
        isRadiationEmitter: true,
        fdaCdrrhrRegNumber: 'FDA-CDRRHR-XR-2025-0814',
        radiationSafetyOfficer: 'Engr. Roberto M. Dela Cruz, RSO (Cert # RSO-2024-0331)',
        tubeModel: 'Shimadzu Circlex 0.6/1.2 P324DK',
        tubeSerialNumber: 'TB-SHIM-77312',
        maxKvp: 150,
        maxMa: 630,
        totalFiltrationHvl: '3.1 mm Al eq. @ 80 kVp',
        lastRadiationSurveyDate: daysAgo(90),
        nextRadiationSurveyDate: daysFromNow(275),
        leadApronCheckDate: daysAgo(90)
      },
      notes: 'Ceiling-suspended tube with elevating table and wall Bucky. Licensed under FDA CDRRHR Permit to Operate.'
    }),
    new Equipment({
      equipmentCode: 'EQ-XRAY-002',
      name: 'Shimadzu MobileDaRt Evolution MX7 Portable X-Ray',
      category: 'Diagnostic X-Ray Unit (Mobile/Portable)',
      department: 'Radiology / X-Ray',
      manufacturer: 'Shimadzu',
      modelNumber: 'MobileDaRt MX7',
      serialNumber: 'SN-MX7-33102',
      location: 'Radiology Mobile Bay / ER Access',
      calibrationCycleDays: 365,
      lastCalibrationDate: daysAgo(390), // OVERDUE by 25 days!
      pmCycleDays: 180,
      lastPmDate: daysAgo(210),
      radiationSafetyDetails: {
        isRadiationEmitter: true,
        fdaCdrrhrRegNumber: 'FDA-CDRRHR-XR-2024-0199',
        radiationSafetyOfficer: 'Engr. Roberto M. Dela Cruz, RSO',
        tubeModel: 'Varian Rad-14',
        tubeSerialNumber: 'TB-VAR-4402',
        maxKvp: 133,
        maxMa: 400,
        totalFiltrationHvl: '2.8 mm Al eq.',
        lastRadiationSurveyDate: daysAgo(390),
        nextRadiationSurveyDate: daysAgo(25)
      },
      notes: 'Motorized mobile DR unit for bedside and ICU chest radiographs. Annual radiation survey recalibration is OVERDUE.'
    }),
    new Equipment({
      equipmentCode: 'EQ-COAG-001',
      name: 'Diagnostica Stago STA Compact Max Coagulation Analyzer',
      category: 'Coagulation Analyzer',
      department: 'Hematology',
      manufacturer: 'Diagnostica Stago',
      modelNumber: 'STA Compact Max',
      serialNumber: 'SN-STA-10822',
      location: 'Hemostasis Bench 3',
      calibrationCycleDays: 365,
      lastCalibrationDate: daysAgo(110),
      pmCycleDays: 180,
      lastPmDate: daysAgo(110),
      notes: 'Mechanical viscosity-based detection system for PT/INR, APTT, Fibrinogen, and D-Dimer assays.'
    }),
    new Equipment({
      equipmentCode: 'EQ-ELEC-001',
      name: 'Medica EasyLyte Plus Na+/K+/Cl- Electrolyte Analyzer',
      category: 'Electrolyte Analyzer',
      department: 'Clinical Chemistry',
      manufacturer: 'Medica Corporation',
      modelNumber: 'EasyLyte Plus',
      serialNumber: 'SN-EL-5421',
      location: 'STAT Electrolyte Corner',
      calibrationCycleDays: 365,
      lastCalibrationDate: daysAgo(150),
      pmCycleDays: 90,
      lastPmDate: daysAgo(105), // PM Overdue!
      notes: 'Ion-selective electrode (ISE) direct electrolyte measurement. Fluidic tubing maintenance due.'
    }),
    new Equipment({
      equipmentCode: 'EQ-BSC-001',
      name: 'Esco Airstream Class II Type A2 Biosafety Cabinet',
      category: 'Biosafety Cabinet / Laminar Flow',
      department: 'Microbiology',
      manufacturer: 'Esco Lifesciences',
      modelNumber: 'AC2-4S8',
      serialNumber: 'SN-ESCO-7721',
      location: 'Microbiology Clean Room B',
      calibrationCycleDays: 365,
      lastCalibrationDate: daysAgo(75),
      pmCycleDays: 180,
      lastPmDate: daysAgo(75),
      notes: 'HEPA filter velocity and containment verified compliant with NSF/ANSI 49 standards.'
    }),
    new Equipment({
      equipmentCode: 'EQ-URINE-001',
      name: 'Dirui H-500 Semi-Automated Urine Chemistry Analyzer',
      category: 'Automated Urine Chemistry Analyzer', // Custom Category!
      department: 'Clinical Microscopy',
      manufacturer: 'Dirui Industrial Co.',
      modelNumber: 'H-500',
      serialNumber: 'SN-DIRUI-2024-91',
      location: 'Urinalysis & Microscopy Bench',
      calibrationCycleDays: 365,
      lastCalibrationDate: daysAgo(45),
      pmCycleDays: 180,
      lastPmDate: daysAgo(45),
      notes: 'Reflectance photometer reading 10, 11, or 14-parameter urine test strips with integrated thermal printer.'
    })
  ];

  const savedEquipmentMap = {};
  for (const item of equipmentList) {
    const existing = db.getEquipmentByCode(item.equipmentCode);
    if (existing && existing.id) {
      item.id = existing.id;
    }
    const saved = db.saveEquipment(item);
    savedEquipmentMap[saved.equipmentCode] = saved;
    console.log(`  ✓ Registered [${saved.equipmentCode}] ${saved.name} (${saved.category}) -> Status: ${saved.status}`);
  }

  // 2. Service & Calibration Logs
  console.log('\n[Seed] Adding ISO 15189 and DOH Calibration & Radiation Survey Logs...');
  const chem = savedEquipmentMap['EQ-CHEM-001'];
  const xray1 = savedEquipmentMap['EQ-XRAY-001'];

  const logs = [
    new EquipmentLog({
      equipmentId: chem.id,
      equipmentName: chem.name,
      logType: 'CALIBRATION',
      serviceDate: daysAgo(180),
      serviceProviderType: 'EXTERNAL_ACCREDITED',
      serviceProviderName: 'Metrology Calibrations Philippines Inc. (PAB / ISO 17025 Acc. No. LA-2018-092)',
      technicianName: 'Engr. Armando V. Mendoza, Certified Metrologist',
      certificateNumber: 'MCPI-CAL-2026-0814',
      standardReferenceUsed: 'NIST Traceable Holmium Oxide Filter Set (SN-NIST-8841) & Class E2 Precision Weights',
      resultStatus: 'PASS',
      workPerformed: 'Full multi-wavelength photometer calibration across 340nm-800nm. Precision fluidic delivery volumetric calibration verified within +/- 0.5% tolerance. Electrical ground leakage within IEC 61010 limits.',
      nextDueDate: daysFromNow(185)
    }),
    new EquipmentLog({
      equipmentId: chem.id,
      equipmentName: chem.name,
      logType: 'PREVENTIVE_MAINTENANCE',
      serviceDate: daysAgo(60),
      serviceProviderType: 'MANUFACTURER',
      serviceProviderName: 'Mindray Medical Phils Authorized Service Support',
      technicianName: 'Mark Angelo Cruz, Service Engineer',
      certificateNumber: 'PM-MINDRAY-2026-012',
      resultStatus: 'PASS',
      workPerformed: '6-Month Preventive Maintenance Protocol: Replaced peristaltic pump tubing, washed and sonicated mixer probes, inspected halogen excitation lamp output (8,200 lux), verified Peltier reaction carousel temperature (37.0 +/- 0.1 deg C).',
      nextDueDate: daysFromNow(120)
    }),
    new EquipmentLog({
      equipmentId: xray1.id,
      equipmentName: xray1.name,
      logType: 'RADIATION_SAFETY_SURVEY',
      serviceDate: daysAgo(90),
      serviceProviderType: 'INDEPENDENT_QP',
      serviceProviderName: 'Philippine Association of Medical Physicists (PAMP) Certified Survey Group',
      technicianName: 'Francis Leo Hernandez, MSc, DABR, Qualified Medical Physicist',
      certificateNumber: 'PAMP-CDRRHR-QA-2026-104',
      standardReferenceUsed: 'Radcal Accu-Gold+ Multi-Function Radiation Analyzer (SN-AG-99320) & Fluke 451P Pressurized Ion Chamber',
      resultStatus: 'PASS',
      workPerformed: 'Comprehensive diagnostic X-ray quality assurance survey conducted pursuant to Philippine DOH AO No. 2020-0035 and FDA CDRRHR regulations. Evaluated kVp accuracy, reproducibility, exposure linearity, HVL, collimation alignment, and stray radiation leakage.',
      xrayPhysicsResults: {
        kvpPercentError: 1.2,
        exposureLinearityCol: 0.042,
        halfValueLayerMmAl: 3.1,
        radiationLeakageMrhAt1m: 18.4,
        timerAccuracyPercentError: 1.1,
        collimatorAlignmentSidPercent: 1.2,
        leadApronIntegrityCheck: 'PASS - Zero cracks or tears observed under fluoroscopic sweep'
      },
      nextDueDate: daysFromNow(275)
    })
  ];

  for (const log of logs) {
    db.saveEquipmentLog(log);
    console.log(`  ✓ Logged ${log.logType} for ${log.equipmentName} (${log.certificateNumber})`);
  }

  // 3. Quality Control (QC) Controls & Lots
  console.log('\n[Seed] Registering Bio-Rad Quality Control Lots with Analyte Reference Ranges...');
  const existingControls = (db.getQcControls(chem.id) || []);
  const existingC1 = existingControls.find(c => c.lotNumber === 'LOT-BR-2026-N1');
  const existingC2 = existingControls.find(c => c.lotNumber === 'LOT-BR-2026-H2');

  const chemControl1 = new QcControl({
    id: existingC1 ? existingC1.id : undefined,
    equipmentId: chem.id,
    controlName: 'Bio-Rad Lyphochek Assayed Chemistry Control Level 1 (Normal)',
    manufacturer: 'Bio-Rad Laboratories, USA',
    lotNumber: 'LOT-BR-2026-N1',
    level: 'Level 1 (Normal)',
    expirationDate: '2027-12-31T23:59:59.000Z',
    analytes: [
      { analyteCode: 'fbs', analyteName: 'Glucose / Fasting Blood Sugar', unit: 'mg/dL', targetMean: 95.0, targetSd: 3.5, teaPercent: 10.0 },
      { analyteCode: 'chol', analyteName: 'Total Cholesterol', unit: 'mg/dL', targetMean: 150.0, targetSd: 6.0, teaPercent: 10.0 },
      { analyteCode: 'crea', analyteName: 'Creatinine', unit: 'mg/dL', targetMean: 1.10, targetSd: 0.05, teaPercent: 15.0 },
      { analyteCode: 'uric', analyteName: 'Uric Acid', unit: 'mg/dL', targetMean: 5.20, targetSd: 0.20, teaPercent: 12.0 },
      { analyteCode: 'alt', analyteName: 'SGPT / Alanine Aminotransferase', unit: 'U/L', targetMean: 35.0, targetSd: 2.0, teaPercent: 20.0 }
    ]
  });
  db.saveQcControl(chemControl1);
  console.log(`  ✓ Registered QC Control: ${chemControl1.controlName} (${chemControl1.lotNumber})`);

  const chemControl2 = new QcControl({
    id: existingC2 ? existingC2.id : undefined,
    equipmentId: chem.id,
    controlName: 'Bio-Rad Lyphochek Assayed Chemistry Control Level 2 (Pathological / High)',
    manufacturer: 'Bio-Rad Laboratories, USA',
    lotNumber: 'LOT-BR-2026-H2',
    level: 'Level 2 (High)',
    expirationDate: '2027-12-31T23:59:59.000Z',
    analytes: [
      { analyteCode: 'fbs', analyteName: 'Glucose / Fasting Blood Sugar', unit: 'mg/dL', targetMean: 240.0, targetSd: 8.0, teaPercent: 10.0 },
      { analyteCode: 'chol', analyteName: 'Total Cholesterol', unit: 'mg/dL', targetMean: 260.0, targetSd: 10.0, teaPercent: 10.0 },
      { analyteCode: 'crea', analyteName: 'Creatinine', unit: 'mg/dL', targetMean: 4.50, targetSd: 0.18, teaPercent: 15.0 }
    ]
  });
  db.saveQcControl(chemControl2);
  console.log(`  ✓ Registered QC Control: ${chemControl2.controlName} (${chemControl2.lotNumber})`);

  // 4. Daily QC Run Entries (Levey-Jennings Plot Data)
  console.log('\n[Seed] Generating 25 Daily Quality Control Runs for Fasting Blood Sugar (FBS)...');
  
  const simulatedFbs = [
    { day: 25, val: 94.6 },
    { day: 24, val: 95.8 },
    { day: 23, val: 93.9 },
    { day: 22, val: 96.2 },
    { day: 21, val: 95.1 },
    { day: 20, val: 94.8 },
    { day: 19, val: 95.5 },
    { day: 18, val: 96.4 },
    { day: 17, val: 94.2 },
    { day: 16, val: 95.0 },
    { day: 15, val: 95.7 },
    { day: 14, val: 94.5 },
    { day: 13, val: 96.1 },
    { day: 12, val: 95.2 },
    { day: 11, val: 102.3 }, // 1:2s Warning! (Z = +2.09)
    { day: 10, val: 95.4 },
    { day: 9, val: 94.9 },
    { day: 8, val: 96.0 },
    { day: 7, val: 106.2, action: 'Reagent lot was nearing reconstitution shelf-life. Discarded vial, reconstituted fresh control vial, recalibrated glucose reagent channel. Re-tested control: returned to 95.1 mg/dL.' }, // 1:3s Rejection!
    { day: 6, val: 95.1 },
    { day: 5, val: 94.7 },
    { day: 4, val: 95.6 },
    { day: 3, val: 96.3 },
    { day: 2, val: 94.8 },
    { day: 1, val: 95.2 }
  ];

  const analyteFbs = chemControl1.getAnalyte('fbs');
  const historyEntries = [];

  for (const item of simulatedFbs) {
    const runDate = daysAgo(item.day);
    
    const evaluation = evaluateWestgardRules(
      { measuredValue: item.val, targetMean: analyteFbs.targetMean, targetSd: analyteFbs.targetSd },
      historyEntries
    );

    const entry = new QcEntry({
      equipmentId: chem.id,
      controlId: chemControl1.id,
      controlLot: chemControl1.lotNumber,
      controlLevel: chemControl1.level,
      analyteCode: 'fbs',
      analyteName: analyteFbs.analyteName,
      unit: analyteFbs.unit,
      runDate,
      runNumber: 1,
      measuredValue: item.val,
      targetMean: analyteFbs.targetMean,
      targetSd: analyteFbs.targetSd,
      status: evaluation.status,
      rulesViolated: evaluation.rulesViolated,
      violationType: evaluation.violationType,
      reagentLotNumber: 'RGT-GLU-2026-04',
      operatorName: 'J. Domingo, RMT',
      notes: item.action || evaluation.explanation,
      correctiveAction: item.action ? {
        actionTaken: item.action,
        actionTakenBy: 'J. Domingo, RMT (Reviewed by Dr. A. Ramos, Pathologist)',
        actionDate: runDate,
        resolved: true
      } : null
    });

    const saved = db.saveQcEntry(entry);
    historyEntries.push(saved);
  }
  console.log(`  ✓ Successfully plotted ${historyEntries.length} Levey-Jennings daily control runs.`);

  // Also seed baseline runs for Total Cholesterol
  const analyteChol = chemControl1.getAnalyte('chol');
  const cholValues = [148.5, 151.2, 149.8, 152.4, 150.1, 148.9, 153.0, 150.5, 149.2, 151.8];
  cholValues.forEach((val, idx) => {
    const entry = new QcEntry({
      equipmentId: chem.id,
      controlId: chemControl1.id,
      controlLot: chemControl1.lotNumber,
      controlLevel: chemControl1.level,
      analyteCode: 'chol',
      analyteName: analyteChol.analyteName,
      unit: analyteChol.unit,
      runDate: daysAgo(10 - idx),
      runNumber: 1,
      measuredValue: val,
      targetMean: analyteChol.targetMean,
      targetSd: analyteChol.targetSd,
      status: 'ACCEPTED',
      reagentLotNumber: 'RGT-CHOL-2026-02',
      operatorName: 'M. Santos, RMT',
      notes: 'Routine morning daily calibration check. Within +/- 1SD.'
    });
    db.saveQcEntry(entry);
  });
  console.log('  ✓ Plotted 10 baseline runs for Total Cholesterol (CHOL).');

  // 5. NEQAS External Quality Assessment (EQA) Records
  console.log('\n[Seed] Adding Official DOH NEQAS Proficiency Survey Samples & Peer Statistics...');
  const hema = savedEquipmentMap['EQ-HEMA-001'];

  const neqasRecords = [
    new NeqasRecord({
      equipmentId: chem.id,
      equipmentName: chem.name,
      cycleYear: '2026',
      eventNumber: 'Survey 1',
      nrlName: 'Lung Center of the Philippines (LCP - Clinical Chemistry)',
      sampleId: 'LCP-CC-2026-S1A',
      analyteCode: 'fbs',
      analyteName: 'Glucose / Fasting Blood Sugar',
      unit: 'mg/dL',
      reportedValue: 102.0,
      reportedDate: daysAgo(40),
      reportedBy: 'J. Domingo, RMT',
      peerMean: 100.5,
      peerSd: 3.6,
      peerCount: 312,
      resultDate: daysAgo(15),
      notes: 'Proficiency survey for Philippine secondary & tertiary clinical laboratories.'
    }),
    new NeqasRecord({
      equipmentId: chem.id,
      equipmentName: chem.name,
      cycleYear: '2026',
      eventNumber: 'Survey 1',
      nrlName: 'Lung Center of the Philippines (LCP - Clinical Chemistry)',
      sampleId: 'LCP-CC-2026-S1B',
      analyteCode: 'chol',
      analyteName: 'Total Cholesterol',
      unit: 'mg/dL',
      reportedValue: 198.5,
      reportedDate: daysAgo(40),
      reportedBy: 'J. Domingo, RMT',
      peerMean: 194.2,
      peerSd: 5.8,
      peerCount: 312,
      resultDate: daysAgo(15),
      notes: 'Enzymatic photometric method peer comparison group.'
    }),
    new NeqasRecord({
      equipmentId: hema.id,
      equipmentName: hema.name,
      cycleYear: '2026',
      eventNumber: 'Survey 1',
      nrlName: 'National Kidney and Transplant Institute (NKTI - Hematology)',
      sampleId: 'NKTI-HEMA-2026-01',
      analyteCode: 'hgb',
      analyteName: 'Hemoglobin (Hgb)',
      unit: 'g/dL',
      reportedValue: 13.7,
      reportedDate: daysAgo(30),
      reportedBy: 'M. Santos, RMT',
      peerMean: 13.5,
      peerSd: 0.35,
      peerCount: 280,
      resultDate: daysAgo(10),
      notes: 'Sodium lauryl sulfate (SLS) hemoglobin method peer group.'
    }),
    new NeqasRecord({
      equipmentId: chem.id,
      equipmentName: chem.name,
      cycleYear: '2025',
      eventNumber: 'Survey 2',
      nrlName: 'Lung Center of the Philippines (LCP - Clinical Chemistry)',
      sampleId: 'LCP-CC-2025-S2-TRIG',
      analyteCode: 'trig',
      analyteName: 'Serum Triglycerides',
      unit: 'mg/dL',
      reportedValue: 215.0,
      reportedDate: daysAgo(120),
      reportedBy: 'J. Domingo, RMT',
      peerMean: 175.0,
      peerSd: 12.0,
      peerCount: 295,
      resultDate: daysAgo(85),
      notes: 'Out-of-control survey sample investigated and remediated.',
      correctiveAction: {
        required: true,
        actionTaken: 'Root cause analysis identified slight reagent lot degradation due to a temperature fluctuation in the auxiliary laboratory refrigerator. The reagent lot was condemned and replaced with a new cold-chain verified lot. Re-calibration performed and verified with fresh secondary standards.',
        actionTakenBy: 'Chief MedTech J. Domingo & Dr. A. Ramos, FPSP',
        actionDate: daysAgo(80),
        closed: true
      }
    })
  ];

  for (const n of neqasRecords) {
    db.saveNeqasRecord(n);
    console.log(`  ✓ Recorded NEQAS sample: ${n.sampleId} (${n.analyteName}) -> SDI: ${n.nrlEvaluation.sdi} [${n.status}]`);
  }

  console.log('\n========================================================');
  console.log('  SAMPLE DATA POPULATION COMPLETED SUCCESSFULLY!        ');
  console.log('========================================================\n');

  try { db.close(); } catch (_) {}
}

seed().catch(err => {
  console.error('[Seed] Error occurred:', err);
  process.exit(1);
});
