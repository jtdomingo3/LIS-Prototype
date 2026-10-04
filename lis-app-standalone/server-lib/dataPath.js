const path = require('path');
const fs = require('fs');
const os = require('os');

let _cachedDataDir = null;

function getDataDir() {
  if (_cachedDataDir) return _cachedDataDir;

  if (process.env.DATA_DIR && process.env.DATA_DIR.length) {
    const dir = process.env.DATA_DIR;
    console.log('[dataPath] DATA_DIR override detected:', dir);
    try {
      const execDir = path.dirname(process.execPath);
      const oldFile = path.join(execDir, 'data.json');
      const newFile = path.join(dir, 'data.json');
      if (process.pkg && fs.existsSync(oldFile) && !fs.existsSync(newFile)) {
        fs.mkdirSync(dir, { recursive: true });
        fs.copyFileSync(oldFile, newFile);
        console.log('[dataPath] copied existing data from', oldFile, 'to', newFile);
      }
    } catch (err) {
      console.error('[dataPath] migration from execDir failed:', err);
    }
    try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { /* ignore */ }
    _cachedDataDir = dir;
    return _cachedDataDir;
  }

  if (__dirname.includes('app.asar')) {
    const standaloneDir = path.join(os.homedir(), 'Documents', 'LIS', 'app-sync');
    try { fs.mkdirSync(standaloneDir, { recursive: true }); } catch (_) {}
    console.log('[dataPath] Electron packaged mode, using', standaloneDir);
    _cachedDataDir = standaloneDir;
    return _cachedDataDir;
  }

  if (process.pkg) {
    const programDataBase = process.env.PROGRAMDATA || path.join('C:', 'ProgramData');
    const pdDir = path.join(programDataBase, 'GezyneLIS');
    try { fs.mkdirSync(pdDir, { recursive: true }); } catch (e) {}

    const userDir = path.join(os.homedir(), 'GezyneLIS');
    const userData = path.join(userDir, 'data.json');
    const userUsers = path.join(userDir, 'data-users.json');
    const pdData = path.join(pdDir, 'data.json');
    const pdUsers = path.join(pdDir, 'data-users.json');
    try {
      if (fs.existsSync(userData) && !fs.existsSync(pdData)) {
        fs.mkdirSync(pdDir, { recursive: true });
        fs.copyFileSync(userData, pdData);
      }
      if (fs.existsSync(userUsers) && !fs.existsSync(pdUsers)) {
        fs.mkdirSync(pdDir, { recursive: true });
        fs.copyFileSync(userUsers, pdUsers);
      }
    } catch (err) {}

    try {
      const execDir = path.dirname(process.execPath);
      const resDir = path.join(execDir, 'installer-resources');
      const seedData = path.join(resDir, 'data.json');
      const seedUsers = path.join(resDir, 'data-users.json');
      const seedDb = path.join(resDir, 'lis-data.db');
      const pdDb = path.join(pdDir, 'lis-data.db');

      if (fs.existsSync(seedDb) && !fs.existsSync(pdDb)) fs.copyFileSync(seedDb, pdDb);
      if (fs.existsSync(seedData) && !fs.existsSync(pdData) && !fs.existsSync(pdDb)) fs.copyFileSync(seedData, pdData);
      if (fs.existsSync(seedUsers) && !fs.existsSync(pdUsers) && !fs.existsSync(pdDb)) fs.copyFileSync(seedUsers, pdUsers);
    } catch (err) {}

    try {
      const testFile = path.join(pdDir, `.test_${process.pid}`);
      fs.writeFileSync(testFile, ''); fs.unlinkSync(testFile);
      _cachedDataDir = pdDir;
      return _cachedDataDir;
    } catch (e) {
      try { fs.mkdirSync(userDir, { recursive: true }); } catch (e2) {}
      _cachedDataDir = userDir;
      return _cachedDataDir;
    }
  }

  const devDir = path.join(__dirname, '..');
  _cachedDataDir = devDir;
  return _cachedDataDir;
}

function dataFile(filename) {
  return path.join(getDataDir(), filename);
}

module.exports = { getDataDir, dataFile };
