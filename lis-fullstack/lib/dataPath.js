const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * Determine the directory where writable data files (`data.json`,
 * `data-users.json`, etc.) should live.
 *
 * * When running from source during development the files sit in the project
 *   root (one level above this library directory).
 * * When running from a pkg-packaged executable (`process.pkg` is defined)
 *   the executable is a read-only snapshot; we store our data next to the
 *   running binary instead (the same directory the exe lives in).
 * * An explicit override may be provided via the DATA_DIR environment variable
 *   which allows the installer or user to point the server at a custom
 *   location.
 */
let _cachedDataDir = null;

function getDataDir() {
  if (_cachedDataDir) return _cachedDataDir;

  // Helper: auto-migrate files from legacy directories (ProgramData, userDir, execDir)
  function migrateLegacyFiles(targetDir) {
    try {
      const programDataBase = process.env.PROGRAMDATA || path.join('C:', 'ProgramData');
      const pdDir = path.join(programDataBase, 'GezyneLIS');
      const userDir = path.join(os.homedir(), 'GezyneLIS');
      let execDir = null;
      try { execDir = path.dirname(process.execPath); } catch (_) {}

      const filesToMigrate = ['lis-data.db', 'lis-data.db-wal', 'lis-data.db-shm', 'data.json', 'data-users.json', '.env'];
      const candidateDirs = [pdDir, userDir];
      if (execDir && execDir !== targetDir) {
        candidateDirs.push(execDir);
      }

      for (const legacyDir of candidateDirs) {
        if (!fs.existsSync(legacyDir) || path.resolve(legacyDir) === path.resolve(targetDir)) continue;
        for (const file of filesToMigrate) {
          const srcFile = path.join(legacyDir, file);
          const dstFile = path.join(targetDir, file);
          if (fs.existsSync(srcFile) && !fs.existsSync(dstFile)) {
            try {
              fs.mkdirSync(targetDir, { recursive: true });
              fs.copyFileSync(srcFile, dstFile);
              console.log(`[dataPath] migrated ${file} from ${legacyDir} to ${targetDir}`);
            } catch (copyErr) {
              console.error(`[dataPath] error migrating ${file} from ${legacyDir}:`, copyErr);
            }
          }
        }
      }
    } catch (err) {
      console.error('[dataPath] legacy file migration error:', err);
    }
  }

  // Helper: seed initial installer resources if needed
  function seedInstallerResources(targetDir) {
    try {
      const execDir = path.dirname(process.execPath);
      const resDir = path.join(execDir, 'installer-resources');
      if (!fs.existsSync(resDir)) return;

      const seedDb = path.join(resDir, 'lis-data.db');
      const targetDb = path.join(targetDir, 'lis-data.db');
      const seedEnv = path.join(resDir, '.env');
      const targetEnv = path.join(targetDir, '.env');
      const seedData = path.join(resDir, 'data.json');
      const targetData = path.join(targetDir, 'data.json');
      const seedUsers = path.join(resDir, 'data-users.json');
      const targetUsers = path.join(targetDir, 'data-users.json');

      if (fs.existsSync(seedDb) && !fs.existsSync(targetDb)) {
        fs.copyFileSync(seedDb, targetDb);
        console.log('[dataPath] seeded clean lis-data.db from installer-resources');
      }
      if (fs.existsSync(seedEnv) && !fs.existsSync(targetEnv)) {
        fs.copyFileSync(seedEnv, targetEnv);
        console.log('[dataPath] seeded .env from installer-resources');
      }
      if (fs.existsSync(seedData) && !fs.existsSync(targetData) && !fs.existsSync(targetDb)) {
        fs.copyFileSync(seedData, targetData);
        console.log('[dataPath] seeded clean data.json from installer-resources');
      }
      if (fs.existsSync(seedUsers) && !fs.existsSync(targetUsers) && !fs.existsSync(targetDb)) {
        fs.copyFileSync(seedUsers, targetUsers);
        console.log('[dataPath] seeded default admin data-users.json from installer-resources');
      }
    } catch (err) {
      console.error('[dataPath] seed resource initialization failed:', err);
    }
  }

  // start by honoring an explicit override; this is useful for testing and
  // for environments where the directory should be controlled by the caller.
  if (process.env.DATA_DIR && process.env.DATA_DIR.length) {
    const dir = process.env.DATA_DIR;
    console.log('[dataPath] DATA_DIR override detected:', dir);
    try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { /* ignore */ }
    migrateLegacyFiles(dir);
    seedInstallerResources(dir);
    _cachedDataDir = dir;
    return _cachedDataDir;
  }

  if (process.pkg) {
    // When packaged, prefer ~/Documents/LIS/data (always writable without admin privileges)
    const documentsLisDir = path.join(os.homedir(), 'Documents', 'LIS', 'data');
    const programDataBase = process.env.PROGRAMDATA || path.join('C:', 'ProgramData');
    const pdDir = path.join(programDataBase, 'GezyneLIS');
    const userDir = path.join(os.homedir(), 'GezyneLIS');

    // Ensure documentsLisDir exists before doing anything
    try { fs.mkdirSync(documentsLisDir, { recursive: true }); } catch (e) {
      console.error('[dataPath] unable to create Documents LIS data directory', documentsLisDir, e);
    }

    // Auto-migrate from older locations (ProgramData, userDir, execDir)
    migrateLegacyFiles(documentsLisDir);

    // Seed initial installer resources if needed
    seedInstallerResources(documentsLisDir);

    // Ensure documentsLisDir is writable
    try {
      const testFile = path.join(documentsLisDir, `.test_${process.pid}`);
      fs.writeFileSync(testFile, ''); fs.unlinkSync(testFile);
      console.log('[dataPath] using Documents LIS data directory', documentsLisDir);
      _cachedDataDir = documentsLisDir;
      return _cachedDataDir;
    } catch (e) {
      console.warn('[dataPath] Documents LIS data directory not writable, falling back to userDir', e);
      try { fs.mkdirSync(userDir, { recursive: true }); } catch (e2) { /* ignore */ }
      try {
        const testFile = path.join(userDir, `.test_${process.pid}`);
        fs.writeFileSync(testFile, ''); fs.unlinkSync(testFile);
        console.log('[dataPath] using user directory', userDir);
        _cachedDataDir = userDir;
        return _cachedDataDir;
      } catch (e3) {
        console.warn('[dataPath] user directory not writable, falling back to ProgramData', e3);
        try { fs.mkdirSync(pdDir, { recursive: true }); } catch (e4) { /* ignore */ }
        console.log('[dataPath] using ProgramData directory', pdDir);
        _cachedDataDir = pdDir;
        return _cachedDataDir;
      }
    }
  }

  // development mode: files live in project root (../ relative to this file)
  const devDir = path.join(__dirname, '..');
  console.log('[dataPath] development mode, using', devDir);
  _cachedDataDir = devDir;
  return _cachedDataDir;
}

function dataFile(filename) {
  return path.join(getDataDir(), filename);
}

module.exports = { getDataDir, dataFile };
