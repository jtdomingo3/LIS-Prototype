const crypto = require('crypto');

const TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || process.env.JWT_SECRET || 'gezyne-lis-secure-token-secret-change-in-prod';
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
    const expectedSignature = crypto
      .createHmac('sha256', TOKEN_SECRET)
      .update(payloadBase64)
      .digest('base64url');

    // Constant-time comparison to prevent timing attacks
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSignature);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
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
