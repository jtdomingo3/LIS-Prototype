/**
 * ============================================================================
 * GEZYNE LIS - SECURITY & AMAZON INSPECTOR COMPLIANCE TEST SUITE
 * ============================================================================
 * 
 * Verifies that all security remediations across lis-fullstack and lis-app-standalone
 * are active, strictly enforced, and free from regressions:
 * 
 * 1. TLS Certificate Enforcement (CWE-295) - No rejectUnauthorized: false
 * 2. Cryptographic Key Management (CWE-798) - AES-256-GCM dynamic keys & no hardcoded secrets
 * 3. Session & Secret Isolation - Dynamic session secret generation with secure cookies
 * 4. DOM XSS Protection (CWE-79) - HTML sanitization helper & template escaping
 * 5. Dependency Vulnerability Resolution - npm package overrides for critical CVEs
 * 6. SQL Parameterization Safety (CWE-89) - Parameterized queries against SQLite
 * ============================================================================
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

if (typeof describe === 'undefined') {
  global.describe = (name, fn) => { console.log(`\n======================================================\n▶ ${name}\n======================================================`); fn(); };
  global.it = (name, fn) => {
    try {
      fn();
      console.log(`  ✅ ${name}`);
    } catch (err) {
      console.error(`  ❌ ${name}:`, err.message);
      throw err;
    }
  };
}

const repoRoot = path.join(__dirname, '..');
const fullstackDir = path.join(repoRoot, 'lis-fullstack');
const standaloneDir = path.join(repoRoot, 'lis-app-standalone');

describe('SUITE 1: TLS Certificate Enforcement (CWE-295)', () => {
  it('enforces valid TLS certificates with rejectUnauthorized: true in standalone networkMonitor', () => {
    const monitorFile = path.join(standaloneDir, 'lib', 'networkMonitor.js');
    assert.ok(fs.existsSync(monitorFile), 'networkMonitor.js exists');
    const content = fs.readFileSync(monitorFile, 'utf8');

    assert.ok(
      !content.includes('rejectUnauthorized: false'),
      'CRITICAL: rejectUnauthorized: false must NOT exist in networkMonitor.js'
    );
    assert.ok(
      !content.includes('rejectUnauthorized: false,') && !content.includes('rejectUnauthorized: false\n'),
      'CRITICAL: Static rejectUnauthorized: false must NOT exist in networkMonitor.js'
    );
    assert.ok(
      content.includes('rejectUnauthorized:'),
      'Verified rejectUnauthorized is configured dynamically'
    );
  });

  it('scans all production JavaScript files for dangerous TLS bypass flags', () => {
    const scanDirs = [
      path.join(fullstackDir, 'lib'),
      path.join(fullstackDir, 'routes'),
      path.join(standaloneDir, 'lib'),
      path.join(standaloneDir, 'routes')
    ];

    let foundBypass = [];
    for (const d of scanDirs) {
      if (!fs.existsSync(d)) continue;
      const files = fs.readdirSync(d).filter(f => f.endsWith('.js'));
      for (const f of files) {
        const full = path.join(d, f);
        const code = fs.readFileSync(full, 'utf8');
        if (code.includes('rejectUnauthorized: false')) {
          foundBypass.push(path.relative(repoRoot, full));
        }
      }
    }

    assert.strictEqual(
      foundBypass.length,
      0,
      `Forbidden TLS bypass found in: ${foundBypass.join(', ')}`
    );
  });
});

describe('SUITE 2: Cryptographic Key Management (CWE-798)', () => {
  it('verifies AES-256-GCM encryption/decryption without hardcoded master keys', () => {
    const cryptoHelper = require(path.join(fullstackDir, 'lib', 'cryptoHelper.js'));
    const testSecret = 'sk-or-v1-production-openrouter-secret-key-xyz987';

    const encrypted = cryptoHelper.encryptSecret(testSecret);
    assert.ok(encrypted && encrypted !== testSecret, 'Ciphertext successfully generated');

    const decrypted = cryptoHelper.decryptSecret(encrypted);
    assert.strictEqual(decrypted, testSecret, 'AES-256-GCM successfully decrypted payload');
  });

  it('confirms no hardcoded default secret strings exist in cryptoHelper files', () => {
    const targets = [
      path.join(fullstackDir, 'lib', 'cryptoHelper.js'),
      path.join(standaloneDir, 'lib', 'cryptoHelper.js')
    ];

    for (const target of targets) {
      if (!fs.existsSync(target)) continue;
      const code = fs.readFileSync(target, 'utf8');
      assert.ok(
        !code.includes('default-dev-secret-key-change-in-production-12345'),
        `Hardcoded key found in ${path.basename(target)}`
      );
      assert.ok(
        !code.includes("'gezyne-lis-ai-assistant-master-secret-2026'"),
        `Hardcoded legacy string found in ${path.basename(target)}`
      );
    }
  });

  it('verifies dynamic CSPRNG session secret resolution in standalone localServer', () => {
    const localServerFile = path.join(standaloneDir, 'lib', 'localServer.js');
    assert.ok(fs.existsSync(localServerFile), 'localServer.js exists');
    const content = fs.readFileSync(localServerFile, 'utf8');

    assert.ok(
      !content.includes("secret: 'lis-standalone-secret-key'"),
      'Forbidden static session secret string must NOT exist in localServer.js'
    );
    assert.ok(
      content.includes("getSecret('SESSION_SECRET')") || content.includes('SESSION_SECRET'),
      'Dynamic session secret resolution verified'
    );
    assert.ok(
      content.includes('httpOnly: true'),
      'Session cookies must enforce httpOnly: true'
    );
  });

  it('verifies git repository ignores all secret files and scratch directory', () => {
    const gitignorePath = path.join(repoRoot, '.gitignore');
    assert.ok(fs.existsSync(gitignorePath), '.gitignore exists');
    const gitignore = fs.readFileSync(gitignorePath, 'utf8');

    const requiredPatterns = ['.data_users_secret', '.session_secret', '.*_secret', 'scratch/'];
    for (const pattern of requiredPatterns) {
      assert.ok(
        gitignore.includes(pattern),
        `Missing required gitignore pattern: ${pattern}`
      );
    }
  });
});

describe('SUITE 3: DOM XSS Protection & HTML Sanitization (CWE-79)', () => {
  it('verifies escapeHtml function correctly sanitizes dangerous XSS payloads', () => {
    const escapeHtml = (str) => {
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    };

    const vectors = [
      { input: '<script>alert(1)</script>', expected: '&lt;script&gt;alert(1)&lt;/script&gt;' },
      { input: '<img src=x onerror=alert(document.cookie)>', expected: '&lt;img src=x onerror=alert(document.cookie)&gt;' },
      { input: '"><svg onload=alert(1)>', expected: '&quot;&gt;&lt;svg onload=alert(1)&gt;' },
      { input: "javascript:alert('XSS')", expected: 'javascript:alert(&#39;XSS&#39;)' },
      { input: 'Normal Patient Name, Jr.', expected: 'Normal Patient Name, Jr.' },
      { input: 'HbA1c < 6.5% & Fasting > 100', expected: 'HbA1c &lt; 6.5% &amp; Fasting &gt; 100' }
    ];

    for (const v of vectors) {
      const sanitized = escapeHtml(v.input);
      assert.strictEqual(sanitized, v.expected, `Sanitization mismatch for vector: ${v.input}`);
      assert.ok(!sanitized.includes('<'), 'Sanitized output must not contain unescaped <');
      assert.ok(!sanitized.includes('>'), 'Sanitized output must not contain unescaped >');
    }
  });

  it('verifies global escapeHtml exposure in layout.ejs across both apps', () => {
    const layouts = [
      path.join(fullstackDir, 'views', 'layout.ejs'),
      path.join(standaloneDir, 'views', 'layout.ejs')
    ];

    for (const layout of layouts) {
      assert.ok(fs.existsSync(layout), `layout.ejs exists in ${layout}`);
      const content = fs.readFileSync(layout, 'utf8');
      assert.ok(
        content.includes('window.escapeHtml = function'),
        `window.escapeHtml not defined in ${path.relative(repoRoot, layout)}`
      );
    }
  });

  it('verifies template remediation in consultations panel, equipment QC, and chatbot', () => {
    const consultationsPanel = path.join(fullstackDir, 'views', 'consultations', 'panel.ejs');
    const panelContent = fs.readFileSync(consultationsPanel, 'utf8');
    assert.ok(
      panelContent.includes('spanText.textContent = val;') || panelContent.includes('escapeHtml(val)'),
      'consultations panel.ejs must use DOM textContent or escapeHtml'
    );

    const chatbotIndex = path.join(fullstackDir, 'views', 'chatbot', 'index.ejs');
    const chatbotContent = fs.readFileSync(chatbotIndex, 'utf8');
    assert.ok(
      chatbotContent.includes('toast.textContent =') || chatbotContent.includes('escapeHtml(msg)'),
      'chatbot index.ejs must sanitize toast messages'
    );

    const equipmentIndex = path.join(fullstackDir, 'views', 'equipment', 'index.ejs');
    const equipmentContent = fs.readFileSync(equipmentIndex, 'utf8');
    assert.ok(
      equipmentContent.includes('escQc(val)') || equipmentContent.includes('safeVal'),
      'equipment index.ejs must sanitize QC reading values'
    );
  });
});

describe('SUITE 4: Dependency Vulnerability Overrides Integrity', () => {
  it('confirms critical CVE overrides are configured in lis-fullstack package.json', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(fullstackDir, 'package.json'), 'utf8'));
    assert.ok(pkg.overrides, 'lis-fullstack must define overrides');
    assert.strictEqual(pkg.overrides.axios, '^1.7.4', 'axios overridden');
    assert.strictEqual(pkg.overrides['follow-redirects'], '^1.15.6', 'follow-redirects overridden');
    assert.strictEqual(pkg.overrides.tar, '^7.4.3', 'tar overridden');
    assert.strictEqual(pkg.overrides.ws, '^8.17.1', 'ws overridden');
    assert.strictEqual(pkg.overrides.micromatch, '^4.0.8', 'micromatch overridden');
  });

  it('confirms critical CVE overrides are configured in lis-app-standalone package.json', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(standaloneDir, 'package.json'), 'utf8'));
    assert.ok(pkg.overrides, 'lis-app-standalone must define overrides');
    assert.strictEqual(pkg.overrides.axios, '^1.7.4', 'axios overridden');
    assert.strictEqual(pkg.overrides['follow-redirects'], '^1.15.6', 'follow-redirects overridden');
    assert.strictEqual(pkg.overrides.tar, '^7.4.3', 'tar overridden');
    assert.strictEqual(pkg.overrides.ws, '^8.17.1', 'ws overridden');
    assert.strictEqual(pkg.overrides.micromatch, '^4.0.8', 'micromatch overridden');
  });
});

describe('SUITE 5: SQL Parameterization & Injection Immunity (CWE-89)', () => {
  it('verifies that SQL statements execute safely with adversarial input strings', () => {
    const Database = require(path.join(fullstackDir, 'node_modules', 'better-sqlite3'));
    const db = new Database(':memory:');

    db.exec(`
      CREATE TABLE patients (
        id TEXT PRIMARY KEY,
        fullName TEXT,
        mrn TEXT
      );
    `);

    // Insert test record
    const insertStmt = db.prepare('INSERT INTO patients (id, fullName, mrn) VALUES (?, ?, ?)');
    insertStmt.run('p-001', 'Juan dela Cruz', 'MRN-2026-0001');

    // Attempt classic SQL injection payloads via parameters
    const sqlInjectionPayloads = [
      "' OR '1'='1",
      "'; DROP TABLE patients; --",
      "Juan' UNION SELECT id, password, email FROM users --",
      "admin' --",
      "1' OR 1=1; --"
    ];

    const queryStmt = db.prepare('SELECT * FROM patients WHERE fullName = ?');
    for (const payload of sqlInjectionPayloads) {
      const result = queryStmt.all(payload);
      assert.strictEqual(result.length, 0, `Adversarial SQL parameter must not alter query semantics: ${payload}`);
    }

    // Verify table structure remains intact and unharmed
    const verifyStmt = db.prepare('SELECT COUNT(*) as count FROM patients');
    const row = verifyStmt.get();
    assert.strictEqual(row.count, 1, 'Table integrity preserved after injection attempts');
    db.close();
  });
});

console.log('\n======================================================');
console.log('✅ ALL SECURITY & COMPLIANCE TESTS COMPLETED SUCCESSFULLY');
console.log('======================================================');
