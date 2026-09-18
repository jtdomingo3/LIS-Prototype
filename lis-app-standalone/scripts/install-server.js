const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

async function main() {
  const args = require('minimist')(process.argv.slice(2), {
    string: ['dest', 'restore-data', 'restore-users'],
    boolean: ['install-service'],
    alias: { d: 'dest', r: 'restore-data', u: 'restore-users', s: 'install-service' }
  });

  const cwd = path.resolve(__dirname, '..');
  const source = cwd;
  const dest = path.resolve(args.dest || path.join(process.env.ProgramFiles || 'C:\\Program Files', 'GezyneLIS'));

  console.log('Installing server from', source, 'to', dest);

  // Create dest folder
  fs.mkdirSync(dest, { recursive: true });

  // Copy files (node 16.7+ supports fs.cpSync). Exclude node_modules and .git
  function copyRecursive(src, dst) {
    // Do not copy installer plaintext key if present
    const ignore = ['node_modules', '.git', 'secret.key'];
    const entries = fs.readdirSync(src, { withFileTypes: true });
    entries.forEach((ent) => {
      const srcPath = path.join(src, ent.name);
      const dstPath = path.join(dst, ent.name);
      if (ignore.includes(ent.name)) return;
      if (ent.isDirectory()) {
        fs.mkdirSync(dstPath, { recursive: true });
        copyRecursive(srcPath, dstPath);
      } else if (ent.isFile()) {
        fs.copyFileSync(srcPath, dstPath);
      }
    });
  }

  copyRecursive(source, dest);

  // Remove any plaintext secret.key from destination installer-resources if present
  try {
    const destInstallerResources = path.join(dest, 'installer-resources');
    const destPlainKey = path.join(destInstallerResources, 'secret.key');
    if (fs.existsSync(destPlainKey)) {
      fs.unlinkSync(destPlainKey);
      console.log('Removed plaintext secret.key from installation destination');
    }
  } catch (e) {
    console.warn('Failed to remove secret.key at destination (non-fatal):', e && e.message || e);
  }

  // Ensure data files exist and are minimal (do not populate sample patient/test/template data)
  const dataFile = path.join(dest, 'data.json');
  const usersFile = path.join(dest, 'data-users.json');

  if (!fs.existsSync(dataFile)) {
    const initialData = {
      users: [],
      patients: [],
      tests: [],
      templates: []
    };
    fs.writeFileSync(dataFile, JSON.stringify(initialData, null, 2), 'utf8');
    console.log('Created empty data.json');
  } else {
    console.log('data.json already exists at destination; leaving intact');
  }

  if (!fs.existsSync(usersFile)) {
    fs.writeFileSync(usersFile, JSON.stringify([], null, 2), 'utf8');
    console.log('Created empty data-users.json');
  } else {
    console.log('data-users.json already exists at destination; leaving intact');
  }

  // If installer provided encrypted installer-resources, try to restore them and set DATA_USERS_KEY
  try {
    const installerResources = path.join(dest, 'installer-resources');
    const secretDpPath = path.join(installerResources, 'secret.dpapi');
    if (fs.existsSync(installerResources) && fs.existsSync(secretDpPath)) {
      try {
        // use win-dpapi to unprotect secret
        let dpapi;
        try { dpapi = require('win-dpapi'); } catch (e) { dpapi = null; }
        if (!dpapi) {
          console.warn('win-dpapi not available; cannot unprotect secret.dpapi');
        } else {
          const protectedBuf = fs.readFileSync(secretDpPath);
          let secret = null;
          try {
            secret = dpapi.unprotectData(protectedBuf, null, 'CurrentUser').toString('utf8');
          } catch (e) {
            console.warn('DPAPI unprotect failed:', e && e.message || e);
          }

            if (secret) {
              // attempt to decrypt files data.json and data-users.json if present
              const encUsers = path.join(installerResources, 'data-users.json');
              const encData = path.join(installerResources, 'data.json');

              function tryDecryptFileWithKeyBuf(src, destFile, keyBuf) {
                try {
                  if (!fs.existsSync(src)) return false;
                  const raw = fs.readFileSync(src, 'utf8');
                  let parsed = null;
                  try { parsed = JSON.parse(raw); } catch (e) { return false; }
                  if (!parsed || !parsed.data) return false; // not encrypted
                  const iv = Buffer.from(parsed.iv, 'base64');
                  const tag = Buffer.from(parsed.tag, 'base64');
                  const encrypted = Buffer.from(parsed.data, 'base64');
                  const decipher = require('crypto').createDecipheriv('aes-256-gcm', keyBuf, iv);
                  decipher.setAuthTag(tag);
                  const dec = Buffer.concat([decipher.update(encrypted), decipher.final()]);
                  const parsedDec = JSON.parse(dec.toString('utf8'));
                  // backup existing file
                  if (fs.existsSync(destFile)) {
                    const bkdir = path.join(os.homedir(), 'Documents', 'LIS', 'installer-backups');
                    fs.mkdirSync(bkdir, { recursive: true });
                    const ts = new Date().toISOString().replace(/[:.]/g, '-');
                    const bk = path.join(bkdir, path.basename(destFile) + '-' + ts + '.bak');
                    fs.copyFileSync(destFile, bk);
                  }
                  fs.writeFileSync(destFile, JSON.stringify(parsedDec, null, 2), 'utf8');
                  console.log('Restored', destFile, 'from encrypted installer resource', src);
                  return true;
                } catch (e) {
                  console.warn('Failed to decrypt/restore', src, e && e.message || e);
                  return false;
                }
              }

              // Try several decryption strategies depending on how the resources were encrypted
              const cryptoLib = require('crypto');

              // Strategy A: secret is plaintext secret (from DPAPI unprotect), derive sha256 key
              try {
                const keyBuf = cryptoLib.createHash('sha256').update(String(secret)).digest();
                tryDecryptFileWithKeyBuf(encData, dataFile, keyBuf);
                tryDecryptFileWithKeyBuf(encUsers, usersFile, keyBuf);
              } catch (e) {
                // ignore
              }

              // Strategy B: installer may supply a passphrase in installer-resources/passphrase.txt or env INSTALLER_PASSPHRASE
              let suppliedPass = process.env.INSTALLER_PASSPHRASE || null;
              const passFile = path.join(installerResources, 'passphrase.txt');
              if (!suppliedPass && fs.existsSync(passFile)) {
                try { suppliedPass = fs.readFileSync(passFile, 'utf8').trim(); } catch (e) { suppliedPass = null; }
              }

              if (suppliedPass) {
                // attempt to parse the wrapped file to get salt/iter
                try {
                  const raw = fs.readFileSync(encUsers, 'utf8');
                  const parsed = JSON.parse(raw);
                  if (parsed && parsed.kdf === 'pbkdf2' && parsed.salt && parsed.iter) {
                    const salt = Buffer.from(parsed.salt, 'base64');
                    const iter = parsed.iter || 200000;
                    const keyBuf = cryptoLib.pbkdf2Sync(String(suppliedPass), salt, iter, 32, 'sha256');
                    tryDecryptFileWithKeyBuf(encData, dataFile, keyBuf);
                    tryDecryptFileWithKeyBuf(encUsers, usersFile, keyBuf);
                  }
                } catch (e) {
                  // ignore
                }
              }

              // Note: do NOT persist secret plaintext to .env when using DPAPI — keep it protected.
              // If the server needs the key at runtime, it should unprotect the DPAPI blob itself.
            }
        }
      } catch (e) {
        console.warn('Installer resources restore failed:', e && e.message || e);
      }
    }
  } catch (e) { console.warn('Installer-restore step error:', e && e.message || e); }

  // If restore files provided, validate and restore
  if (args['restore-data']) {
    const srcRestore = path.resolve(args['restore-data']);
    if (!fs.existsSync(srcRestore)) {
      console.error('Restore data file not found:', srcRestore);
    } else {
      try {
        const raw = fs.readFileSync(srcRestore, 'utf8');
        const parsed = JSON.parse(raw);
        // Backup current
        const backupDir = path.join(os.homedir(), 'Documents', 'LIS', 'installer-backups');
        fs.mkdirSync(backupDir, { recursive: true });
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const bk = path.join(backupDir, `data-backup-${ts}.json`);
        fs.copyFileSync(dataFile, bk);
        fs.writeFileSync(dataFile, JSON.stringify(parsed, null, 2), 'utf8');
        console.log('Restored data.json from', srcRestore, 'backup saved to', bk);
      } catch (e) {
        console.error('Failed to restore data:', e);
      }
    }
  }

  if (args['restore-users']) {
    const srcRestore = path.resolve(args['restore-users']);
    if (!fs.existsSync(srcRestore)) {
      console.error('Restore users file not found:', srcRestore);
    } else {
      try {
        const raw = fs.readFileSync(srcRestore, 'utf8');
        const parsed = JSON.parse(raw);
        // Backup current
        const backupDir = path.join(os.homedir(), 'Documents', 'LIS', 'installer-backups');
        fs.mkdirSync(backupDir, { recursive: true });
        const ts = new Date().toISOString().replace(/[:.]/g, '-');
        const bk = path.join(backupDir, `users-backup-${ts}.json`);
        if (fs.existsSync(usersFile)) fs.copyFileSync(usersFile, bk);
        fs.writeFileSync(usersFile, JSON.stringify(parsed, null, 2), 'utf8');
        console.log('Restored data-users.json from', srcRestore, 'backup saved to', bk);
      } catch (e) {
        console.error('Failed to restore users:', e);
      }
    }
  }

  // Optionally register service
  if (args['install-service']) {
    try {
      const regScript = path.join(dest, 'scripts', 'register-service.js');
      if (fs.existsSync(regScript)) {
        console.log('Attempting to register Windows service...');
        execSync(`node "${regScript}" install`, { stdio: 'inherit', cwd: dest });
      } else {
        console.warn('register-service.js not found in destination; skipping service registration');
      }
    } catch (e) {
      console.error('Service registration failed:', e && e.message ? e.message : e);
    }
  }

  console.log('Installation complete. To start the server:');
  console.log(`  cd "${dest}"`);
  console.log('  npm install --production');
  console.log('  node server.js');
  console.log('Or use the tray app in the project to control the server and restore users via Settings -> Manual Backup/Restore');
}

main().catch(e => { console.error(e); process.exit(1); });
