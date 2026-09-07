const fs = require('fs');
const path = require('path');

function logReportError(err, context) {
  try {
    // store logs alongside data files so that packaged executables don't try to
    // write inside the snapshot (which triggers "Cannot mkdir in a snapshot").
    const { getDataDir } = require('./dataPath');
    const logsDir = path.join(getDataDir(), 'logs');
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    const file = path.join(logsDir, 'report-errors.log');
    const timestamp = new Date().toISOString();
    const message = `[${timestamp}] [${context || 'general'}] ${err && err.stack ? err.stack : String(err)}\n\n`;
    fs.appendFile(file, message, (e) => {
      if (e) console.error('Failed to write report error log:', e);
    });
  } catch (e) {
    console.error('logReportError failed:', e);
  }
}

module.exports = { logReportError };
