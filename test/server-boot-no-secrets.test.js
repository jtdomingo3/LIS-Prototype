const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

describe('Server Startup & SecretStore Zero-Config Persistence', function() {
  const tmpDir = path.join(os.tmpdir(), `lis-test-secrets-${Date.now()}-${Math.floor(Math.random() * 10000)}`);

  before(function() {
    fs.mkdirSync(tmpDir, { recursive: true });
    // Strip any ambient env secrets
    delete process.env.AUTH_TOKEN_SECRET;
    delete process.env.JWT_SECRET;
    delete process.env.SESSION_SECRET;
    delete process.env.DATA_USERS_KEY;
    delete process.env.USER_DATA_KEY;
    process.env.DATA_DIR = tmpDir;
  });

  after(function() {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  });

  it('automatically resolves and persists secrets when starting with empty environment', function() {
    const { ensureServerSecrets } = require('../lis-fullstack/lib/secretStore');
    const results = ensureServerSecrets();

    assert.ok(results.SESSION_SECRET === 'generated' || results.SESSION_SECRET === 'file', 'SESSION_SECRET was resolved');
    assert.ok(results.AUTH_TOKEN_SECRET === 'generated' || results.AUTH_TOKEN_SECRET === 'file', 'AUTH_TOKEN_SECRET was resolved');
    assert.ok(results.DATA_USERS_KEY === 'generated' || results.DATA_USERS_KEY === 'file', 'DATA_USERS_KEY was resolved');

    assert.ok(fs.existsSync(path.join(tmpDir, '.session_secret')), '.session_secret file exists');
    assert.ok(fs.existsSync(path.join(tmpDir, '.auth_token_secret')), '.auth_token_secret file exists');
    assert.ok(fs.existsSync(path.join(tmpDir, '.data_users_secret')), '.data_users_secret file exists');

    const authTokenSecret = fs.readFileSync(path.join(tmpDir, '.auth_token_secret'), 'utf8').trim();
    assert.strictEqual(authTokenSecret.length, 64, 'Generated token secret is 64 hex chars (32 bytes)');
  });

  it('issues and verifies signed Bearer tokens using lazily resolved secret', function() {
    const tokenHelper = require('../lis-fullstack/lib/tokenHelper');
    const user = { id: 'usr-001', email: 'doctor@lab.com', name: 'Dr. Test', role: 'Doctor' };

    const token = tokenHelper.generateToken(user, 1);
    assert.ok(token && typeof token === 'string' && token.includes('.'), 'Valid token string created');

    const decoded = tokenHelper.verifyToken(token);
    assert.ok(decoded, 'Token successfully verified');
    assert.strictEqual(decoded.email, 'doctor@lab.com');
    assert.strictEqual(decoded.name, 'Dr. Test');
  });

  it('encrypts and decrypts sensitive secrets with cryptoHelper', function() {
    const cryptoHelper = require('../lis-fullstack/lib/cryptoHelper');
    const secretText = 'sk-or-v1-my-secret-openrouter-key-12345';

    const encrypted = cryptoHelper.encryptSecret(secretText);
    assert.ok(encrypted && encrypted !== secretText, 'Ciphertext produced');

    const decrypted = cryptoHelper.decryptSecret(encrypted);
    assert.strictEqual(decrypted, secretText, 'Plaintext decrypted successfully');
  });

  it('decrypts ciphertext produced with legacy master secret', function() {
    const crypto = require('crypto');
    const cryptoHelper = require('../lis-fullstack/lib/cryptoHelper');
    const legacySecret = 'gezyne-lis-ai-assistant-master-secret-2026';
    const legacyKey = crypto.createHash('sha256').update(legacySecret).digest();

    const plaintext = 'sk-or-v1-legacy-key-stored-before-update';
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', legacyKey, iv);
    const encrypted = Buffer.concat([cipher.update(Buffer.from(plaintext, 'utf8')), cipher.final()]);
    const tag = cipher.getAuthTag();

    const payload = {
      v: 1,
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      data: encrypted.toString('base64')
    };
    const legacyCipherPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');

    const decrypted = cryptoHelper.decryptSecret(legacyCipherPayload);
    assert.strictEqual(decrypted, plaintext, 'Legacy ciphertext decrypted via fallback');
  });

  it('persists and reuses existing secrets across simulated server restarts', function() {
    const tokenSecretBefore = fs.readFileSync(path.join(tmpDir, '.auth_token_secret'), 'utf8').trim();
    const tokenHelper = require('../lis-fullstack/lib/tokenHelper');
    const testToken = tokenHelper.generateToken({ email: 'restart@lab.com' }, 1);

    // Simulate restart by clearing process.env
    delete process.env.AUTH_TOKEN_SECRET;
    delete process.env.SESSION_SECRET;
    delete process.env.DATA_USERS_KEY;

    const { ensureServerSecrets } = require('../lis-fullstack/lib/secretStore');
    const results = ensureServerSecrets();

    assert.strictEqual(results.AUTH_TOKEN_SECRET, 'file', 'Reused secret from file');
    const tokenSecretAfter = fs.readFileSync(path.join(tmpDir, '.auth_token_secret'), 'utf8').trim();
    assert.strictEqual(tokenSecretBefore, tokenSecretAfter, 'Secret unchanged across restart');

    const verified = tokenHelper.verifyToken(testToken);
    assert.ok(verified, 'Token generated before restart remains valid after restart');
  });
});
