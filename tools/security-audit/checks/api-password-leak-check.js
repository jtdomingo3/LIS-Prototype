/**
 * Security Audit Check: Password Leak Prevention & API Data Exposure Audit
 * Standards: OWASP Top 10 (2025/2026), OWASP API Security Top 10 (API3: Broken Object Property Level Authorization, API8: Security Misconfiguration)
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

function probeHttp(urlStr, options = {}) {
  return new Promise((resolve) => {
    try {
      const url = new URL(urlStr);
      const client = url.protocol === 'https:' ? https : http;
      const req = client.request(url, {
        method: options.method || 'GET',
        headers: options.headers || {},
        timeout: options.timeout || 1500
      }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
      if (options.body) req.write(options.body);
      req.end();
    } catch (_) {
      resolve(null);
    }
  });
}

async function checkApiPasswordLeak(baseDir, targetUrl = null) {
  const findings = [];
  let score = 100;

  // ── 1. Model Password Stripping & Serialization Protection ────────────────
  const userModelPath = path.join(baseDir, 'models', 'User.js');
  if (fs.existsSync(userModelPath)) {
    try {
      const User = require(userModelPath);
      const testSecret = 'SUPER_CONFIDENTIAL_BCRYPT_TEST_HASH_987654321';
      const dummyUser = new User({
        id: 'leak-test-uuid',
        name: 'Leak Test User',
        email: 'leaktest@gezyne.com',
        password: testSecret,
        role: 'Admin',
        status: 'Active'
      });

      // A. Check user.toJSON()
      const jsonObj = (typeof dummyUser.toJSON === 'function') ? dummyUser.toJSON() : dummyUser;
      if (jsonObj && jsonObj.password) {
        score -= 35;
        findings.push({
          severity: 'CRITICAL',
          rule: 'USER_TOJSON_EXPOSES_PASSWORD',
          message: 'user.toJSON() exposes the password/hash field. Any JSON response or session storing user will leak credentials.'
        });
      }

      // B. Check JSON.stringify(user) immunity
      const stringified = JSON.stringify(dummyUser);
      if (stringified.includes(testSecret)) {
        score -= 40;
        findings.push({
          severity: 'CRITICAL',
          rule: 'USER_JSON_STRINGIFY_LEAKS_PASSWORD',
          message: 'JSON.stringify(user) contains password plaintext/hash! res.json(user) will leak credentials directly across API endpoints.'
        });
      }

      // C. Check toRawObject() existence for safe persistence
      if (typeof dummyUser.toRawObject !== 'function') {
        score -= 10;
        findings.push({
          severity: 'LOW',
          rule: 'EXPLICIT_DB_SERIALIZER_MISSING',
          message: 'User model does not define an explicit toRawObject() for internal database persistence.'
        });
      }
    } catch (err) {
      findings.push({
        severity: 'MEDIUM',
        rule: 'USER_MODEL_AUDIT_ERROR',
        message: `Could not instantiate User model for runtime verification: ${err.message}`
      });
    }
  }

  // ── 2. Source Code Scan for Leaked API Keys, Secrets & Private Keys ────────
  const scanDirs = ['routes', 'models', 'lib', 'controllers'];
  const sensitivePatterns = [
    { regex: /AKIA[0-9A-Z]{16}/, rule: 'AWS_ACCESS_KEY_LEAK', desc: 'Hardcoded AWS Access Key ID detected' },
    { regex: /-----BEGIN (?:RSA )?PRIVATE KEY-----/, rule: 'PRIVATE_KEY_LEAK', desc: 'Embedded private cryptographic key found in source file' },
    { regex: /(?:api_key|apikey|secret_key)\s*[:=]\s*['"][a-zA-Z0-9_\-]{20,}['"]/i, rule: 'HARDCODED_API_KEY_LEAK', desc: 'Potentially exposed hardcoded API key/secret in source' },
  ];

  for (const dirName of scanDirs) {
    const fullDir = path.join(baseDir, dirName);
    if (!fs.existsSync(fullDir)) continue;

    const files = fs.readdirSync(fullDir).filter(f => f.endsWith('.js'));
    for (const file of files) {
      const filePath = path.join(fullDir, file);
      try {
        const content = fs.readFileSync(filePath, 'utf8');

        // Check for raw user password exposure in responses: res.json(rawUser)
        if (content.includes('res.json') && (content.includes('stmts.getAllUsers') || content.includes('stmts.getUserById'))) {
          score -= 20;
          findings.push({
            severity: 'HIGH',
            rule: 'RAW_DB_USERS_IN_RES_JSON',
            message: `Possible direct serialization of raw database user row without password stripping in ${file}.`,
            file: `${dirName}/${file}`
          });
        }

        // Check for leaked API keys / secrets
        for (const p of sensitivePatterns) {
          if (p.regex.test(content)) {
            score -= 25;
            findings.push({
              severity: 'CRITICAL',
              rule: p.rule,
              message: `${p.desc} in ${dirName}/${file}.`,
              file: `${dirName}/${file}`
            });
          }
        }
      } catch (_) {}
    }
  }

  // ── 3. Live API Leak Probing (if server endpoint is responding) ────────────
  if (targetUrl) {
    try {
      // Test token generation endpoint doesn't leak password schema
      const tokenProbe = await probeHttp(`${targetUrl}/api/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'probe@test.com', password: 'probepassword' })
      });

      if (tokenProbe && tokenProbe.body) {
        if (tokenProbe.body.includes('"password"') || tokenProbe.body.includes('passwordHash')) {
          score -= 30;
          findings.push({
            severity: 'CRITICAL',
            rule: 'API_RESPONSE_LEAKS_PASSWORD_PROPERTY',
            message: 'Live /api/auth/token response contains password or passwordHash property in payload!'
          });
        }
        // Verify stack traces are not leaked in 400/500 responses
        if (tokenProbe.body.includes('node_modules') || tokenProbe.body.includes('at process.processTicksAndRejections')) {
          score -= 15;
          findings.push({
            severity: 'MEDIUM',
            rule: 'API_ERROR_STACK_TRACE_LEAK',
            message: 'API error response leaks server stack trace or internal directory paths.'
          });
        }
      }

      // Test signatures sync endpoint rejects unauthorized probe without leaking metadata
      const sigProbe = await probeHttp(`${targetUrl}/api/signatures/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test: 1 })
      });
      if (sigProbe && sigProbe.status === 200) {
        score -= 30;
        findings.push({
          severity: 'CRITICAL',
          rule: 'UNAUTHENTICATED_SENSITIVE_API_MUTATION',
          message: 'Sensitive mutation endpoint /api/signatures/sync accepted request without authentication!'
        });
      }
    } catch (_) {}
  }

  return {
    name: 'Password & API Data Leak Prevention',
    score: Math.max(0, score),
    findings
  };
}

module.exports = { checkApiPasswordLeak };
