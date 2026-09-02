#!/usr/bin/env node
/**
 * Automated Security Risk Assessment & Compliance Audit Runner
 * Standard: OWASP 2026, NIST SP 800-63B, CIS Hardening
 */
const fs = require('fs');
const path = require('path');
const { checkHeaders } = require('./checks/headers-check');
const { checkAuthCrypto } = require('./checks/auth-crypto-check');
const { checkInjection } = require('./checks/injection-check');
const { checkSanitization } = require('./checks/sanitization-check');
const { checkRateLimit } = require('./checks/rate-limit-check');

const CONFIG_PATH = path.join(__dirname, 'audit-config.json');
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

async function runTargetAudit(targetName, targetInfo) {
  const baseDir = path.resolve(__dirname, targetInfo.path);
  console.log(`\n🔍 Auditing Target: [${targetName.toUpperCase()}] at ${baseDir}`);
  console.log(`   Probing Live Endpoint: ${targetInfo.url || 'None'}`);

  const results = [];

  // Run all security modules
  results.push(await checkHeaders(targetInfo.url, baseDir));
  results.push(await checkAuthCrypto(baseDir));
  results.push(await checkInjection(baseDir));
  results.push(await checkSanitization(baseDir));
  results.push(await checkRateLimit(baseDir));

  // Compute aggregate score
  const totalScore = results.reduce((sum, r) => sum + r.score, 0);
  const avgScore = Math.round(totalScore / results.length);

  // Aggregate findings
  const allFindings = [];
  results.forEach(r => {
    (r.findings || []).forEach(f => {
      allFindings.push({ ...f, check: r.name });
    });
  });

  const criticals = allFindings.filter(f => f.severity === 'CRITICAL');
  const highs = allFindings.filter(f => f.severity === 'HIGH');
  const mediums = allFindings.filter(f => f.severity === 'MEDIUM');
  const lows = allFindings.filter(f => f.severity === 'LOW');

  console.log(`\n📊 [${targetName.toUpperCase()}] AUDIT RESULTS:`);
  console.log(`   Overall Security Score: ${avgScore}% / 100%`);
  console.log(`   Critical Vulnerabilities: ${criticals.length}`);
  console.log(`   High Risk Issues:         ${highs.length}`);
  console.log(`   Medium Risk Issues:       ${mediums.length}`);
  console.log(`   Low/Advisory Notices:     ${lows.length}`);

  results.forEach(r => {
    const statusIcon = r.score >= 85 ? '✅' : (r.score >= 70 ? '⚠️' : '❌');
    console.log(`   ${statusIcon} ${r.name.padEnd(42)} Score: ${String(r.score).padStart(3)}%`);
  });

  if (allFindings.length > 0) {
    console.log(`\n📋 Specific Findings for [${targetName}]:`);
    allFindings.forEach(f => {
      const icon = f.severity === 'CRITICAL' ? '🔴' : (f.severity === 'HIGH' ? '🟠' : (f.severity === 'MEDIUM' ? '🟡' : 'ℹ️'));
      console.log(`   ${icon} [${f.severity}] (${f.rule}): ${f.message}${f.file ? ` [${f.file}:${f.line || ''}]` : ''}`);
    });
  }

  return {
    target: targetName,
    path: baseDir,
    score: avgScore,
    categories: results,
    findings: allFindings,
    summary: {
      critical: criticals.length,
      high: highs.length,
      medium: mediums.length,
      low: lows.length
    }
  };
}

async function main() {
  console.log('================================================================');
  console.log(`🛡️  ${config.name} (v${config.auditVersion})`);
  console.log('================================================================');
  console.log('Active Compliance Standards:');
  config.standards.forEach(s => console.log(` • ${s}`));

  const allReports = {};
  let globalPassed = true;

  for (const [key, target] of Object.entries(config.targets)) {
    const report = await runTargetAudit(key, target);
    allReports[key] = report;

    if (report.score < config.thresholds.minScore ||
        report.summary.critical > config.thresholds.maxCriticalIssues ||
        report.summary.high > config.thresholds.maxHighIssues) {
      globalPassed = false;
    }
  }

  // Write detailed output report
  const reportPayload = {
    timestamp: new Date().toISOString(),
    auditVersion: config.auditVersion,
    overallCompliancePassed: globalPassed,
    reports: allReports
  };

  const reportOutPath = path.join(__dirname, 'audit-report-latest.json');
  fs.writeFileSync(reportOutPath, JSON.stringify(reportPayload, null, 2));
  console.log(`\n💾 Detailed JSON report written to: ${reportOutPath}`);

  console.log('\n================================================================');
  if (globalPassed) {
    console.log('🎉 COMPLIANCE RESULT: PASS');
    console.log('   All repositories comply with 2026 application security baselines.');
    console.log('================================================================\n');
    process.exit(0);
  } else {
    console.log('⚠️  COMPLIANCE RESULT: WARNING / NEEDS ATTENTION');
    console.log('   Review highlighted High/Critical findings above.');
    console.log('================================================================\n');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal audit error:', err);
  process.exit(1);
});
