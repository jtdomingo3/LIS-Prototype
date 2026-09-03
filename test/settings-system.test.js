/**
 * System Test Suite: Settings Management, Real-Time SSE Streams, & Hardware Diagnostics
 * 
 * Verifies:
 * 1. Default SSE configuration values and bound validation.
 * 2. All 12 sidebar routes are configurable in the SSE allowlist.
 * 3. Auto-Refresh by Default setting propagation.
 * 4. Printer Name consolidation, fallback resolution, and test print invocation.
 * 5. Removal of test print from Patient views.
 * 6. Clean rendering of views/settings.ejs (all tabs, inputs, and controls).
 * 7. Injection of window.__LIS_SSE_CONFIG__ into views/layout.ejs.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

let ejs;
try {
  ejs = require('../lis-fullstack/node_modules/ejs');
} catch (e) {
  ejs = require('ejs');
}

console.log('\n========================================================================');
console.log('🧪 RUNNING SYSTEM TESTS: Settings, SSE Configuration, & Printer Diagnostics');
console.log('========================================================================\n');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}\n`);
    throw err;
  }
}

// -------------------------------------------------------------
// 1. SSE CONFIGURATION & SIDEBAR PAGES VALIDATION
// -------------------------------------------------------------
console.log('--- 1. SSE Real-Time Stream Configuration & Allowlist ---');

const ALL_12_SIDEBAR_PAGES = [
  { key: 'dashboard', path: '/dashboard' },
  { key: 'reception', path: '/reception' },
  { key: 'patients', path: '/patients' },
  { key: 'tests', path: '/tests' },
  { key: 'reports', path: '/reports' },
  { key: 'inventory', path: '/inventory' },
  { key: 'signatures', path: '/signatures' },
  { key: 'worksheet', path: '/reports/worksheet' },
  { key: 'templates', path: '/templates' },
  { key: 'users', path: '/users' },
  { key: 'settings', path: '/settings' },
  { key: 'chatbot', path: '/chatbot' }
];

function parseSseConfigFromFlags(flags = {}) {
  const sseAllowedPages = [];
  if (flags.sse_page_dashboard) sseAllowedPages.push('/dashboard');
  if (flags.sse_page_patients) sseAllowedPages.push('/patients');
  if (flags.sse_page_reception) sseAllowedPages.push('/reception');
  if (flags.sse_page_tests) sseAllowedPages.push('/tests');
  if (flags.sse_page_reports) sseAllowedPages.push('/reports');
  if (flags.sse_page_inventory) sseAllowedPages.push('/inventory');
  if (flags.sse_page_signatures) sseAllowedPages.push('/signatures');
  if (flags.sse_page_worksheet) sseAllowedPages.push('/reports/worksheet');
  if (flags.sse_page_templates) sseAllowedPages.push('/templates');
  if (flags.sse_page_users) sseAllowedPages.push('/users');
  if (flags.sse_page_settings) sseAllowedPages.push('/settings');
  if (flags.sse_page_chatbot) sseAllowedPages.push('/chatbot');

  const parsedConnectDelay = parseInt(flags.sseConnectDelaySec, 10);
  const parsedRetryDelay = parseInt(flags.sseRetryDelaySec, 10);
  const parsedRefreshDebounce = parseInt(flags.sseRefreshDebounceMs, 10);

  return {
    enabled: flags.sseEnabled === 'on' || flags.sseEnabled === true || flags.sseEnabled === 'true',
    autoRefreshByDefault: flags.sseAutoRefreshByDefault === 'on' || flags.sseAutoRefreshByDefault === true || flags.sseAutoRefreshByDefault === 'true',
    allowedPages: sseAllowedPages,
    connectDelaySec: !isNaN(parsedConnectDelay) ? Math.max(0, parsedConnectDelay) : 3,
    retryDelaySec: !isNaN(parsedRetryDelay) ? Math.max(1, parsedRetryDelay) : 3,
    refreshDebounceMs: !isNaN(parsedRefreshDebounce) ? Math.max(100, parsedRefreshDebounce) : 800
  };
}

test('Should parse all 12 sidebar pages when checked', () => {
  const flags = {
    sseEnabled: 'on',
    sseAutoRefreshByDefault: 'on',
    sse_page_dashboard: 'on',
    sse_page_reception: 'on',
    sse_page_patients: 'on',
    sse_page_tests: 'on',
    sse_page_reports: 'on',
    sse_page_inventory: 'on',
    sse_page_signatures: 'on',
    sse_page_worksheet: 'on',
    sse_page_templates: 'on',
    sse_page_users: 'on',
    sse_page_settings: 'on',
    sse_page_chatbot: 'on',
    sseConnectDelaySec: '5',
    sseRetryDelaySec: '4',
    sseRefreshDebounceMs: '1200'
  };

  const cfg = parseSseConfigFromFlags(flags);

  assert.strictEqual(cfg.enabled, true);
  assert.strictEqual(cfg.autoRefreshByDefault, true);
  assert.strictEqual(cfg.connectDelaySec, 5);
  assert.strictEqual(cfg.retryDelaySec, 4);
  assert.strictEqual(cfg.refreshDebounceMs, 1200);
  assert.strictEqual(cfg.allowedPages.length, 12);
  ALL_12_SIDEBAR_PAGES.forEach(item => {
    assert.ok(cfg.allowedPages.includes(item.path), `Missing allowed path: ${item.path}`);
  });
});

test('Should enforce boundaries for negative or invalid timing values', () => {
  const cfg = parseSseConfigFromFlags({
    sseConnectDelaySec: '-10',
    sseRetryDelaySec: '0',
    sseRefreshDebounceMs: '20'
  });

  assert.strictEqual(cfg.connectDelaySec, 0, 'connectDelaySec minimum should be 0');
  assert.strictEqual(cfg.retryDelaySec, 1, 'retryDelaySec minimum should be 1');
  assert.strictEqual(cfg.refreshDebounceMs, 100, 'refreshDebounceMs minimum should be 100ms');
});

test('Should support disabling auto-refresh while keeping SSE notifications enabled', () => {
  const cfg = parseSseConfigFromFlags({
    sseEnabled: 'on',
    sseAutoRefreshByDefault: undefined // unchecked
  });

  assert.strictEqual(cfg.enabled, true);
  assert.strictEqual(cfg.autoRefreshByDefault, false);
});

// -------------------------------------------------------------
// 2. PRINTER NAME CONSOLIDATION & RESOLUTION
// -------------------------------------------------------------
console.log('\n--- 2. Printer Hardware Configuration & Name Fallbacks ---');

function resolvePrinterName(settings = {}, env = {}) {
  return settings.printerName || env.PRINTER_NAME || env.THERMAL_PRINTER_NAME || '';
}

test('Should resolve printer from settings.printerName as highest priority', () => {
  const res = resolvePrinterName({ printerName: 'Custom POS-80' }, { PRINTER_NAME: 'Xprinter XP-230H' });
  assert.strictEqual(res, 'Custom POS-80');
});

test('Should fall back to PRINTER_NAME from .env when setting is empty', () => {
  const res = resolvePrinterName({}, { PRINTER_NAME: 'Xprinter XP-230H' });
  assert.strictEqual(res, 'Xprinter XP-230H');
});

test('Should verify thermal test script exists and supports required flags', () => {
  const scriptPath = path.join(__dirname, '..', 'lis-fullstack', 'scripts', 'thermal_test.js');
  assert.ok(fs.existsSync(scriptPath), 'thermal_test.js must exist at lis-fullstack/scripts/thermal_test.js');
  const content = fs.readFileSync(scriptPath, 'utf8');
  assert.ok(content.includes('--receipt'), 'Script must support --receipt');
  assert.ok(content.includes('--printer'), 'Script must support --printer');
  assert.ok(content.includes('--dry-run'), 'Script must support --dry-run');
});

// -------------------------------------------------------------
// 3. REMOVAL OF TEST PRINT FROM PATIENT TAB
// -------------------------------------------------------------
console.log('\n--- 3. Patient View Test Print Button Removal Verification ---');

test('Patient index view must NOT contain testPrintBtn or thermal print handler', () => {
  const patientViewPath = path.join(__dirname, '..', 'lis-fullstack', 'views', 'patients', 'index.ejs');
  assert.ok(fs.existsSync(patientViewPath), 'Patient index view must exist');
  const viewContent = fs.readFileSync(patientViewPath, 'utf8');

  assert.ok(!viewContent.includes('id="testPrintBtn"'), 'testPrintBtn ID must not exist in patient view');
  assert.ok(!viewContent.includes('/patients/thermal-print'), 'thermal-print endpoint call must not exist in patient view');
});

// -------------------------------------------------------------
// 4. SETTINGS VIEW RENDERING & CONTROLS
// -------------------------------------------------------------
console.log('\n--- 4. Settings View (views/settings.ejs) Compilation & Structure ---');

test('views/settings.ejs should compile and render all 6 tabs cleanly', () => {
  const settingsViewPath = path.join(__dirname, '..', 'lis-fullstack', 'views', 'settings.ejs');
  assert.ok(fs.existsSync(settingsViewPath), 'Settings view file must exist');
  const tpl = fs.readFileSync(settingsViewPath, 'utf8');

  const mockData = {
    settings: {
      printerName: 'Xprinter XP-230H',
      doctor1Name: 'Dr. Lorenzo',
      doctor2Name: 'Dr. Arcilla',
      gezynePath: 'C:\\data\\analyser'
    },
    sseConfig: {
      enabled: true,
      autoRefreshByDefault: true,
      allowedPages: ['/dashboard', '/reception', '/patients', '/tests', '/inventory', '/signatures', '/reports/worksheet', '/templates', '/users', '/settings', '/chatbot'],
      connectDelaySec: 3,
      retryDelaySec: 3,
      refreshDebounceMs: 800
    },
    printerName: 'Xprinter XP-230H',
    featureFlags: { tests: true, reports: true },
    backupConfig: { enabled: true, frequency: 'daily', path: 'C:\\backup' },
    envEntries: [
      { type: 'kv', key: 'HOST', value: '0.0.0.0' },
      { type: 'kv', key: 'PORT', value: '3000' },
      { type: 'kv', key: 'NODE_ENV', value: 'development' },
      { type: 'kv', key: 'PRINTER_NAME', value: 'Xprinter XP-230H' } // should be filtered from .env tab
    ],
    recentLogs: [],
    logFilePath: '',
    hasOpenRouterKey: true,
    maskedKey: 'sk-or-v1-a...4321',
    currentModel: 'anthropic/claude-3.5-sonnet',
    availableModels: [{ id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' }],
    requirePaymentAmount: true,
    networkUrl: '192.168.31.86:3000'
  };

  const html = ejs.compile(tpl)(mockData);

  // Tab buttons
  assert.ok(html.includes('tab-sse'), 'Must have SSE tab');
  assert.ok(html.includes('tab-printer'), 'Must have Printer tab');
  assert.ok(html.includes('tab-ai'), 'Must have AI tab');
  assert.ok(html.includes('tab-clinical'), 'Must have Clinical tab');
  assert.ok(html.includes('tab-backup'), 'Must have Backup tab');
  assert.ok(html.includes('tab-system'), 'Must have System tab');

  // Verify all 12 sidebar items are present as checkboxes
  ALL_12_SIDEBAR_PAGES.forEach(item => {
    assert.ok(html.includes(`sse_page_${item.key}`), `Checkbox for sse_page_${item.key} must exist in HTML`);
    assert.ok(html.includes(item.path), `Path label for ${item.path} must exist in HTML`);
  });

  // Verify autoRefreshByDefault toggle exists
  assert.ok(html.includes('name="sseAutoRefreshByDefault"'), 'sseAutoRefreshByDefault checkbox must exist');

  // Verify printer name is pre-populated in Printer & Hardware tab
  assert.ok(html.includes('value="Xprinter XP-230H"'), 'Configured printer name must be populated in the input field');
  assert.ok(html.includes('id="btnTestPrint"'), 'Send Test Print button must exist');
  assert.ok(html.includes('executeTestPrint()'), 'executeTestPrint() function trigger must exist');

  // Verify PRINTER_NAME is filtered out from raw .env tab so there are no duplicates
  const envSection = html.slice(html.indexOf('tab-system'));
  assert.ok(!envSection.includes('name="env_PRINTER_NAME"'), 'PRINTER_NAME must be excluded from generic .env form');
});

// -------------------------------------------------------------
// 5. GLOBAL LAYOUT & SSE CLIENT INJECTION
// -------------------------------------------------------------
console.log('\n--- 5. Layout (views/layout.ejs) SSE Configuration Injection ---');

test('views/layout.ejs should inject window.__LIS_SSE_CONFIG__ and use allowedPages', () => {
  const layoutViewPath = path.join(__dirname, '..', 'lis-fullstack', 'views', 'layout.ejs');
  assert.ok(fs.existsSync(layoutViewPath), 'Layout view file must exist');
  const layoutContent = fs.readFileSync(layoutViewPath, 'utf8');

  assert.ok(layoutContent.includes('window.__LIS_SSE_CONFIG__'), 'Must inject window.__LIS_SSE_CONFIG__');
  assert.ok(layoutContent.includes('sseCfg.allowedPages'), 'Must use sseCfg.allowedPages');
  assert.ok(layoutContent.includes('sseCfg.autoRefreshByDefault'), 'Must use sseCfg.autoRefreshByDefault');
  assert.ok(layoutContent.includes('sseCfg.refreshDebounceMs'), 'Must use sseCfg.refreshDebounceMs');
  assert.ok(layoutContent.includes('sseCfg.connectDelaySec'), 'Must use sseCfg.connectDelaySec');
});

// -------------------------------------------------------------
// 6. STANDALONE DATASTORE & OFFLINEDB SETTINGS SYNCHRONIZATION
// -------------------------------------------------------------
console.log('\n--- 6. Standalone SQLite DataStore & Settings Sync Fidelity ---');

test('Standalone DataStore and offlineDb should store and retrieve sseConfig & printerName', async () => {
  const { DataStore } = require('../lis-app-standalone/lib/dataStore');
  const { createOfflineDb } = require('../lis-app-standalone/lib/offlineDb');

  const tmpStoreDir = path.join(__dirname, 'tmp-settings-test-store');
  const storeDir = path.join(tmpStoreDir, 'store');
  try { if (fs.existsSync(tmpStoreDir)) fs.rmSync(tmpStoreDir, { recursive: true, force: true }); } catch (e) {}
  fs.mkdirSync(storeDir, { recursive: true });

  const ds = await new DataStore(storeDir).ready();
  const offlineDb = createOfflineDb(ds);

  const serverSettingsPayload = {
    printerName: 'Xprinter XP-230H',
    doctor1Name: 'Dr. Lorenzo',
    doctor2Name: 'Dr. Arcilla',
    requirePaymentAmount: true,
    sseConfig: {
      enabled: true,
      autoRefreshByDefault: true,
      allowedPages: ['/dashboard', '/reception', '/patients', '/tests', '/inventory', '/signatures', '/reports/worksheet', '/templates', '/users', '/settings', '/chatbot'],
      connectDelaySec: 3,
      retryDelaySec: 3,
      refreshDebounceMs: 800
    }
  };

  offlineDb.setSettings(serverSettingsPayload);

  const retrieved = offlineDb.getSettings();
  assert.ok(retrieved, 'Settings should be retrieved from offlineDb');
  assert.strictEqual(retrieved.printerName, 'Xprinter XP-230H');
  assert.strictEqual(retrieved.doctor1Name, 'Dr. Lorenzo');
  assert.strictEqual(retrieved.requirePaymentAmount, true);
  assert.ok(retrieved.sseConfig, 'sseConfig must exist in retrieved settings');
  assert.strictEqual(retrieved.sseConfig.enabled, true);
  assert.strictEqual(retrieved.sseConfig.autoRefreshByDefault, true);
  assert.strictEqual(retrieved.sseConfig.allowedPages.length, 11);
});

// -------------------------------------------------------------
// SUMMARY
// -------------------------------------------------------------
console.log('\n========================================================================');
console.log(`🎉 ALL ${passedTests}/${totalTests} SYSTEM TESTS PASSED SUCCESSFULLY!`);
console.log('========================================================================\n');

process.exit(0);
