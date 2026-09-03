const crypto = require('crypto');

/**
 * AES-256-GCM symmetric encryption / decryption helper.
 * Used to protect sensitive secrets (e.g. OpenRouter API keys) at rest.
 */

// Derive a 32-byte key from any secret string using SHA-256
function deriveMasterKey(secret) {
  const masterSecret = secret || process.env.DATA_USERS_KEY || process.env.USER_DATA_KEY || process.env.SESSION_SECRET || 'gezyne-lis-ai-assistant-master-secret-2026';
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

    const key = deriveMasterKey(secret);
    const iv = Buffer.from(parsed.iv, 'base64');
    const tag = Buffer.from(parsed.tag, 'base64');
    const encrypted = Buffer.from(parsed.data, 'base64');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

    return decrypted.toString('utf8');
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
