const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

/**
 * secretStore.js — Centralized secret resolution & persistence.
 *
 * Guarantees that essential application secrets (SESSION_SECRET, AUTH_TOKEN_SECRET,
 * DATA_USERS_KEY) exist across restarts even in packaged / production deployments
 * without requiring manual .env configuration.
 */

function resolveDataDir() {
  if (process.env.DATA_DIR && String(process.env.DATA_DIR).trim()) {
    return String(process.env.DATA_DIR).trim();
  }
  try {
    const dp = require('./dataPath');
    if (dp && typeof dp.getDataDir === 'function') {
      const d = dp.getDataDir();
      if (d) return d;
    }
  } catch (_) {}
  return path.join(__dirname, '..');
}

/**
 * Resolves a secret using the following precedence:
 * 1. Environment variables (in order of priority)
 * 2. Persisted secret file in DATA_DIR (e.g. .auth_token_secret)
 * 3. Freshly generated 32-byte (64-char hex) cryptographically secure secret,
 *    persisted to DATA_DIR with mode 0o600.
 */
function resolveSecret({ envNames = [], fileName, allowEphemeral = true, defaultValue = null }) {
  // 1. Check environment variables
  for (const name of envNames) {
    const val = process.env[name];
    if (val && String(val).trim()) {
      const clean = String(val).trim();
      return { secret: clean, source: 'env' };
    }
  }

  // 2. Check persisted file in DATA_DIR
  const dataDir = resolveDataDir();
  const secretPath = path.join(dataDir, fileName);
  try {
    if (fs.existsSync(secretPath)) {
      const existing = fs.readFileSync(secretPath, 'utf8').trim();
      if (existing && existing.length >= 32) {
        if (envNames[0] && !process.env[envNames[0]]) {
          process.env[envNames[0]] = existing;
        }
        return { secret: existing, source: 'file' };
      }
    }
  } catch (readErr) {
    console.warn(`[secretStore] Unable to read existing secret file ${secretPath}:`, readErr.message);
  }

  // 3. Generate new secret & persist
  const generated = crypto.randomBytes(32).toString('hex');
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(secretPath, generated, { encoding: 'utf8', mode: 0o600 });
    if (envNames[0] && !process.env[envNames[0]]) {
      process.env[envNames[0]] = generated;
    }
    return { secret: generated, source: 'generated' };
  } catch (writeErr) {
    console.warn(`[secretStore] Failed to persist secret file ${secretPath}:`, writeErr.message);
    if (allowEphemeral) {
      if (envNames[0] && !process.env[envNames[0]]) {
        process.env[envNames[0]] = generated;
      }
      return { secret: generated, source: 'ephemeral' };
    }
    if (defaultValue) {
      return { secret: defaultValue, source: 'default' };
    }
    throw new Error(
      `Failed to initialize required secret (${envNames.join('/')}) at ${secretPath}: ${writeErr.message}. ` +
      `Ensure the directory is writable or specify ${envNames[0]} as an environment variable.`
    );
  }
}

function ensureServerSecrets() {
  const results = {};

  const sessionRes = resolveSecret({
    envNames: ['SESSION_SECRET'],
    fileName: '.session_secret',
    allowEphemeral: true
  });
  process.env.SESSION_SECRET = sessionRes.secret;
  results.SESSION_SECRET = sessionRes.source;

  const tokenRes = resolveSecret({
    envNames: ['AUTH_TOKEN_SECRET', 'JWT_SECRET'],
    fileName: '.auth_token_secret',
    allowEphemeral: true
  });
  process.env.AUTH_TOKEN_SECRET = tokenRes.secret;
  results.AUTH_TOKEN_SECRET = tokenRes.source;

  const dataKeyRes = resolveSecret({
    envNames: ['DATA_USERS_KEY', 'USER_DATA_KEY'],
    fileName: '.data_users_secret',
    allowEphemeral: false
  });
  process.env.DATA_USERS_KEY = dataKeyRes.secret;
  results.DATA_USERS_KEY = dataKeyRes.source;

  console.log('[secretStore] Server secrets initialized:', {
    SESSION_SECRET: results.SESSION_SECRET,
    AUTH_TOKEN_SECRET: results.AUTH_TOKEN_SECRET,
    DATA_USERS_KEY: results.DATA_USERS_KEY
  });

  return results;
}

function getSecret(name) {
  if (process.env[name] && String(process.env[name]).trim()) {
    return String(process.env[name]).trim();
  }
  if (name === 'AUTH_TOKEN_SECRET' || name === 'JWT_SECRET') {
    const res = resolveSecret({
      envNames: ['AUTH_TOKEN_SECRET', 'JWT_SECRET'],
      fileName: '.auth_token_secret',
      allowEphemeral: true
    });
    return res.secret;
  }
  if (name === 'SESSION_SECRET') {
    const res = resolveSecret({
      envNames: ['SESSION_SECRET'],
      fileName: '.session_secret',
      allowEphemeral: true
    });
    return res.secret;
  }
  if (name === 'DATA_USERS_KEY' || name === 'USER_DATA_KEY') {
    const res = resolveSecret({
      envNames: ['DATA_USERS_KEY', 'USER_DATA_KEY'],
      fileName: '.data_users_secret',
      allowEphemeral: false
    });
    return res.secret;
  }
  return null;
}

module.exports = {
  resolveSecret,
  ensureServerSecrets,
  getSecret
};
