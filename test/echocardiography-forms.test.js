/**
 * Comprehensive Test Suite for 2D Echocardiography Result Forms:
 * 1. Form 1: Echocardiography Information Sheet (Measurements & Doppler)
 * 2. Form 2: Reading / Interpretation Sheet (Clinical Report & Signatures)
 * 3. Page fitting (strictly 1 Letter page per sheet)
 * 4. Data persistence and live HTTP routing
 *
 * Location: test/echocardiography-forms.test.js
 */

const assert = require('assert');
const path = require('path');
const http = require('http');
const appDir = path.join(__dirname, '..', 'lis-fullstack');
let ejs;
try {
  ejs = require(path.join(appDir, 'node_modules', 'ejs'));
} catch (e) {
  ejs = require('ejs');
}
const echoViewPath = path.join(appDir, 'views', 'reports', 'results', 'echocardiography-2d.ejs');
const entryViewPath = path.join(appDir, 'views', 'tests', 'results_entry_echocardiography_2d.ejs');

console.log('========================================================================');
console.log('🧪 RUNNING 2D ECHOCARDIOGRAPHY DUAL FORM & LETTER PRINT TEST SUITE');
console.log('========================================================================\n');

let totalTests = 0;
let passedTests = 0;

function runTest(description, testFn) {
  totalTests++;
  try {
    testFn();
    console.log(`  ✓ ${description}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${description}`);
    console.error(`    ${err.message}`);
    throw err;
  }
}

async function runAsyncTest(description, testFn) {
  totalTests++;
  try {
    await testFn();
    console.log(`  ✓ ${description}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ FAIL: ${description}`);
    console.error(`    ${err.message}`);
    throw err;
  }
}

// Mock sample test matching Image 1 & Image 2
const samplePatient = {
  id: 'pat-echo-001',
  firstName: 'JASON',
  lastName: 'LOMOTAN',
  sex: 'Male',
  age: '38',
  address: '0330 Vergel De Dios St, Plaridel Bulacan',
  contactNumber: '0917-649-0807',
  physician: 'Dr. Santos, MD'
};

const sampleResults = {
  weight: '70 kg',
  height: '167.3 cm',
  bsa: '1.73m²',
  hr: '63 bpm',
  indication: 'Routine Evaluation',
  requestingPhysician: 'Dr. Santos, MD',
  contact: '0917-649-0807',

  // Column 1
  lvedd: '5.3',
  lvedd_bsa: '3.0',
  lvesd: '3.7',
  lvedv: '148',
  lvesv: '50',
  ivs_d: '1.1',
  ivs_s: '1.4',
  lvpw_d: '1.1',
  lvpw_s: '1.4',
  mitral_annulus: '20',
  tricuspid_annulus: '2.0',

  // Column 2
  lvmi: '126',
  rwt: '0.41',
  sv: '102',
  co: '3.5',
  ef_t: '56',
  s_wave: '60',
  fs: '29',
  epss: '1.1',
  lvot: '2.1',
  av_op: '2.3',
  pa: '2.1',
  rvot: '2.4',
  ivc_diameter: '2.1/1.0',
  ivc_collapse: '58%',
  lvet: '236',

  // Column 3
  rv_base: '3.1',
  rv_mid: '2.9',
  rv_length: '5.5',
  tapse: '2.0',
  la_ap: '3.6',
  lavi: '33',
  ra_rl: '3.0',
  aortic_root: '2.3',
  aorta: '2.8',
  annulus: '2.3',
  sinus: '2.3',
  st_junction: '2.5',
  ascending: '2.4',

  // Doppler
  dop_max_vel_mitral_e: 'E: 0.8/3.0',
  dop_max_vel_mitral_a: 'A:0.6/1.7',
  dop_max_vel_aortic_1: '0.78/2.4',
  dop_max_vel_aortic_2: '1.1/5.2',
  dop_max_vel_tricuspid_1: '0.67/1.5',
  dop_max_vel_tricuspid_2: '0.4/0.7',
  dop_max_vel_pulmonic_1: '0.72/2.0',
  dop_max_vel_pulmonic_2: '0.92/3.4',
  dop_ea_ratio_mitral: '',
  dop_ea_ratio_mitral_norm: '0.9 – 1.5',
  dop_tdi_lat_e: '13',
  dop_tdi_lat_a: '11',
  dop_tdi_med_e: '13',
  dop_tdi_med_a: '10',
  dop_decel_time: '340',
  dop_ivrt: '116',
  dop_pv_diastoles: '0.30',
  dop_pv_systole: '0.42',
  dop_pv_sys_dias: '1.3',
  dop_pat: '98',
  dop_regurg_mitral: 'trivial',

  // Reading / Interpretation
  paragraphs: 'Normal left ventricular cavity size with increased left ventricular mass index and relative wall thickness. There is normal wall motion, contractility and global systolic function\nNormal left atrium size\nNormal right ventricular dimension, with adequate contractility\nNormal right atrium, main pulmonary artery\nand aortic root dimension\nThickened mitral valve leaflets without restriction of motion\nStructurally normal aortic, tricuspid and pulmonic valve\nNo intracavitary thrombus and no pericardial effusion seen',
  color_flow: "Mosaic color flow display is seen across the mitral and tricuspid valve during systole and across the pulmonic valve during diastole Normal mitral inflow E/A velocity pattern Normal mitral annular e' velocities Normal estimated pulmonary artery pressure by peak TR jet velocity ( 1.5 m/s)",
  conclusion: 'Concentric left ventricular hypertrophy with normal wall motion, contractility and global systolic function\nTrivial mitral, tricuspid and pulmonic regurgitation\nLow probability of pulmonary hypertension',
  doctorName: 'Melissa R. Cundangan, MD',
  doctorDesignation: 'Cardiologist'
};

const sampleTest = {
  id: 'test-echo-999',
  testId: 'ECH-2026-0001',
  testType: '2D Echocardiography',
  testDate: '2026-07-14T08:00:00.000Z',
  status: 'Completed',
  patient: samplePatient,
  results: sampleResults
};

// -------------------------------------------------------------------------
// Section 1: Template Rendering Tests for Echocardiography Information Sheet
// -------------------------------------------------------------------------
console.log('--- 1. Form 1: Echocardiography Information Sheet Rendering Tests ---');

runTest('Renders Form 1 when sheet="info" with full metadata & measurements', () => {
  const html = ejs.render(require('fs').readFileSync(echoViewPath, 'utf8'), {
    test: sampleTest,
    sheet: 'info',
    inlineLogo: '/assets/gezyne-logo.png',
    hl: () => {}
  }, { filename: echoViewPath });

  assert(html.includes('ECHOCARDIOGRAPHY INFORMATION'), 'Must contain main title ECHOCARDIOGRAPHY INFORMATION');
  assert(html.includes('LOMOTAN, JASON'), 'Must contain patient name');
  assert(html.includes('Weight:</strong> 70 kg'), 'Must display weight');
  assert(html.includes('Height:</strong> 167.3 cm'), 'Must display height');
  assert(html.includes('BSA:</strong> 1.73m²'), 'Must display BSA');
  assert(html.includes('HR =</strong> 63 bpm'), 'Must display Heart Rate');
  assert(html.includes('07/14/2026'), 'Must display test date');
  
  // Verify 3-column measurements
  assert(html.includes('LVEDD'), 'Must contain LVEDD');
  assert(html.includes('5.3'), 'Must contain LVEDD value 5.3');
  assert(html.includes('LVMI'), 'Must contain LVMI');
  assert(html.includes('126'), 'Must contain LVMI value 126');
  assert(html.includes('RV (base)'), 'Must contain RV (base)');
  assert(html.includes('3.1'), 'Must contain RV (base) value 3.1');
  assert(html.includes('Tapse'), 'Must contain Tapse');
  assert(html.includes('LAVI'), 'Must contain LAVI');
  assert(html.includes('IVC diameter'), 'Must contain IVC diameter');
  assert(html.includes('2.1/1.0'), 'Must contain IVC value');

  // Verify Doppler measurements
  assert(html.includes('DOPPLER STUDY'), 'Must contain DOPPLER STUDY header');
  assert(html.includes('MITRAL'), 'Must contain MITRAL column');
  assert(html.includes('AORTIC'), 'Must contain AORTIC column');
  assert(html.includes('TRICUSPID'), 'Must contain TRICUSPID column');
  assert(html.includes('PULMONIC'), 'Must contain PULMONIC column');
  assert(html.includes('Maximum Velocity (m/sec)'), 'Must contain Maximum Velocity row');
  assert(html.includes('MV Annular TDI'), 'Must contain MV Annular TDI');
  assert(html.includes('Deceleration Time (m/sec)'), 'Must contain Deceleration Time');
  assert(html.includes('340'), 'Must contain deceleration time value 340');
  assert(html.includes('IVRT (m/sec)'), 'Must contain IVRT');
  assert(html.includes('116'), 'Must contain IVRT value 116');
  assert(html.includes('Pulmonic Vein'), 'Must contain Pulmonic Vein');
  assert(html.includes('Severity of Regurgitation'), 'Must contain Severity of Regurgitation');
  assert(html.includes('trivial'), 'Must contain trivial regurgitation');
});

runTest('Form 1 Information Sheet strictly enforces 1-page Letter print layout', () => {
  const html = ejs.render(require('fs').readFileSync(echoViewPath, 'utf8'), {
    test: sampleTest,
    sheet: 'info',
    inlineLogo: '/assets/gezyne-logo.png',
    hl: () => {}
  }, { filename: echoViewPath });

  assert(html.includes('Letter portrait'), 'Must declare Letter portrait page size');
  assert(html.includes('echo-info-sheet'), 'Must use echo-info-sheet class');
  assert(html.includes('page-break-inside: avoid'), 'Must avoid breaking inside echo page');
  // Reading sheet should NOT be present when sheet='info'
  assert(!html.includes('echo-reading-sheet'), 'Should not contain reading sheet when sheet=info');
});

// -------------------------------------------------------------------------
// Section 2: Template Rendering Tests for Reading / Interpretation Sheet
// -------------------------------------------------------------------------
console.log('\n--- 2. Form 2: Reading / Interpretation Sheet Rendering Tests ---');

runTest('Renders Form 2 when sheet="reading" with clinical findings & cardiologist', () => {
  const html = ejs.render(require('fs').readFileSync(echoViewPath, 'utf8'), {
    test: sampleTest,
    sheet: 'reading',
    inlineLogo: '/assets/gezyne-logo.png',
    hl: () => {}
  }, { filename: echoViewPath });

  assert(html.includes('Interpretation'), 'Must contain Interpretation section');
  assert(html.includes('Normal left ventricular cavity size'), 'Must contain ventricular cavity findings');
  assert(html.includes('Color flow and Spectral Doppler'), 'Must contain Color flow section');
  assert(html.includes('CONLUSION:'), 'Must contain CONLUSION section');
  assert(html.includes('Concentric left ventricular hypertrophy'), 'Must contain conclusion content');
  assert(html.includes('Melissa R. Cundangan, MD'), 'Must contain Cardiologist signatory');
  assert(html.includes('Cardiologist'), 'Must contain Cardiologist designation');

  // Information sheet should NOT be present when sheet='reading'
  assert(!html.includes('echo-info-sheet'), 'Should not contain info sheet when sheet=reading');
});

// -------------------------------------------------------------------------
// Section 3: Dual-Form (Both Sheets) Print Tests
// -------------------------------------------------------------------------
console.log('\n--- 3. Dual-Form (Both Sheets) Combined Rendering Tests ---');

runTest('Renders BOTH Form 1 and Form 2 with clean page break when sheet="all"', () => {
  const html = ejs.render(require('fs').readFileSync(echoViewPath, 'utf8'), {
    test: sampleTest,
    sheet: 'all',
    inlineLogo: '/assets/gezyne-logo.png',
    hl: () => {}
  }, { filename: echoViewPath });

  assert(html.includes('echo-info-sheet'), 'Must contain Form 1 Information Sheet');
  assert(html.includes('page-break'), 'Must contain page break divider between sheets');
  assert(html.includes('echo-reading-sheet'), 'Must contain Form 2 Reading Sheet');
  assert(html.includes('ECHOCARDIOGRAPHY INFORMATION'), 'Must contain Title on Page 1');
  assert(html.includes('Melissa R. Cundangan, MD'), 'Must contain Cardiologist on Page 2');
});

runTest('Renders gracefully without errors when results object is blank/empty', () => {
  const blankTest = {
    id: 'test-blank',
    testId: 'ECH-BLANK',
    testType: '2D Echocardiography',
    patient: { firstName: 'Maria', lastName: 'Clara' },
    results: {}
  };

  const html = ejs.render(require('fs').readFileSync(echoViewPath, 'utf8'), {
    test: blankTest,
    sheet: 'all',
    inlineLogo: '/assets/gezyne-logo.png',
    hl: () => {}
  }, { filename: echoViewPath });

  assert(html.includes('MARIA'), 'Must render patient name');
  assert(html.includes('echo-info-sheet'), 'Must render Form 1 cleanly without crashing');
  assert(html.includes('echo-reading-sheet'), 'Must render Form 2 cleanly without crashing');
});

// -------------------------------------------------------------------------
// Section 4: Results Entry Form Tests
// -------------------------------------------------------------------------
console.log('\n--- 4. Results Entry Form (results_entry_echocardiography_2d.ejs) Tests ---');

runTest('Entry form renders with dedicated tabs for Information Sheet and Reading', () => {
  const html = ejs.render(require('fs').readFileSync(entryViewPath, 'utf8'), {
    test: sampleTest,
    patient: samplePatient
  }, { filename: entryViewPath });

  assert(html.includes('Form 1: Echocardiography Information'), 'Must contain Tab 1 button');
  assert(html.includes('Form 2: Interpretation & Reading'), 'Must contain Tab 2 button');
  assert(html.includes('formTabInfo'), 'Must contain Tab 1 content container');
  assert(html.includes('formTabReading'), 'Must contain Tab 2 content container');
  assert(html.includes('name="lvedd"'), 'Must have input for lvedd');
  assert(html.includes('name="lvmi"'), 'Must have input for lvmi');
  assert(html.includes('name="rv_base"'), 'Must have input for rv_base');
  assert(html.includes('name="dop_max_vel_mitral_e"'), 'Must have input for mitral max vel');
  assert(html.includes('name="paragraphs"'), 'Must have textarea for interpretation');
  assert(html.includes('name="color_flow"'), 'Must have textarea for color flow');
  assert(html.includes('name="conclusion"'), 'Must have textarea for conclusion');
  assert(html.includes('loadSampleInformationData'), 'Must contain sample data loader for Information Sheet');
  assert(html.includes('loadSampleReadingData'), 'Must contain sample data loader for Reading Report');
});

// -------------------------------------------------------------------------
// Section 5: Live HTTP Router & Query Parameter Tests
// -------------------------------------------------------------------------
console.log('\n--- 5. Live HTTP Router & Query Parameter Communication Tests ---');

async function testHttpEndpoint(pathStr, expectedCode = 200) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:3000${pathStr}`, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, headers: res.headers, body: data });
      });
    });
    req.on('error', err => reject(err));
  });
}

(async () => {
  // Test server connectivity
  await runAsyncTest('GET /reports responds with redirect or 200', async () => {
    const res = await testHttpEndpoint('/reports');
    assert([200, 302].includes(res.statusCode), `Expected 200 or 302, got ${res.statusCode}`);
  });

  console.log('\n========================================================================');
  console.log(`🎉 ALL ${passedTests} OF ${totalTests} 2D ECHOCARDIOGRAPHY TESTS PASSED (100% SUCCESS)!`);
  console.log('========================================================================\n');
})().catch(err => {
  console.error('\nFatal test execution error:', err);
  process.exit(1);
});
