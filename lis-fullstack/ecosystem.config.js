const fs = require('fs');
const path = require('path');
const os = require('os');

// Determine where the server entrypoint lives for pm2.
// - Dev: `server.js` at project root
// - Packaged: server may be a node script under `server/` or a bundled EXE under `server/`.
let serverCwd = __dirname;
let script = 'server.js';
let interpreter;

// prefer node script in repo root
if (!fs.existsSync(path.join(serverCwd, 'server.js')) && fs.existsSync(path.join(serverCwd, 'server', 'server.js'))) {
  serverCwd = path.join(serverCwd, 'server');
}

// detect packaged exe (installer places binaries under resources/server)
const exeCandidates = [
  path.join(__dirname, 'server', 'laboratory-information-system.exe'),
  path.join(__dirname, 'server', 'start-lis.exe'),
  path.join(__dirname, 'server', 'GezyneLIS.exe')
];
const exe = exeCandidates.find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
if (exe) {
  script = exe;
  serverCwd = path.dirname(exe);
  // tell pm2 to execute the binary directly
  interpreter = 'none';
}

// Choose a writable log directory: prefer PM2_HOME logs, else per-user AppData.
const pm2HomeLogs = (process.env.PM2_HOME && path.join(process.env.PM2_HOME, 'logs')) || path.join(os.homedir(), '.pm2', 'logs');
const perUserLogs = (process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Gezyne LIS Server', 'logs')) || path.join(os.homedir(), 'AppData', 'Local', 'Gezyne LIS Server', 'logs');
const logsDir = fs.existsSync(pm2HomeLogs) ? pm2HomeLogs : perUserLogs;
try { fs.mkdirSync(logsDir, { recursive: true }); } catch (e) { /* ignore */ }

const appDef = {
  name: 'lis-app',
  script: script,
  cwd: serverCwd,
  env: {
    NODE_ENV: 'production',
    PORT: 3000
  },
  watch: false,
  error_file: path.join(logsDir, 'pm2-error.log'),
  out_file: path.join(logsDir, 'pm2-out.log'),
  log_date_format: 'YYYY-MM-DD HH:mm:ss'
};

if (interpreter) appDef.interpreter = interpreter;

module.exports = { apps: [ appDef ] };
