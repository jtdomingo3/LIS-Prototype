/**
 * ============================================================================
 * GEZYNE LIS - AUTOMATED BACKUP RETENTION & DISK HYGIENE SERVICE (STANDALONE)
 * ============================================================================
 * 
 * Protects clinical workstations and clients from ENOSPC (disk full) crashes
 * by automatically pruning expired backups, stale temp files, and old logs.
 * 
 * Safety Rules:
 * 1. Minimum Floor: Never prunes if total backups <= minKeep (default: 10).
 * 2. Monthly Milestones: Preserves the first backup of each month indefinitely.
 * 3. Rolling Expiry: Backups older than 60 days (2 months) are safely purged.
 * 4. Stale File Purge: Cleans up orphaned *.tmp and 0-byte *.corrupt files.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_MAX_BACKUP_AGE_DAYS = 60; // 2 months
const MIN_BACKUP_RETENTION_COUNT = 10;   // Always keep at least 10 backups
const MAX_LOG_AGE_DAYS = 30;             // Keep rotated logs for 30 days
const TMP_FILE_MAX_AGE_HOURS = 24;       // Orphaned temp files older than 24 hours

function getHomedir() {
  return os.homedir ? os.homedir() : process.env.USERPROFILE || '';
}

function getDefaultBackupDir() {
  return path.join(getHomedir(), 'Documents', 'LIS', 'backup');
}

function getDefaultDataDir() {
  if (process.env.DATA_DIR && process.env.DATA_DIR.length) {
    return process.env.DATA_DIR;
  }
  return path.join(getHomedir(), 'Documents', 'LIS', 'data');
}

/**
 * Prune backups older than maxAgeDays while maintaining minimum count floor
 */
function cleanOldBackups(opts = {}) {
  const backupDir = opts.backupDir || getDefaultBackupDir();
  const maxAgeDays = opts.maxAgeDays || DEFAULT_MAX_BACKUP_AGE_DAYS;
  const minKeep = typeof opts.minKeep === 'number' ? opts.minKeep : MIN_BACKUP_RETENTION_COUNT;
  const keepMonthly = opts.keepMonthly !== false;

  if (!fs.existsSync(backupDir)) return { pruned: 0, bytesFreed: 0 };

  let pruned = 0;
  let bytesFreed = 0;
  const now = Date.now();
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

  try {
    const allFiles = fs.readdirSync(backupDir).map(file => {
      const fullPath = path.join(backupDir, file);
      try {
        const stat = fs.statSync(fullPath);
        return {
          file,
          fullPath,
          size: stat.size,
          mtime: stat.mtimeMs,
          isDir: stat.isDirectory()
        };
      } catch (_) {
        return null;
      }
    }).filter(f => f && !f.isDir);

    // Group database backups
    const dbBackups = allFiles
      .filter(f => (f.file.startsWith('backup_db_') && f.file.endsWith('.db')) || (f.file.startsWith('lis-backup-') && f.file.endsWith('.db')))
      .sort((a, b) => b.mtime - a.mtime);

    // Group JSON backups
    const jsonBackups = allFiles
      .filter(f => (f.file.startsWith('backup_') && f.file.endsWith('.json')) || (f.file.startsWith('data_') && f.file.endsWith('.json')))
      .sort((a, b) => b.mtime - a.mtime);

    function pruneList(list) {
      if (list.length <= minKeep) return; // Respect safety floor

      const preservedMonthlyMonths = new Set();
      // Tag monthly milestones from newest to oldest
      if (keepMonthly) {
        for (const item of list) {
          const d = new Date(item.mtime);
          const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          if (!preservedMonthlyMonths.has(monthKey)) {
            item.isMonthlyMilestone = true;
            preservedMonthlyMonths.add(monthKey);
          }
        }
      }

      // Can only delete from index minKeep onward
      for (let i = minKeep; i < list.length; i++) {
        const item = list[i];
        if (item.isMonthlyMilestone) continue; // Keep monthly audit milestones

        const ageMs = now - item.mtime;
        if (ageMs > maxAgeMs) {
          try {
            fs.unlinkSync(item.fullPath);
            pruned++;
            bytesFreed += item.size;
            console.log(`[diskCleaner] Pruned expired backup: ${item.file} (${(item.size / 1024 / 1024).toFixed(2)} MB)`);
          } catch (e) {
            console.warn(`[diskCleaner] Could not delete ${item.file}:`, e.message);
          }
        }
      }
    }

    pruneList(dbBackups);
    pruneList(jsonBackups);

  } catch (err) {
    console.warn('[diskCleaner] cleanOldBackups warning:', err.message);
  }

  return { pruned, bytesFreed };
}

/**
 * Remove orphaned .tmp files and 0-byte .corrupt files
 */
function cleanStaleFiles(opts = {}) {
  const dataDir = opts.dataDir || getDefaultDataDir();
  if (!fs.existsSync(dataDir)) return { cleaned: 0, bytesFreed: 0 };

  let cleaned = 0;
  let bytesFreed = 0;
  const now = Date.now();
  const maxTmpAgeMs = TMP_FILE_MAX_AGE_HOURS * 60 * 60 * 1000;

  try {
    const files = fs.readdirSync(dataDir);
    for (const file of files) {
      const fullPath = path.join(dataDir, file);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) continue;

        // Clean orphaned .tmp files older than 24 hours
        if (file.endsWith('.tmp') && (now - stat.mtimeMs > maxTmpAgeMs)) {
          fs.unlinkSync(fullPath);
          cleaned++;
          bytesFreed += stat.size;
          console.log(`[diskCleaner] Cleaned orphaned temp file: ${file}`);
        }

        // Clean 0-byte corrupt quarantine files older than 24 hours
        if (file.includes('.corrupt.') && stat.size === 0 && (now - stat.mtimeMs > maxTmpAgeMs)) {
          fs.unlinkSync(fullPath);
          cleaned++;
          console.log(`[diskCleaner] Cleaned 0-byte corrupt file: ${file}`);
        }
      } catch (_) {}
    }
  } catch (err) {
    console.warn('[diskCleaner] cleanStaleFiles warning:', err.message);
  }

  return { cleaned, bytesFreed };
}

/**
 * Clean old rotated logs in Documents/LIS/logs and data/logs
 */
function cleanOldLogs(opts = {}) {
  const home = getHomedir();
  const logDirs = [
    path.join(home, 'Documents', 'LIS', 'logs'),
    path.join(getDefaultDataDir(), 'logs')
  ];

  let cleaned = 0;
  let bytesFreed = 0;
  const now = Date.now();
  const maxLogAgeMs = MAX_LOG_AGE_DAYS * 24 * 60 * 60 * 1000;

  for (const dir of logDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        // Only target rotated/timestamped logs (never active application.log)
        if (file === 'application.log' || file === 'server.log') continue;
        if (!file.endsWith('.log')) continue;

        const fullPath = path.join(dir, file);
        try {
          const stat = fs.statSync(fullPath);
          if (now - stat.mtimeMs > maxLogAgeMs) {
            fs.unlinkSync(fullPath);
            cleaned++;
            bytesFreed += stat.size;
            console.log(`[diskCleaner] Cleaned old rotated log: ${file}`);
          }
        } catch (_) {}
      }
    } catch (_) {}
  }

  return { cleaned, bytesFreed };
}

/**
 * Master hygiene runner called on server start and after backups
 */
function runDiskHygiene(opts = {}) {
  try {
    const backupRes = cleanOldBackups(opts);
    const staleRes = cleanStaleFiles(opts);
    const logRes = cleanOldLogs(opts);

    const totalFreed = backupRes.bytesFreed + staleRes.bytesFreed + logRes.bytesFreed;
    if (totalFreed > 0) {
      console.log(`[diskCleaner] Disk hygiene complete: ${(totalFreed / 1024 / 1024).toFixed(2)} MB freed.`);
    }
    return {
      backupsPruned: backupRes.pruned,
      staleCleaned: staleRes.cleaned,
      logsCleaned: logRes.cleaned,
      totalBytesFreed: totalFreed
    };
  } catch (e) {
    console.warn('[diskCleaner] runDiskHygiene warning:', e.message);
    return { error: e.message };
  }
}

module.exports = {
  cleanOldBackups,
  cleanStaleFiles,
  cleanOldLogs,
  runDiskHygiene,
  DEFAULT_MAX_BACKUP_AGE_DAYS,
  MIN_BACKUP_RETENTION_COUNT
};

