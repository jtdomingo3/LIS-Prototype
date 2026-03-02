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
function getDataDir() {
  // start by honoring an explicit override; this is useful for testing and
  // for environments where the directory should be controlled by the caller.
  if (process.env.DATA_DIR && process.env.DATA_DIR.length) {
    const dir = process.env.DATA_DIR;
    console.log('[dataPath] DATA_DIR override detected:', dir);
    // if there is an older data.json sitting in the executable directory,
    // and the new directory doesn't have one yet, copy it across so we
    // don't lose existing data when migrating to a per-user path.
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
    return dir;
  }

  if (process.pkg) {
    // when packaged, prefer ProgramData
    const programDataBase = process.env.PROGRAMDATA || path.join('C:', 'ProgramData');
    const pdDir = path.join(programDataBase, 'GezyneLIS');

    // always ensure the programdata directory exists before doing anything
    try { fs.mkdirSync(pdDir, { recursive: true }); } catch (e) {
      console.error('[dataPath] unable to create ProgramData directory', pdDir, e);
    }

    // if there is a previous dataset in the user directory, prefer that
    // unless we have already written to ProgramData. this covers a scenario
    // where the server initially ran into a permissions problem and wrote to
    // the home directory, then later started again with ProgramData
    // available; we don't want to lose the original data.
    const userDir = path.join(os.homedir(), 'GezyneLIS');
    const userData = path.join(userDir, 'data.json');
    const userUsers = path.join(userDir, 'data-users.json');
    const pdData = path.join(pdDir, 'data.json');
    const pdUsers = path.join(pdDir, 'data-users.json');
    try {
      if (fs.existsSync(userData) && !fs.existsSync(pdData)) {
        fs.mkdirSync(pdDir, { recursive: true });
        fs.copyFileSync(userData, pdData);
        console.log('[dataPath] migrated data.json from userDir to ProgramData');
      }
      if (fs.existsSync(userUsers) && !fs.existsSync(pdUsers)) {
        fs.mkdirSync(pdDir, { recursive: true });
        fs.copyFileSync(userUsers, pdUsers);
        console.log('[dataPath] migrated data-users.json from userDir to ProgramData');
      }
    } catch (err) {
      console.error('[dataPath] migration from userDir failed:', err);
    }

    // also copy installer-resources or exe seed files if needed
    try {
      const execDir = path.dirname(process.execPath);
      const candidates = [
        path.join(execDir, 'installer-resources', 'data.json'),
        path.join(execDir, 'data.json')
      ];
      for (const oldFile of candidates) {
        if (fs.existsSync(oldFile) && !fs.existsSync(pdData)) {
          fs.copyFileSync(oldFile, pdData);
          console.log('[dataPath] seeded programdata from', oldFile);
          break;
        }
      }
    } catch (err) {
      console.error('[dataPath] seed migration failed:', err);
    }

    // ensure pdDir is writable
    try {
      const testFile = path.join(pdDir, `.test_${process.pid}`);
      fs.writeFileSync(testFile, ''); fs.unlinkSync(testFile);
      console.log('[dataPath] using ProgramData directory', pdDir);
      return pdDir;
    } catch (e) {
      console.warn('[dataPath] ProgramData not writable, falling back to userDir', e);
      try { fs.mkdirSync(userDir, { recursive: true }); } catch (e2) { /* ignore */ }
      try {
        if (fs.existsSync(pdData) && !fs.existsSync(userData)) {
          fs.copyFileSync(pdData, userData);
        }
        const pdUsers = path.join(pdDir, 'data-users.json');
        const userUsers = path.join(userDir, 'data-users.json');
        if (fs.existsSync(pdUsers) && !fs.existsSync(userUsers)) {
          fs.copyFileSync(pdUsers, userUsers);
        }
      } catch (e3) { console.error('[dataPath] failed to copy from pd to userDir', e3); }
      console.log('[dataPath] using user directory', userDir);
      return userDir;
    }
  }

  // development mode: files live in project root (../ relative to this file)
  const devDir = path.join(__dirname, '..');
  console.log('[dataPath] development mode, using', devDir);
  return devDir;
}

function dataFile(filename) {
  return path.join(getDataDir(), filename);
}

module.exports = { getDataDir, dataFile };
