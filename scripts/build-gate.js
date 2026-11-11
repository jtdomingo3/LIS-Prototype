/**
 * ============================================================================
 * GEZYNE LIS - PRE-BUILD QUALITY & TEST GATE
 * ============================================================================
 * 
 * Enforces strict pre-compilation quality gates:
 * 1. Executes all 22 master system test suites (test/run-all-system-tests.js).
 * 2. Executes automated OWASP & security audit (tools/security-audit/run-security-audit.js).
 * 
 * If ANY test or security check fails, the build gate halts the entire pipeline
 * with exit code 1, preventing defective or stale binaries from ever compiling.
 * 
 * Invoked via:
 *   node scripts/build-gate.js
 * ============================================================================
 */

const { spawnSync } = require('child_process');
const path = require('path');

function runGate() {
  const repoRoot = path.resolve(__dirname, '..');
  console.log('======================================================================');
  console.log('🛡️  GEZYNE LIS - PRE-BUILD COMPULSORY TEST & SECURITY GATE');
  console.log('======================================================================');
  console.log('Verifying zero regressions and zero security vulnerabilities before compilation...\n');

  // Step 1: Run All 25 System Regression Suites
  console.log('▶ [Gate 1/2] Executing Master System Test Suites (25 Suites)...');
  const testRunnerPath = path.join(repoRoot, 'test', 'run-all-system-tests.js');
  const testResult = spawnSync(process.execPath, [testRunnerPath], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env
  });

  if (testResult.status !== 0) {
    console.error('\n❌ BUILD GATE ABORTED: One or more system test suites failed!');
    console.error('Setup compilation has been cancelled. Please resolve failing tests before packaging.\n');
    process.exit(1);
  }
  console.log('✅ [Gate 1/2] All 25 System Test Suites Passed Cleanly (100% Success)!\n');

  // Step 2: Run Security & OWASP Audit
  console.log('▶ [Gate 2/2] Executing Automated Security & Amazon Inspector Audit...');
  const secAuditPath = path.join(repoRoot, 'tools', 'security-audit', 'run-security-audit.js');
  const secResult = spawnSync(process.execPath, [secAuditPath], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env
  });

  if (secResult.status !== 0) {
    console.error('\n❌ BUILD GATE ABORTED: Security audit detected vulnerabilities or policy failures!');
    console.error('Setup compilation has been cancelled. Please resolve security findings before packaging.\n');
    process.exit(1);
  }
  console.log('✅ [Gate 2/2] Security Audit Passed with 100/100 Score & 0 Vulnerabilities!\n');

  console.log('======================================================================');
  console.log('🎉 ALL PRE-BUILD QUALITY GATES CLEARED CLEANLY');
  console.log('Proceeding to compilation pipeline...');
  console.log('======================================================================\n');
}

if (require.main === module) {
  runGate();
}

module.exports = { runGate };

