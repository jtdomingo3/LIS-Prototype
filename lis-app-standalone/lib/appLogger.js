const fs = require('fs');
const path = require('path');
const util = require('util');

let logFilePath = null;
let initialized = false;

function sanitize(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/—/g, '-')
    .replace(/–/g, '-')
    .replace(/📤/g, '[SEND]')
    .replace(/📥/g, '[RESP]')
    .replace(/✓/g, '[OK]')
    .replace(/⚠️/g, '[WARN]')
    .replace(/↪️/g, '->')
    .replace(/≡ƒôñ/g, '[SEND]')
    .replace(/≡ƒôÑ/g, '[RESP]')
    .replace(/Γ£ô/g, '[OK]')
    .replace(/ΓÇö/g, '-')
    .replace(/Γå¬∩╕Å/g, '->');
}

function initAppLogger(baseDataDir) {
  if (initialized) return;
  initialized = true;

  try {
    const targetDir = baseDataDir || path.join(require('os').homedir(), 'Documents', 'LIS', 'logs');
    const logsDir = path.join(targetDir, 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    logFilePath = path.join(logsDir, 'application.log');

    // Rotate if larger than 10MB
    try {
      if (fs.existsSync(logFilePath)) {
        const stats = fs.statSync(logFilePath);
        if (stats.size > 10 * 1024 * 1024) {
          const oldPath = path.join(logsDir, 'application-old.log');
          if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
          fs.renameSync(logFilePath, oldPath);
        }
      }
    } catch (_) {}

    const origLog = console.log;
    const origInfo = console.info;
    const origWarn = console.warn;
    const origError = console.error;

    function appendToFile(level, args) {
      if (!logFilePath) return;
      try {
        const timestamp = new Date().toISOString();
        const formatted = util.format(...args);
        const line = `[${timestamp}] [${level}] ${sanitize(formatted)}\n`;
        fs.appendFileSync(logFilePath, line, 'utf8');
      } catch (_) {}
    }

    console.log = function(...args) {
      const sanitizedArgs = args.map(a => typeof a === 'string' ? sanitize(a) : a);
      appendToFile('INFO', sanitizedArgs);
      return origLog.apply(console, sanitizedArgs);
    };

    console.info = function(...args) {
      const sanitizedArgs = args.map(a => typeof a === 'string' ? sanitize(a) : a);
      appendToFile('INFO', sanitizedArgs);
      return origInfo.apply(console, sanitizedArgs);
    };

    console.warn = function(...args) {
      const sanitizedArgs = args.map(a => typeof a === 'string' ? sanitize(a) : a);
      appendToFile('WARN', sanitizedArgs);
      return origWarn.apply(console, sanitizedArgs);
    };

    console.error = function(...args) {
      const sanitizedArgs = args.map(a => typeof a === 'string' ? sanitize(a) : a);
      appendToFile('ERROR', sanitizedArgs);
      return origError.apply(console, sanitizedArgs);
    };

    console.log('[Logger] Application file logging initialized -> ' + logFilePath);
  } catch (e) {
    console.error('[Logger] Failed initializing file logger:', e && e.message);
  }
}

function getLogPath() {
  if (!logFilePath) {
    const targetDir = path.join(require('os').homedir(), 'Documents', 'LIS', 'logs');
    return path.join(targetDir, 'application.log');
  }
  return logFilePath;
}

function getRecentLogs(maxLines = 150) {
  const p = getLogPath();
  try {
    if (!fs.existsSync(p)) return 'No logs recorded yet.';
    const content = fs.readFileSync(p, 'utf8');
    const lines = content.split('\n');
    return lines.slice(-maxLines).join('\n');
  } catch (e) {
    return 'Error reading log file: ' + e.message;
  }
}

function clearLogFile() {
  const p = getLogPath();
  try {
    if (fs.existsSync(p)) {
      fs.writeFileSync(p, '', 'utf8');
    }
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = {
  initAppLogger,
  getLogPath,
  getRecentLogs,
  clearLogFile,
  sanitize
};
