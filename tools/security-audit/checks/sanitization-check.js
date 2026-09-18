/**
 * Security Audit Check: Log Sanitization, PII Protection & Path Traversal
 * Standards: OWASP A09:2021-Security Logging and Monitoring Failures, CWE-22 Path Traversal
 */
const fs = require('fs');
const path = require('path');

async function checkSanitization(baseDir) {
  const findings = [];
  let score = 100;

  const serverFile = path.join(baseDir, 'server.js');
  const localServerFile = path.join(baseDir, 'lib', 'localServer.js');
  const targetFile = fs.existsSync(serverFile) ? serverFile : (fs.existsSync(localServerFile) ? localServerFile : null);

  if (targetFile) {
    const content = fs.readFileSync(targetFile, 'utf8');

    // 1. Audit maskSensitive implementation in request logger
    if (content.includes('maskSensitive')) {
      const requiredMasks = ['password', 'token', 'authorization', 'bearer', 'hash'];
      const missingMasks = requiredMasks.filter(k => !content.toLowerCase().includes(k));

      if (missingMasks.length > 0) {
        score -= 15;
        findings.push({
          severity: 'MEDIUM',
          rule: 'LOG_MASK_INCOMPLETE',
          message: `Request logger maskSensitive does not explicitly mask: ${missingMasks.join(', ')}.`
        });
      }
    } else {
      score -= 25;
      findings.push({
        severity: 'HIGH',
        rule: 'LOG_MASK_MISSING',
        message: 'No request payload sensitive field masking function found in server middleware.'
      });
    }

    // 2. Audit static asset serving path traversal guards
    if (content.includes('express.static')) {
      // express.static automatically handles standard path traversal, but check if custom file delivery routes exist
      const dangerousFileSends = content.match(/res\.sendFile\([^)]*\)/g) || [];
      for (const call of dangerousFileSends) {
        if (!call.includes('path.join') && !call.includes('path.resolve') && !call.includes('path.normalize')) {
          score -= 15;
          findings.push({
            severity: 'HIGH',
            rule: 'POTENTIAL_PATH_TRAVERSAL',
            message: `res.sendFile call without path normalization/joining: ${call.slice(0, 80)}`
          });
        }
      }
    }
  }

  return {
    name: 'Log Sanitization, PII & Path Traversal',
    score: Math.max(0, score),
    findings
  };
}

module.exports = { checkSanitization };
