/**
 * Master Diagnostic Inventory & Permissions Unit Test Runner
 * Centralized directory: test/run-all-inventory-tests.js
 */

const { spawnSync } = require('child_process');
const path = require('path');

const suites = [
  'inventory-and-permissions.test.js',
  'inventory-security.test.js',
  'assign-test-navigation.test.js',
  'standalone-datastore-inventory.test.js'
];

console.log('=============================================================');
console.log('🚀 RUNNING CENTRALIZED INVENTORY & PERMISSIONS UNIT TESTS');
console.log('=============================================================\n');

let totalFailed = 0;

suites.forEach((suite) => {
  const suitePath = path.join(__dirname, suite);
  console.log(`Executing suite: ${suite}...`);
  const result = spawnSync(process.execPath, [suitePath], {
    stdio: 'inherit',
    cwd: __dirname
  });

  if (result.status !== 0) {
    totalFailed++;
  }
});

console.log('=============================================================');
if (totalFailed === 0) {
  console.log('✨ ALL UNIT TEST SUITES PASSED CLEANLY WITH ZERO ERRORS!');
} else {
  console.error(`⚠️ ${totalFailed} TEST SUITE(S) FAILED.`);
  process.exit(1);
}
console.log('=============================================================\n');
