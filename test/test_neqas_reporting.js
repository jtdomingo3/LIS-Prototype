/**
 * test_neqas_reporting.js
 * 
 * Centralized test for:
 * 1. Dedicated 3-tab layout in views/equipment/index.ejs (Equipment, QC, NEQAS).
 * 2. Printable NEQAS Performance Certificate (views/equipment/print_neqas.ejs) with SDI spectrum gauge and DOH corrective action form.
 * 3. Multi-analyte monthly Clinical Chemistry QC Consolidated Report (views/equipment/print_monthly_qc.ejs) for DOH licensing inspection.
 */

const path = require('path');
const fs = require('fs');
const ejs = require(path.join(__dirname, '..', 'lis-fullstack', 'node_modules', 'ejs'));
const assert = require('assert');

console.log('================================================================');
console.log('🧪 RUNNING COMPREHENSIVE NEQAS & DOH CHEMISTRY REPORTING TESTS');
console.log('================================================================\n');

const VIEWS_DIR = path.join(__dirname, '..', 'lis-fullstack', 'views');

let passedTests = 0;
let totalTests = 0;

function runTest(testName, testFn) {
  totalTests++;
  try {
    testFn();
    console.log(`  ✅ [PASS] ${testName}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${testName}`);
    console.error(`     Error: ${err.message}`);
    if (err.stack) {
      console.error(err.stack.split('\n').slice(0, 4).join('\n'));
    }
  }
}

// ==========================================
// TEST SUITE 1: views/equipment/index.ejs Compilation & 3-Tab Architecture
// ==========================================
console.log('📋 Test Suite 1: Dedicated Section Architecture (views/equipment/index.ejs)');

const indexEjsPath = path.join(VIEWS_DIR, 'equipment', 'index.ejs');
const indexEjsContent = fs.readFileSync(indexEjsPath, 'utf8');

runTest('views/equipment/index.ejs compiles cleanly without syntax errors', () => {
  const mockData = {
    title: 'Laboratory Equipment Management',
    kpi: {
      total: 5,
      operational: 4,
      calibrationDueSoon: 1,
      calibrationOverdue: 0,
      pmDue: 1,
      outOfService: 0,
      xrayCount: 1,
      chemistryCount: 2
    },
    equipment: [
      {
        id: 'eq-chem-01',
        equipmentCode: 'EQ-CHEM-001',
        name: 'Mindray BS-240 Clinical Chemistry Analyzer',
        category: 'Clinical Chemistry Analyzer',
        department: 'Clinical Chemistry',
        manufacturer: 'Mindray',
        modelNumber: 'BS-240',
        serialNumber: 'SN-CHEM-9921',
        status: 'OPERATIONAL',
        isChemistry: true,
        isXRay: false,
        lastCalibrationDate: '2026-01-10',
        nextCalibrationDate: '2027-01-10',
        daysUntilCalibration: 124
      }
    ],
    users: [
      { id: 'u1', name: 'Gezyne M. Lopez, RMT', role: 'Medical Technologist', licenseNumber: '67820' },
      { id: 'u2', name: 'Jeff Louine Jamir T. Domingo, RMT, PMSDA', role: 'Medical Technologist', licenseNumber: '68285' },
      { id: 'u3', name: 'Bernadette R. Espiritu, M.D.', role: 'Pathologist', licenseNumber: '75547' }
    ],
    neqasRecords: [],
    query: {},
    sessionUser: { role: 'Admin', permissions: { equipment: true } }
  };

  const html = ejs.render(indexEjsContent, mockData, { filename: indexEjsPath });
  assert(html.length > 500, 'HTML output should be substantial');

  // Verify dedicated tabs exist
  assert(html.includes('id="tabBtn_equipment"'), 'Equipment tab button should exist');
  assert(html.includes('id="tabBtn_qc"'), 'QC tab button should exist');
  assert(html.includes('id="tabBtn_neqas"'), 'NEQAS tab button should exist');

  // Verify dedicated section panels exist
  assert(html.includes('id="sectionEquipment"'), 'sectionEquipment panel should exist');
  assert(html.includes('id="sectionQc"'), 'sectionQc panel should exist');
  assert(html.includes('id="sectionNeqas"'), 'sectionNeqas panel should exist');

  // Verify DOH regulatory standards badges exist
  assert(html.includes('CLSI C24-Ed4'), 'CLSI C24 standard should be referenced');
  assert(html.includes('DOH AO 2020-0035'), 'DOH AO 2020-0035 should be referenced');
  assert(html.includes('ISO 15189:2022'), 'ISO 15189 should be referenced');

  // Verify buttons for multi-analyte monthly QC and NEQAS exist
  assert(html.includes('printMonthlyQcReport()'), 'printMonthlyQcReport() function call should exist');
  assert(html.includes('Print Multi-Analyte Monthly QC (DOH Inspection)'), 'Multi-analyte monthly QC button should exist');
  assert(html.includes('openNeqasModal()'), 'openNeqasModal() should exist');
  assert(html.includes('neqasSectionTableBody'), 'Dedicated NEQAS table body should exist on the page');

  // Verify Back to Equipment buttons exist in both QC and NEQAS panels
  assert(html.includes('onclick="switchSection(\'equipment\')"'), 'Back to Equipment button action should exist');
  assert(html.includes('Back to Equipment'), 'Back to Equipment label should exist');
  assert(html.includes('Back to Equipment Registry'), 'Back to Equipment Registry footer label should exist');

  // Verify Total Equipment KPI is strictly encapsulated INSIDE sectionEquipment
  const sectionEquipmentIndex = html.indexOf('id="sectionEquipment"');
  const sectionQcIndex = html.indexOf('id="sectionQc"');
  const totalEquipmentIndex = html.indexOf('Total Equipment');
  assert(sectionEquipmentIndex !== -1, 'sectionEquipment must exist');
  assert(totalEquipmentIndex > sectionEquipmentIndex, 'Total Equipment KPI must be inside sectionEquipment');
  assert(totalEquipmentIndex < sectionQcIndex, 'Total Equipment KPI must not be placed outside or after sectionEquipment');
});

// ==========================================
// TEST SUITE 2: Printable NEQAS Performance Certificate (print_neqas.ejs)
// ==========================================
console.log('\n📜 Test Suite 2: Printable NEQAS Certificate (views/equipment/print_neqas.ejs)');

const printNeqasPath = path.join(VIEWS_DIR, 'equipment', 'print_neqas.ejs');
const printNeqasContent = fs.readFileSync(printNeqasPath, 'utf8');

runTest('print_neqas.ejs renders acceptable survey result (|SDI| <= 2.0)', () => {
  const mockRecord = {
    id: 'neqas-001',
    cycleYear: '2026',
    eventNumber: 'Event 1',
    nrlName: 'Lung Center of the Philippines (LCP - Clinical Chemistry)',
    sampleId: 'LCP-CC-2026-S1A',
    analyteCode: 'fbs',
    analyteName: 'Glucose / Fasting Blood Sugar',
    reportedValue: 104.2,
    unit: 'mg/dL',
    methodology: 'Hexokinase / G-6-PD Enzymatic UV',
    reagentBrand: 'Mindray Reagents',
    reagentLotNumber: 'LOT-GLU-992',
    dateReported: '2026-03-15',
    dateEvaluated: '2026-04-02',
    status: 'EVALUATED_ACCEPTABLE',
    isAcceptable: true,
    isQuestionable: false,
    isUnsatisfactory: false,
    nrlEvaluation: {
      peerMean: 102.5,
      peerSd: 3.8,
      peerGroupSize: 142,
      sdi: 0.45,
      evaluationGrade: 'ACCEPTABLE',
      targetMethodology: 'Enzymatic Hexokinase',
      evaluatedAt: '2026-04-02'
    },
    correctiveActionPlan: {
      actionTaken: '',
      rootCause: '',
      preventiveAction: '',
      status: 'RESOLVED_NONE_REQUIRED'
    }
  };

  const signatories = {
    operatorName: 'Gezyne M. Lopez, RMT',
    operatorLicense: '67820',
    validatorName: 'Jeff Louine Jamir T. Domingo, RMT, PMSDA',
    validatorLicense: '68285',
    pathologistName: 'Bernadette R. Espiritu, M.D.',
    pathologistLicense: '75547'
  };

  const html = ejs.render(printNeqasContent, {
    title: 'NEQAS Result Certificate - Glucose',
    record: mockRecord,
    signatories,
    allUsers: []
  }, { filename: printNeqasPath });

  assert(html.includes('GEZYNE CLINICAL LABORATORY'), 'Should display laboratory name');
  assert(html.includes('03-435-15CL-20'), 'Should display DOH License number');
  assert(html.includes('Lung Center of the Philippines'), 'Should display NRL name');
  assert(html.includes('LCP-CC-2026-S1A'), 'Should display Sample ID');
  assert(html.includes('104.2'), 'Should display reported value');
  assert(html.includes('+0.45') || html.includes('0.45'), 'Should display SDI');
  assert(html.includes('ACCEPTABLE'), 'Should show ACCEPTABLE status badge');
  assert(html.includes('Gezyne M. Lopez, RMT'), 'Should include Operator signatory');
  assert(html.includes('67820'), 'Should include Operator license');
  assert(html.includes('Jeff Louine Jamir T. Domingo, RMT, PMSDA'), 'Should include Validator signatory');
  assert(html.includes('68285'), 'Should include Validator license');
  assert(html.includes('Bernadette R. Espiritu, M.D.'), 'Should include Pathologist signatory');
  assert(html.includes('75547'), 'Should include Pathologist license');
  assert(html.includes('svg') || html.includes('SDI'), 'Should include visual SDI spectrum gauge');
});

runTest('print_neqas.ejs flags mandatory DOH corrective action form when |SDI| >= 3.0', () => {
  const mockRecord = {
    id: 'neqas-002',
    cycleYear: '2026',
    eventNumber: 'Event 1',
    nrlName: 'Lung Center of the Philippines (LCP - Clinical Chemistry)',
    sampleId: 'LCP-CC-2026-S1B',
    analyteCode: 'crea',
    analyteName: 'Creatinine',
    reportedValue: 1.45,
    unit: 'mg/dL',
    methodology: 'Jaffe Kinetic Alkaline Picrate',
    reagentBrand: 'Mindray Reagents',
    reagentLotNumber: 'LOT-CREA-110',
    dateReported: '2026-03-15',
    dateEvaluated: '2026-04-02',
    status: 'EVALUATED_UNSATISFACTORY',
    isAcceptable: false,
    isQuestionable: false,
    isUnsatisfactory: true,
    nrlEvaluation: {
      peerMean: 1.12,
      peerSd: 0.09,
      peerGroupSize: 138,
      sdi: 3.67,
      evaluationGrade: 'UNSATISFACTORY',
      targetMethodology: 'Jaffe Kinetic',
      evaluatedAt: '2026-04-02'
    },
    correctiveAction: {
      actionTaken: 'Photometer optical recalibration and fresh reagent reconstitution.',
      investigation: 'Reagent blank degradation due to improper temperature storage.',
      actionDate: '2026-04-03',
      closed: true
    }
  };

  const signatories = {
    operatorName: 'Gezyne M. Lopez, RMT',
    operatorLicense: '67820',
    validatorName: 'Jeff Louine Jamir T. Domingo, RMT, PMSDA',
    validatorLicense: '68285',
    pathologistName: 'Bernadette R. Espiritu, M.D.',
    pathologistLicense: '75547'
  };

  const html = ejs.render(printNeqasContent, {
    title: 'NEQAS Result Certificate - Creatinine',
    record: mockRecord,
    signatories,
    allUsers: []
  }, { filename: printNeqasPath });

  assert(html.includes('UNSATISFACTORY'), 'Should show action required badge');
  assert(html.includes('DOH Quality Assurance & Corrective Action Record'), 'Should contain DOH Corrective Action section');
  assert(html.includes('Photometer optical recalibration'), 'Should display action taken');
  assert(html.includes('Reagent blank degradation'), 'Should display root cause');
});

// ==========================================
// TEST SUITE 3: Multi-Analyte Monthly Chemistry QC Consolidated Report (print_monthly_qc.ejs)
// ==========================================
console.log('\n📊 Test Suite 3: Multi-Analyte Monthly QC DOH Inspection Table (print_monthly_qc.ejs)');

const printMonthlyQcPath = path.join(VIEWS_DIR, 'equipment', 'print_monthly_qc.ejs');
const printMonthlyQcContent = fs.readFileSync(printMonthlyQcPath, 'utf8');

runTest('print_monthly_qc.ejs renders multi-analyte clinical chemistry panel on a single sheet', () => {
  const mockEquipment = {
    id: 'eq-chem-01',
    equipmentCode: 'EQ-CHEM-001',
    name: 'Mindray BS-240 Clinical Chemistry Analyzer',
    category: 'Clinical Chemistry Analyzer',
    department: 'Clinical Chemistry',
    manufacturer: 'Mindray',
    modelNumber: 'BS-240',
    serialNumber: 'SN-CHEM-9921'
  };

  const mockControl = {
    controlName: 'Bio-Rad Lyphochek Assayed Chemistry Control Level 1',
    lotNumber: 'LOT-2026-01',
    level: 'Level 1 (Normal)',
    expirationDate: '2027-12-31'
  };

  // Consolidated multi-analyte chemistry summary (11 core analytes)
  const analytesSummary = [
    { analyteCode: 'fbs', analyteName: 'Glucose / Fasting Blood Sugar', unit: 'mg/dL', targetMean: 95.0, targetSd: 3.5, observedN: 28, observedMean: 95.4, observedSd: 3.2, cvPercent: '3.4', teObs: '4.2%', inControl: true, rejectedCount: 0, warningCount: 1 },
    { analyteCode: 'bun', analyteName: 'Blood Urea Nitrogen (BUN)', unit: 'mg/dL', targetMean: 15.0, targetSd: 1.2, observedN: 28, observedMean: 15.1, observedSd: 1.1, cvPercent: '7.3', teObs: '8.1%', inControl: true, rejectedCount: 0, warningCount: 0 },
    { analyteCode: 'crea', analyteName: 'Creatinine', unit: 'mg/dL', targetMean: 1.10, targetSd: 0.08, observedN: 28, observedMean: 1.11, observedSd: 0.07, cvPercent: '6.3', teObs: '7.2%', inControl: true, rejectedCount: 0, warningCount: 0 },
    { analyteCode: 'chol', analyteName: 'Total Cholesterol', unit: 'mg/dL', targetMean: 180.0, targetSd: 7.5, observedN: 28, observedMean: 179.2, observedSd: 6.9, cvPercent: '3.9', teObs: '4.5%', inControl: true, rejectedCount: 0, warningCount: 0 },
    { analyteCode: 'trig', analyteName: 'Triglycerides', unit: 'mg/dL', targetMean: 120.0, targetSd: 6.0, observedN: 28, observedMean: 121.0, observedSd: 5.8, cvPercent: '4.8', teObs: '5.9%', inControl: true, rejectedCount: 0, warningCount: 0 },
    { analyteCode: 'bua', analyteName: 'Uric Acid', unit: 'mg/dL', targetMean: 5.5, targetSd: 0.35, observedN: 28, observedMean: 5.52, observedSd: 0.33, cvPercent: '6.0', teObs: '6.8%', inControl: true, rejectedCount: 0, warningCount: 0 },
    { analyteCode: 'sgot', analyteName: 'AST / SGOT', unit: 'U/L', targetMean: 32.0, targetSd: 2.1, observedN: 28, observedMean: 31.8, observedSd: 1.9, cvPercent: '6.0', teObs: '6.7%', inControl: true, rejectedCount: 0, warningCount: 0 },
    { analyteCode: 'sgpt', analyteName: 'ALT / SGPT', unit: 'U/L', targetMean: 28.0, targetSd: 1.9, observedN: 28, observedMean: 28.3, observedSd: 1.8, cvPercent: '6.4', teObs: '7.1%', inControl: true, rejectedCount: 0, warningCount: 0 },
    { analyteCode: 'na', analyteName: 'Sodium (Na+)', unit: 'mmol/L', targetMean: 140.0, targetSd: 2.2, observedN: 28, observedMean: 140.4, observedSd: 2.0, cvPercent: '1.4', teObs: '2.1%', inControl: true, rejectedCount: 0, warningCount: 0 },
    { analyteCode: 'k', analyteName: 'Potassium (K+)', unit: 'mmol/L', targetMean: 4.2, targetSd: 0.18, observedN: 28, observedMean: 4.19, observedSd: 0.16, cvPercent: '3.8', teObs: '4.5%', inControl: true, rejectedCount: 0, warningCount: 0 },
    { analyteCode: 'cl', analyteName: 'Chloride (Cl-)', unit: 'mmol/L', targetMean: 102.0, targetSd: 1.8, observedN: 28, observedMean: 101.8, observedSd: 1.7, cvPercent: '1.7', teObs: '2.3%', inControl: true, rejectedCount: 0, warningCount: 0 }
  ];

  const signatories = {
    operatorName: 'Gezyne M. Lopez, RMT',
    operatorLicense: '67820',
    validatorName: 'Jeff Louine Jamir T. Domingo, RMT, PMSDA',
    validatorLicense: '68285',
    pathologistName: 'Bernadette R. Espiritu, M.D.',
    pathologistLicense: '75547'
  };

  const html = ejs.render(printMonthlyQcContent, {
    title: 'Monthly Chemistry QC Consolidated Report - BS-240 (March 2026)',
    equipment: mockEquipment,
    control: mockControl,
    monthLabel: 'March 2026',
    analytesSummary,
    signatories,
    allUsers: []
  }, { filename: printMonthlyQcPath });

  assert(html.includes('GEZYNE CLINICAL LABORATORY'), 'Header contains lab name');
  assert(html.includes('03-435-15CL-20'), 'Header contains DOH License number');
  assert(html.includes('Mindray BS-240'), 'Contains equipment name');
  assert(html.includes('March 2026'), 'Contains month label');
  assert(html.includes('Glucose / Fasting Blood Sugar'), 'Contains FBS analyte');
  assert(html.includes('Creatinine'), 'Contains Creatinine analyte');
  assert(html.includes('Blood Urea Nitrogen'), 'Contains BUN analyte');
  assert(html.includes('Total Cholesterol'), 'Contains Cholesterol analyte');
  assert(html.includes('Triglycerides'), 'Contains Triglycerides analyte');
  assert(html.includes('Uric Acid'), 'Contains Uric Acid analyte');
  assert(html.includes('AST / SGOT'), 'Contains AST analyte');
  assert(html.includes('ALT / SGPT'), 'Contains ALT analyte');
  assert(html.includes('Sodium (Na+)'), 'Contains Sodium analyte');
  assert(html.includes('Potassium (K+)'), 'Contains Potassium analyte');
  assert(html.includes('Chloride (Cl-)'), 'Contains Chloride analyte');
  assert(html.includes('IN CONTROL'), 'Displays In Control status badges');
  assert(html.includes('Gezyne M. Lopez, RMT'), 'Contains Operator signatory');
  assert(html.includes('Jeff Louine Jamir T. Domingo, RMT, PMSDA'), 'Contains Validator signatory');
  assert(html.includes('Bernadette R. Espiritu, M.D.'), 'Contains Pathologist signatory');
});

// ==========================================
// SUMMARY
// ==========================================
console.log('\n================================================================');
console.log(`🏁 TEST RESULTS: ${passedTests} / ${totalTests} TESTS PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
console.log('================================================================');

if (passedTests === totalTests) {
  console.log('✨ All NEQAS and DOH Multi-Analyte Reporting tests PASSED successfully!\n');
  process.exit(0);
} else {
  console.error(`💥 Some tests failed! (${totalTests - passedTests} failure(s))\n`);
  process.exit(1);
}
