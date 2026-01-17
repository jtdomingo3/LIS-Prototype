const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

function main() {
  // Locate the directory where this exe lives (works for packaged exe)
  const exeDir = path.dirname(process.execPath);
  const serverExe = path.join(exeDir, 'laboratory-information-system.exe');
  const batFallback = path.join(exeDir, '..', 'scripts', 'start-lis.bat');

  let targetCmd = null;
  if (fs.existsSync(serverExe)) {
    targetCmd = `& '${serverExe.replace(/'/g, "''")}'`;
  } else if (fs.existsSync(batFallback)) {
    targetCmd = `& '${batFallback.replace(/'/g, "''")}'`;
  } else {
    console.error('No target exe or .bat found to launch. Looked for:', serverExe, batFallback);
    process.exit(1);
  }

  // Launch PowerShell in a new window and run the target command, keeping the window open
  const args = ['-NoExit', '-NoProfile', '-Command', targetCmd];

  try {
    const child = spawn('powershell', args, { detached: true, stdio: 'ignore' });
    child.unref();
    console.log('Launched PowerShell to start the server.');
  } catch (e) {
    console.error('Failed to launch PowerShell:', e);
    process.exit(1);
  }
}

main();
