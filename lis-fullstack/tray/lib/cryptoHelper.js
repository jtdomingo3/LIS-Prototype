const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

/**
 * AES-256-GCM symmetric encryption / decryption helper.
 * Used to protect sensitive secrets (e.g. OpenRouter API keys) at rest.
 */

const LEGACY_MASTER_SECRET = 'gezyne-lis-ai-assistant-master-secret-2026';

function getOrCreateSecret(envNames, secretFilename, legacyFallback) {
  for (const name of envNames) {
    if (process.env[name] && String(process.env[name]).trim()) {
      return String(process.env[name]).trim();
    }
  }

  try {
    let dataDir = process.env.DATA_DIR;
    if (!dataDir) {
      try {
        const dp = require('./dataPath');
        dataDir = typeof dp.getDataDir === 'function' ? dp.getDataDir() : null;
      } catch (_) {}
    }
    if (!dataDir) dataDir = path.join(__dirname, '..');
    const secretPath = path.join(dataDir, secretFilename);
    if (fs.existsSync(secretPath)) {
      const existing = fs.readFileSync(secretPath, 'utf8').trim();
      if (existing && existing.length >= 32) return existing;
    }
    const generated = crypto.randomBytes(32).toString('hex');
    try {
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(secretPath, generated, { encoding: 'utf8', mode: 0o600 });
    } catch (_) {}
    return generated;
  } catch (_) {
    return legacyFallback;
  }
}

// Derive a 32-byte key from any secret string using SHA-256
function deriveMasterKey(secret) {
  const masterSecret = secret || getOrCreateSecret(
    ['DATA_USERS_KEY', 'USER_DATA_KEY', 'SESSION_SECRET'],
    '.data_users_secret',
    LEGACY_MASTER_SECRET
  );
  return crypto.createHash('sha256').update(String(masterSecret)).digest();
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * @param {string} plaintext 
 * @param {string} [secret] 
 * @returns {string} base64 encoded JSON containing { v: 1, iv, tag, data }
 */
function encryptSecret(plaintext, secret) {
  if (!plaintext) return '';
  const key = deriveMasterKey(secret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(Buffer.from(String(plaintext), 'utf8')), cipher.final()]);
  const tag = cipher.getAuthTag();

  const payload = {
    v: 1,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64')
  };

  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

/**
 * Decrypts an encrypted token/string produced by encryptSecret.
 * @param {string} cipherPayload base64url or JSON payload
 * @param {string} [secret] 
 * @returns {string|null} Plaintext string or null if failed
 */
function decryptSecret(cipherPayload, secret) {
  if (!cipherPayload) return null;
  try {
    let parsed;
    if (typeof cipherPayload === 'object' && cipherPayload.data) {
      parsed = cipherPayload;
    } else {
      let raw = String(cipherPayload).trim();
      // If base64url encoded
      if (!raw.startsWith('{')) {
        raw = Buffer.from(raw, 'base64url').toString('utf8');
      }
      parsed = JSON.parse(raw);
    }

    if (!parsed || !parsed.data || !parsed.iv || !parsed.tag) {
      return null;
    }

    const iv = Buffer.from(parsed.iv, 'base64');
    const tag = Buffer.from(parsed.tag, 'base64');
    const encrypted = Buffer.from(parsed.data, 'base64');

    // Attempt decryption with current master key
    try {
      const key = deriveMasterKey(secret);
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      return decrypted.toString('utf8');
    } catch (primaryErr) {
      // If primary decryption fails and no specific secret was passed, try legacy fallback key
      if (!secret) {
        try {
          const legacyKey = crypto.createHash('sha256').update(String(LEGACY_MASTER_SECRET)).digest();
          const legacyDecipher = crypto.createDecipheriv('aes-256-gcm', legacyKey, iv);
          legacyDecipher.setAuthTag(tag);
          const decrypted = Buffer.concat([legacyDecipher.update(encrypted), legacyDecipher.final()]);
          return decrypted.toString('utf8');
        } catch (_) {}
      }
      throw primaryErr;
    }
  } catch (err) {
    console.error('[cryptoHelper] Decryption failed:', err && err.message);
    return null;
  }
}

module.exports = {
  deriveMasterKey,
  encryptSecret,
  decryptSecret
};
