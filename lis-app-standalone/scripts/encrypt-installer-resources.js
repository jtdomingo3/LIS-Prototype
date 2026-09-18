const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Use win-dpapi to protect the secret so a plaintext key is not shipped
let dpapi;
try { dpapi = require('win-dpapi'); } catch (e) { dpapi = null; }

const OUT_DIR = path.join(__dirname, '..', 'build', 'installer-resources');
if (!fs.existsSync(OUT_DIR)) {
  console.error('Installer resources directory not found:', OUT_DIR);
  process.exit(2);
}

function deriveKey(secret) {
  return crypto.createHash('sha256').update(String(secret)).digest();
}

function encryptBufferWithKey(buf, keyBuf) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyBuf, iv);
  const encrypted = Buffer.concat([cipher.update(buf), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { v: 1, iv: iv.toString('base64'), tag: tag.toString('base64'), data: encrypted.toString('base64') };
}

function encryptBuffer(buf, secretOrOpts) {
  // secretOrOpts may be { type: 'raw', keyBuf } or { type: 'pbkdf2', passphrase, salt, iter }
  if (secretOrOpts && secretOrOpts.type === 'raw' && secretOrOpts.keyBuf) {
    return encryptBufferWithKey(buf, secretOrOpts.keyBuf);
  }
  if (secretOrOpts && secretOrOpts.type === 'pbkdf2') {
    const iter = secretOrOpts.iter || 100000;
    const salt = secretOrOpts.salt;
    const keyBuf = crypto.pbkdf2Sync(String(secretOrOpts.passphrase), Buffer.from(salt, 'base64'), iter, 32, 'sha256');
    const wrapped = encryptBufferWithKey(buf, keyBuf);
    wrapped.kdf = 'pbkdf2';
    wrapped.iter = iter;
    wrapped.salt = salt;
    return wrapped;
  }

  // default: derive from secret string via sha256
  const key = deriveKey(String(secretOrOpts));
  return encryptBufferWithKey(buf, key);
}

async function main() {
  try {
    const providedKey = process.env.INSTALLER_KEY || null;
    const passphrase = process.env.INSTALLER_PASSPHRASE || null;

    let encryptMode = null;
    if (passphrase) {
      // use PBKDF2 with a random salt; store salt+iter inside wrapped objects so installer can derive key
      encryptMode = { type: 'pbkdf2', passphrase: passphrase, salt: crypto.randomBytes(16).toString('base64'), iter: 200000 };
      console.log('Preparing to encrypt installer resources using passphrase-derived key (PBKDF2)');
    } else if (providedKey) {
      // Treat provided INSTALLER_KEY as raw secret string (derive sha256 inside encrypt)
      encryptMode = providedKey;
      console.log('Preparing to encrypt installer resources using provided INSTALLER_KEY');
    } else if (dpapi) {
      // generate a random secret and protect with DPAPI (legacy behavior)
      const secret = crypto.randomBytes(32).toString('base64');
      const protectedBuf = dpapi.protectData(Buffer.from(secret, 'utf8'), null, 'CurrentUser');
      const dpPath = path.join(OUT_DIR, 'secret.dpapi');
      fs.writeFileSync(dpPath, protectedBuf);
      encryptMode = secret;

      // Remove any plaintext secret.key if it exists to avoid shipping it by mistake
      try {
        const plainKeyPath = path.join(OUT_DIR, 'secret.key');
        if (fs.existsSync(plainKeyPath)) {
          fs.unlinkSync(plainKeyPath);
          console.log('Removed plaintext secret.key from installer resources');
        }
      } catch (e) {
        console.warn('Failed to remove secret.key (non-fatal):', e && e.message || e);
      }
    } else {
      console.log('Notice: No DPAPI or INSTALLER_KEY configured. Keeping installer resources unencrypted (recommended for standard local installer builds).');
      return;
    }
    const targets = ['data-users.json', 'data.json'];
    for (const t of targets) {
      const p = path.join(OUT_DIR, t);
      if (!fs.existsSync(p)) continue;
      const raw = fs.readFileSync(p);
      const wrapped = encryptBuffer(raw, encryptMode);
      fs.writeFileSync(p, JSON.stringify(wrapped, null, 2), 'utf8');
      console.log('Encrypted', t);
    }

    if (dpapi) {
      console.log('Wrote secret.dpapi to', path.join(OUT_DIR, 'secret.dpapi'));
      console.log('Installer resources encrypted (DPAPI). Include installer-resources in the package.');
    } else {
      console.log('Installer resources encrypted using provided INSTALLER_KEY (no DPAPI blob written).');
      console.log('Ensure the same INSTALLER_KEY is supplied to the installer/server runtime to enable decryption.');
    }
  } catch (e) {
    console.error('Encryption failed:', e && e.message || e);
    process.exit(1);
  }
}

main();
