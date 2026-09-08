/**
 * Unit Test for Levey-Jennings QC Printable Report Signatories
 * Located in centralized /test directory per repository standards.
 */
const path = require('path');
const fs = require('fs');
const assert = require('assert');
const ejs = require('../lis-fullstack/node_modules/ejs');

const { initDb } = require('../lis-fullstack/lib/sqliteDb');
const Equipment = require('../lis-fullstack/models/Equipment');
const { QcControl } = require('../lis-fullstack/models/QcControl');
const QcEntry = require('../lis-fullstack/models/QcEntry');
const { buildLeveyJenningsDataset } = require('../lis-fullstack/lib/leveyJenningsService');

const TEST_DB_PATH = path.join(__dirname, 'test-lj-signatories.db');
if (fs.existsSync(TEST_DB_PATH)) {
  try { fs.unlinkSync(TEST_DB_PATH); } catch (_) {}
}

async function runSignatoryTests() {
  console.log('===========================================================');
  console.log('  TESTING LEVEY-JENNINGS PRINTABLE REPORT SIGNATORIES      ');
  console.log('===========================================================\n');

  const db = await initDb(TEST_DB_PATH);
  global.db = db;

  const eq = new Equipment({
    equipmentCode: 'EQ-CHEM-TEST',
    name: 'Test Mindray Analyzer',
    category: 'Clinical Chemistry Analyzer',
    department: 'Clinical Chemistry'
  });
  db.saveEquipment(eq);

  const ctrl = new QcControl({
    equipmentId: eq.id,
    controlName: 'Bio-Rad Lyphochek Level 1',
    lotNumber: 'LOT-TEST-01'
  });
  db.saveQcControl(ctrl);

  const entry = new QcEntry({
    equipmentId: eq.id,
    controlId: ctrl.id,
    analyteCode: 'fbs',
    measuredValue: 95.0,
    runDate: '2026-09-01T08:00:00.000Z',
    operatorName: 'Gezyne M. Lopez, RMT'
  });
  db.saveQcEntry(entry);

  const dataset = buildLeveyJenningsDataset(ctrl, 'fbs', [entry], { equipment: eq });
  const templatePath = path.join(__dirname, '..', 'lis-fullstack', 'views', 'equipment', 'print_lj.ejs');
  const templateStr = fs.readFileSync(templatePath, 'utf8');

  // TEST CASE 1: Default 1 Pathologist (3 Columns)
  console.log('Test 1: Render with Default Signatories (1 Pathologist)...');
  const sigs1 = {
    operatorName: 'Gezyne M. Lopez, RMT',
    operatorTitle: 'Performed By (Medical Technologist)',
    operatorLicense: '67820',
    validatorName: 'Jeff Louine Jamir T. Domingo, RMT, PMSDA',
    validatorTitle: 'Reviewed & Verified By (QC Supervisor)',
    validatorLicense: '68285',
    pathologistName: 'Bernadette R. Espiritu, M.D.',
    pathologistTitle: 'Approved By (Head of Laboratory / Pathologist)',
    pathologistLicense: '75547',
    hasPathologist2: false,
    pathologist2Name: '',
    pathologist2Title: 'Approved By (Associate Pathologist)',
    pathologist2License: ''
  };

  const html1 = ejs.render(templateStr, {
    title: 'Levey-Jennings QC Report',
    equipment: eq,
    dataset,
    signatories: sigs1
  }, { filename: templatePath });

  assert(html1.includes('Bernadette R. Espiritu, M.D.'), 'HTML should include primary pathologist');
  assert(html1.includes('75547'), 'HTML should include primary pathologist license');
  assert(html1.includes('Gezyne M. Lopez, RMT'), 'HTML should include operator');
  assert(html1.includes('67820'), 'HTML should include operator license');
  assert(html1.includes('Jeff Louine Jamir T. Domingo, RMT, PMSDA'), 'HTML should include validator');
  assert(html1.includes('68285'), 'HTML should include validator license');
  assert(html1.includes('grid-template-columns: repeat(3, 1fr)'), 'HTML should render 3 columns for 1 pathologist');
  assert(html1.includes('display: none'), 'Pathologist 2 column should be hidden by default');
  console.log('✓ Test 1 Passed: 1 Pathologist rendered with 3-column layout.');

  // TEST CASE 2: 2 Pathologists (4 Columns)
  console.log('\nTest 2: Render with 2 Pathologists (4 Columns)...');
  const sigs2 = {
    operatorName: 'Gezyne M. Lopez, RMT',
    operatorTitle: 'Performed By (Medical Technologist)',
    operatorLicense: '67820',
    validatorName: 'Jeff Louine Jamir T. Domingo, RMT, PMSDA',
    validatorTitle: 'Reviewed & Verified By (QC Supervisor)',
    validatorLicense: '68285',
    pathologistName: 'Bernadette R. Espiritu, M.D.',
    pathologistTitle: 'Approved By (Head of Laboratory / Pathologist)',
    pathologistLicense: '75547',
    hasPathologist2: true,
    pathologist2Name: 'Alberto J. Gabriel, MD, FPCR',
    pathologist2Title: 'Approved By (Associate Pathologist)',
    pathologist2License: '99887'
  };

  const html2 = ejs.render(templateStr, {
    title: 'Levey-Jennings QC Report',
    equipment: eq,
    dataset,
    signatories: sigs2
  }, { filename: templatePath });

  assert(html2.includes('Bernadette R. Espiritu, M.D.'), 'HTML should include primary pathologist');
  assert(html2.includes('Alberto J. Gabriel, MD, FPCR'), 'HTML should include 2nd pathologist');
  assert(html2.includes('99887'), 'HTML should include 2nd pathologist license');
  assert(html2.includes('Approved By (Associate Pathologist)'), 'HTML should include 2nd pathologist designation');
  assert(html2.includes('grid-template-columns: repeat(4, 1fr)'), 'HTML should render 4 columns when 2 pathologists are enabled');
  console.log('✓ Test 2 Passed: 2 Pathologists rendered with 4-column balanced layout.');

  // TEST CASE 3: Dropdown-Driven Selection with Live Database Users for Clinical Equipment
  console.log('\nTest 3: Dropdown-Driven Selection for Clinical Equipment...');
  const sampleUsers = [
    { id: 'u1', name: 'Bernadette R. Espiritu, M.D.', role: 'Pathologist', licenseNumber: '75547' },
    { id: 'u2', name: 'Alberto J. Gabriel, MD, FPCR', role: 'Radiologist', licenseNumber: null },
    { id: 'u3', name: 'John Kevin R. Estanislao, RXT', role: 'X-Ray Technologist', licenseNumber: null },
    { id: 'u4', name: 'Gezyne Clinical Lab', role: 'Admin', licenseNumber: null },
    { id: 'u5', name: 'Admin User', role: 'Admin', licenseNumber: null },
    { id: 'u6', name: 'Gezyne M. Lopez, RMT', role: 'Medical Technologist', licenseNumber: '67820' },
    { id: 'u7', name: 'Jeff Louine Jamir T. Domingo, RMT, PMSDA', role: 'Medical Technologist', licenseNumber: '68285' },
    { id: 'u8', name: 'Maryjean V. Sab-it,RMT', role: 'Medical Technologist', licenseNumber: '0113528' },
    { id: 'u9', name: 'Joan Andrea P. Secillano, RMT', role: 'Medical Technologist', licenseNumber: '60306' },
    { id: 'u10', name: 'Marriela Diana B. Oida, RMT', role: 'Medical Technologist', licenseNumber: '62213' },
    { id: 'u11', name: 'Andrew Punongbayan, RMT, MD', role: 'Medical Technologist', licenseNumber: '56578' }
  ];

  const htmlClinical = ejs.render(templateStr, {
    title: 'Levey-Jennings QC Report',
    equipment: eq,
    dataset,
    signatories: sigs1,
    allUsers: sampleUsers
  }, { filename: templatePath });

  // Verify dropdown elements exist and NO text inputs exist in drawer
  assert(htmlClinical.includes('id="edit_op_select"'), 'Should render <select id="edit_op_select"> dropdown');
  assert(htmlClinical.includes('id="edit_val_select"'), 'Should render <select id="edit_val_select"> dropdown');
  assert(htmlClinical.includes('id="edit_p1_select"'), 'Should render <select id="edit_p1_select"> dropdown');
  assert(htmlClinical.includes('id="edit_p2_select"'), 'Should render <select id="edit_p2_select"> dropdown');
  assert(!htmlClinical.includes('id="edit_op_name"'), 'Should NOT contain text input for operator name');
  assert(!htmlClinical.includes('id="edit_op_license"'), 'Should NOT contain text input for operator license');

  // Verify MedTechs ARE included in operator dropdown options
  assert(htmlClinical.includes('Gezyne M. Lopez, RMT (PRC: 67820)'), 'Should contain MedTech Gezyne M. Lopez with PRC license');
  assert(htmlClinical.includes('Maryjean V. Sab-it,RMT (PRC: 0113528)'), 'Should contain MedTech Maryjean V. Sab-it');
  assert(htmlClinical.includes('Andrew Punongbayan, RMT, MD (PRC: 56578)'), 'Should contain MedTech Andrew Punongbayan');

  // Verify Admin / Facility are strictly EXCLUDED from operator dropdown options
  const opSelectContent = htmlClinical.substring(htmlClinical.indexOf('id="edit_op_select"'), htmlClinical.indexOf('</select>'));
  assert(!opSelectContent.includes('Gezyne Clinical Lab'), 'Operator dropdown MUST NOT include facility / admin Gezyne Clinical Lab');
  assert(!opSelectContent.includes('Admin User'), 'Operator dropdown MUST NOT include Admin User');
  assert(!opSelectContent.includes('John Kevin R. Estanislao, RXT'), 'Clinical operator dropdown MUST NOT include X-Ray Technologist');
  console.log('✓ Test 3 Passed: Clinical equipment renders 100% dropdown-driven signatories strictly filtered to MedTechs.');

  // TEST CASE 4: Dropdown-Driven Selection for Radiology Equipment
  console.log('\nTest 4: Dropdown-Driven Selection for Radiology Equipment...');
  const eqXray = new Equipment({
    equipmentCode: 'EQ-XRAY-TEST',
    name: 'Shimadzu RADspeed Pro High-Frequency Diagnostic X-Ray System',
    category: 'Diagnostic X-Ray Unit (Stationary)',
    department: 'Radiology / Imaging'
  });

  const htmlXray = ejs.render(templateStr, {
    title: 'Levey-Jennings QC Report',
    equipment: eqXray,
    dataset,
    signatories: {
      operatorName: 'John Kevin R. Estanislao, RXT',
      operatorTitle: 'Performed By (X-Ray Technologist)',
      operatorLicense: '',
      validatorName: 'Chief Radiologic Technologist',
      validatorTitle: 'Reviewed & Verified By (Radiology Supervisor)',
      validatorLicense: '',
      pathologistName: 'Alberto J. Gabriel, MD, FPCR',
      pathologistTitle: 'Approved By (Radiologist)',
      pathologistLicense: '',
      hasPathologist2: false,
      pathologist2Name: '',
      pathologist2Title: 'Approved By (Associate Radiologist)',
      pathologist2License: ''
    },
    allUsers: sampleUsers
  }, { filename: templatePath });

  const xrayOpSelectContent = htmlXray.substring(htmlXray.indexOf('id="edit_op_select"'), htmlXray.indexOf('</select>'));
  assert(xrayOpSelectContent.includes('John Kevin R. Estanislao, RXT'), 'Radiology operator dropdown must include X-Ray Tech');
  assert(!xrayOpSelectContent.includes('Gezyne Clinical Lab'), 'Radiology operator dropdown must NOT include admin');
  assert(htmlXray.includes('Approved By (Radiologist)'), 'Radiology report must display Approved By (Radiologist)');
  console.log('✓ Test 4 Passed: Radiology equipment correctly sets X-Ray Tech & Radiologist options.');

  // Clean up
  try {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  } catch (_) {}

  console.log('\n===========================================================');
  console.log('  ALL SIGNATORY RENDERING TESTS PASSED (4/4)               ');
  console.log('===========================================================\n');
}

runSignatoryTests().catch(err => {
  console.error('Signatory test failed:', err);
  process.exit(1);
});
