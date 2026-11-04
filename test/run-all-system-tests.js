/**
 * ============================================================================
 * GEZYNE LIS - MASTER COMPREHENSIVE SYSTEM TEST RUNNER
 * ============================================================================
 * 
 * Orchestrates and executes all centralized system test suites, including:
 * 1. Master 17-Module Regression Suite (test/system-regression.test.js)
 * 2. Diagnostic Inventory & Permissions Test Suite (test/run-all-inventory-tests.js)
 * 3. Equipment QC & Levey-Jennings Backend Suite (test/equipment-backend.test.js)
 * 4. Standalone Full Offline 6-Suite Pipeline (test/run-all-offline-tests.js)
 * 5. Standalone SQLite DataStore & Migration Suite (test/standalone-sqlite-datastore.test.js)
 * 6. Standalone Multi-Station Pipeline Suite (test/test-standalone-multi-station-pipeline.js)
 * 7. Thermal & Print Queue Protection Suite (test/thermal-and-print-queue.test.js)
 * 8. Server Boot & Secret Isolation Suite (test/server-boot-no-secrets.test.js)
 * 9. Server URL Normalization & Network Resilience Suite (test/server-url-normalization.test.js)
 * 10. 2D Echocardiography Dual-Form & Print Layout Suite (test/echocardiography-forms.test.js)
 * 11. HR & Costing Endpoints Suite (test/hr-costing-endpoints.test.js)
 * 12. Standalone Integrated Sync & ID Mapping Suite (test/standalone-integrated-sync.test.js)
 * 13. Digital Signature Sync & Authorization Suite (test/test-signature-sync-e2e.js)
 * 14. RBAC Permissions Matrix & CSRF Protection Suite (test/permissions-and-csrf.test.js)
 * 15. Facility Settings & Accreditation System Suite (test/settings-system.test.js)
 * 
 * Invoked via:
 *   npm test
 *   npm run test:all
 * ============================================================================
 */

const { spawnSync } = require('child_process');
const path = require('path');

// Configure NODE_PATH dynamically so child processes resolve dependencies from fullstack and standalone
const fullstackDir = path.join(__dirname, '..', 'lis-fullstack');
const standaloneDir = path.join(__dirname, '..', 'lis-app-standalone');
const nodePath = [
  path.join(fullstackDir, 'node_modules'),
  path.join(standaloneDir, 'node_modules'),
  path.join(__dirname, 'node_modules')
].join(path.delimiter);

const suites = [
  {
    name: 'Master 17-Module System Regression Suite',
    file: 'system-regression.test.js',
    scope: 'Core System (Auth, Dashboard, Patients, Reception, Results, Worksheet, Inventory, QC, PhilHealth, HR)'
  },
  {
    name: 'Diagnostic Inventory & Permissions Suite',
    file: 'run-all-inventory-tests.js',
    scope: 'Reagent Catalog, Lot Tracking, Open-Vial Stability, Multi-Dept Role Access'
  },
  {
    name: 'Equipment QC & Levey-Jennings Backend',
    file: 'equipment-backend.test.js',
    scope: 'Analyzer Registry, IQC Levey-Jennings, Westgard Multirules, NEQAS EQA'
  },
  {
    name: 'Standalone Full Offline 6-Suite Pipeline',
    file: 'run-all-offline-tests.js',
    scope: 'Offline SQLite CRUD, Reception Pipeline, Multi-Station Routing, Deletion Queue'
  },
  {
    name: 'Standalone SQLite DataStore & Migration',
    file: 'standalone-sqlite-datastore.test.js',
    scope: 'SQLite Storage Engine, Legacy JSON Auto-Migration, Table Schemas'
  },
  {
    name: 'Standalone Multi-Station Pipeline',
    file: 'test-standalone-multi-station-pipeline.js',
    scope: 'End-to-End Reception, Cashier, Extraction, Laboratory Processing & Releasing'
  },
  {
    name: 'Thermal Printing & Print Queue Protection',
    file: 'thermal-and-print-queue.test.js',
    scope: 'Thermal Barcode Labels, ESC/POS Specs, OperationQueue Non-Sync Filtering'
  },
  {
    name: 'Server Boot & Secret Isolation',
    file: 'server-boot-no-secrets.test.js',
    scope: 'Zero-Secret Boot, Crypto Key Isolation, Environment Hardening'
  },
  {
    name: 'Server URL Normalization & Network Resilience',
    file: 'server-url-normalization.test.js',
    scope: 'Multi-Interface IP Resolution, Trailing Slashes, Offline Fallback'
  },
  {
    name: '2D Echocardiography Dual-Form & Print Layouts',
    file: 'echocardiography-forms.test.js',
    scope: 'Doppler Grid Measurements, Information Sheet, Reading Sheet, Letter Page Fitting'
  },
  {
    name: 'HR & Costing Endpoints Suite',
    file: 'hr-costing-endpoints.test.js',
    scope: 'Employee Directory, DTR Attendance, TRAIN Tax Deductions, Test Costing & P&L'
  },
  {
    name: 'Standalone Integrated Sync & ID Mapping',
    file: 'standalone-integrated-sync.test.js',
    scope: 'Bidirectional Sync, Temp ID Resolution, Server UUID Propagation'
  },
  {
    name: 'Digital Signature Sync & PIN Authorization',
    file: 'test-signature-sync-e2e.js',
    scope: 'Cryptographic Signatures, PIN Verification, Bi-Level Signatories'
  },
  {
    name: 'RBAC Permissions Matrix & CSRF Protection',
    file: 'permissions-and-csrf.test.js',
    scope: '10 User Roles, 13 Granular Privileges, CSRF Tokens in Forms'
  },
  {
    name: 'Facility Settings & Accreditations',
    file: 'settings-system.test.js',
    scope: 'DOH LTO Credentials, PhilHealth Accreditations, Dark Mode & Feature Flags'
  },
  {
    name: 'Markdown Formatting, Manual & v3.0.0 Parity',
    file: 'markdown-and-version-3.0.0.test.js',
    scope: 'Markdown Line Breaks, Headings, Table of Contents, Version 3.0.0 Parity'
  },
  {
    name: 'GezyneBot AI Knowledge Coverage (v3.0.0)',
    file: 'test_gezynebot_knowledge.js',
    scope: '16 Manual Chapters, Westgard Rules, Ultrasound, HR/Payroll across Server, Client & Tray'
  }
];

console.log('######################################################################');
console.log('#                                                                    #');
console.log('#       GEZYNE LIS - MASTER COMPREHENSIVE SYSTEM TEST RUNNER         #');
console.log('#       Executing All Certified Unit & End-to-End Test Suites        #');
console.log('#                                                                    #');
console.log('######################################################################\n');

const overallStart = Date.now();
const results = [];
let totalFailures = 0;

for (let i = 0; i < suites.length; i++) {
  const suite = suites[i];
  const suitePath = path.join(__dirname, suite.file);
  console.log(`[${i + 1}/${suites.length}] RUNNING: ${suite.name} (${suite.file})...`);
  
  const start = Date.now();
  const proc = spawnSync(process.execPath, [suitePath], {
    cwd: __dirname,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_PATH: nodePath,
      NODE_ENV: 'test',
      PORT: '3000'
    }
  });

  const duration = ((Date.now() - start) / 1000).toFixed(2);
  const passed = proc.status === 0;

  if (passed) {
    console.log(`>>> STATUS: ✅ PASSED (${duration}s)\n`);
  } else {
    console.error(`>>> STATUS: ❌ FAILED (Exit Code: ${proc.status}, Duration: ${duration}s)\n`);
    totalFailures++;
  }

  results.push({
    name: suite.name,
    file: suite.file,
    scope: suite.scope,
    passed,
    status: proc.status,
    duration
  });
}

const overallDuration = ((Date.now() - overallStart) / 1000).toFixed(2);

console.log('\n==================================================================================================');
console.log('                          SYSTEM REGRESSION & CAPABILITY AUDIT REPORT                            ');
console.log('==================================================================================================');
console.log(
  'SUITE'.padEnd(45) +
  'STATUS'.padEnd(12) +
  'DURATION'.padEnd(12) +
  'SYSTEM CAPABILITY'
);
console.log('--------------------------------------------------------------------------------------------------');

results.forEach((r) => {
  const statusStr = r.passed ? '✅ PASS' : '❌ FAIL';
  const durStr = `${r.duration}s`;
  console.log(
    r.name.padEnd(45) +
    statusStr.padEnd(12) +
    durStr.padEnd(12) +
    r.scope
  );
});

console.log('==================================================================================================');
const passedCount = results.filter(r => r.passed).length;
console.log(`TOTAL SUITES EXECUTED: ${results.length}`);
console.log(`PASSED: ${passedCount} / ${results.length}`);
console.log(`FAILED: ${totalFailures} / ${results.length}`);
console.log(`TOTAL AUDIT DURATION : ${overallDuration}s`);

if (totalFailures === 0) {
  console.log('\n🎉 ALL SYSTEM CAPABILITIES AND REGRESSION SUITES PASSED CLEANLY (100% SUCCESS)!');
  console.log('The system is completely validated for clinical production and future regression checks.\n');
  process.exit(0);
} else {
  console.error(`\n⚠️  WARNING: ${totalFailures} TEST SUITE(S) FAILED. Please review the output above.\n`);
  process.exit(1);
}
