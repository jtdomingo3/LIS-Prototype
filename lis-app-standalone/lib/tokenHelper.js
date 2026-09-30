const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const LEGACY_TOKEN_SECRET = 'gezyne-lis-secure-token-secret-change-in-prod';

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

const TOKEN_SECRET = getOrCreateSecret(['AUTH_TOKEN_SECRET', 'JWT_SECRET'], '.auth_token_secret', LEGACY_TOKEN_SECRET);
const DEFAULT_EXPIRY_DAYS = 30; // Long-lived token suitable for clinical workstations & offline sync

/**
 * Generate a cryptographically signed Bearer token for a user.
 * @param {Object} user User object containing at least id, email, role, and permissions.
 * @param {number} [expiresInDays=30] Token validity in days.
 * @returns {string} Encoded token in format: base64(payload).signature
 */
function generateToken(user, expiresInDays = DEFAULT_EXPIRY_DAYS) {
  if (!user || !user.email) {
    throw new Error('User object with email is required to generate a token');
  }

  const payload = {
    id: user.id || user._id || user.email,
    email: String(user.email).toLowerCase(),
    name: user.name || user.email,
    role: user.role || 'User',
    permissions: user.permissions || {},
    licenseNumber: user.licenseNumber || null,
    signature: user.signature || null,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (expiresInDays * 24 * 60 * 60)
  };

  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(payloadBase64)
    .digest('base64url');

  return `${payloadBase64}.${signature}`;
}

/**
 * Verify and decode a Bearer token.
 * @param {string} token Encoded token string.
 * @returns {Object|null} Decoded user payload if valid, or null if invalid/expired.
 */
function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;

  const parts = token.trim().split('.');
  if (parts.length !== 2) return null;

  const [payloadBase64, signature] = parts;

  try {
    let expectedSignature = crypto
      .createHmac('sha256', TOKEN_SECRET)
      .update(payloadBase64)
      .digest('base64url');

    // Constant-time comparison to prevent timing attacks
    let sigBuf = Buffer.from(signature);
    let expBuf = Buffer.from(expectedSignature);
    let valid = (sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf));

    // Fallback: support existing tokens issued with legacy default secret
    if (!valid && TOKEN_SECRET !== LEGACY_TOKEN_SECRET) {
      expectedSignature = crypto
        .createHmac('sha256', LEGACY_TOKEN_SECRET)
        .update(payloadBase64)
        .digest('base64url');
      expBuf = Buffer.from(expectedSignature);
      valid = (sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf));
    }

    if (!valid) {
      return null;
    }

    const payloadJson = Buffer.from(payloadBase64, 'base64url').toString('utf8');
    const payload = JSON.parse(payloadJson);

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      return null;
    }

    return payload;
  } catch (e) {
    return null;
  }
}

/**
 * Extract Bearer token from Express request (Authorization header or query param).
 * @param {Object} req Express request object.
 * @returns {string|null}
 */
function extractBearerToken(req) {
  if (!req) return null;

  const authHeader = req.headers ? (req.headers['authorization'] || req.headers['Authorization']) : null;
  if (authHeader && typeof authHeader === 'string') {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match && match[1]) {
      return match[1].trim();
    }
  }

  // Also check query param ?token= for media/download requests
  if (req.query && req.query.token) {
    return String(req.query.token).trim();
  }

  return null;
}

module.exports = {
  generateToken,
  verifyToken,
  extractBearerToken,
  TOKEN_SECRET
};
