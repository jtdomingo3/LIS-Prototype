/**
 * Security Audit Check: Authentication & Cryptographic Standards
 * Standards: NIST SP 800-63B, OWASP A02:2021-Cryptographic Failures, OWASP A07:2021-Identification and Authentication Failures
 */
const fs = require('fs');
const path = require('path');

async function checkAuthCrypto(baseDir) {
  const findings = [];
  let score = 100;

  const userModelPath = path.join(baseDir, 'models', 'User.js');
  const authRoutePath = path.join(baseDir, 'routes', 'auth.js');
  const serverPath = path.join(baseDir, 'server.js');
  const localServerPath = path.join(baseDir, 'lib', 'localServer.js');

  // 1. Audit User.js for secure password hashing (bcrypt / argon2)
  if (fs.existsSync(userModelPath)) {
    const content = fs.readFileSync(userModelPath, 'utf8');
    
    // Check for bcrypt / scrypt / argon2
    if (content.includes('bcrypt') || content.includes('scrypt') || content.includes('argon2')) {
      // Check salt rounds (minimum 10 recommended by OWASP 2026)
      const roundsMatch = content.match(/bcrypt\.hash\([^,]+,\s*(\d+)\)/) || content.match(/genSalt\s*\(\s*(\d+)\s*\)/);
      if (roundsMatch) {
        const rounds = parseInt(roundsMatch[1], 10);
        if (rounds < 10) {
          score -= 15;
          findings.push({
            severity: 'HIGH',
            rule: 'PASSWORD_HASH_ROUNDS_LOW',
            message: `bcrypt salt rounds configured at ${rounds}. OWASP 2026 recommends minimum 10 rounds.`
          });
        }
      }
    } else {
      score -= 40;
      findings.push({
        severity: 'CRITICAL',
        rule: 'WEAK_PASSWORD_HASHING',
        message: 'No modern password hashing library (bcrypt, scrypt, argon2) found in User model.'
      });
    }

    // Check if plain text password property is stripped or excluded from toJSON()
    if (content.includes('delete') && (content.includes('password') || content.includes('pwd'))) {
      // PASS: password is sanitized from serialization
    } else if (content.includes('toJSON')) {
      findings.push({
        severity: 'LOW',
        rule: 'MODEL_PASSWORD_OMISSION',
        message: 'Ensure toJSON() explicitly excludes the password/hash field during serialization.'
      });
    }
  }

  // 2. Audit Session Secret Strength
  const srvFile = fs.existsSync(serverPath) ? serverPath : (fs.existsSync(localServerPath) ? localServerPath : null);
  if (srvFile) {
    const srvContent = fs.readFileSync(srvFile, 'utf8');
    if (srvContent.includes("secret: 'secret'") || srvContent.includes("secret: '123456'") || srvContent.includes("secret: 'keyboard cat'")) {
      score -= 25;
      findings.push({
        severity: 'HIGH',
        rule: 'WEAK_SESSION_SECRET',
        message: 'Hardcoded weak session secret detected in server configuration.'
      });
    }
  }

  return {
    name: 'Authentication & Cryptographic Standards',
    score: Math.max(0, score),
    findings
  };
}

module.exports = { checkAuthCrypto };
