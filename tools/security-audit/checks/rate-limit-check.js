/**
 * Security Audit Check: Rate Limiting & Brute-Force Throttling
 * Standards: OWASP A07:2021-Identification and Authentication Failures, OWASP A04:2021-Insecure Design
 */
const fs = require('fs');
const path = require('path');

async function checkRateLimit(baseDir) {
  const findings = [];
  let score = 100;

  const serverFile = path.join(baseDir, 'server.js');
  const authRoute = path.join(baseDir, 'routes', 'auth.js');
  const targetFile = fs.existsSync(serverFile) ? serverFile : null;

  if (targetFile) {
    const content = fs.readFileSync(targetFile, 'utf8');

    // 1. Check for rate limit middleware import
    if (content.includes('express-rate-limit') || content.includes('rateLimit')) {
      // Check if /login is protected
      if (!content.includes("app.use('/login'") && !content.includes('authLimiter')) {
        score -= 20;
        findings.push({
          severity: 'HIGH',
          rule: 'LOGIN_RATE_LIMIT_UNMOUNTED',
          message: 'Rate limiting package is imported, but not mounted on the /login endpoint.'
        });
      }
    } else {
      score -= 30;
      findings.push({
        severity: 'HIGH',
        rule: 'RATE_LIMITING_MISSING',
        message: 'No rate limiting middleware detected to prevent brute-force attacks on authentication routes.'
      });
    }
  }

  return {
    name: 'Rate Limiting & Brute-Force Throttling',
    score: Math.max(0, score),
    findings
  };
}

module.exports = { checkRateLimit };
