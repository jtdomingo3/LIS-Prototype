const path = require('path');
const { Service } = require('node-windows');

const action = process.argv[2]; // 'install' | 'uninstall'

// Determine the script or executable to run as the service
// If packaged with `pkg` the entry point will be an .exe in the same folder
function serviceScriptPath() {
  // If running under pkg, process.execPath is the exe
  if (process.pkg) return process.execPath;
  // Otherwise point to server.js in project root
  return path.join(__dirname, '..', 'server.js');
}

const svc = new Service({
  name: 'GezyneLIS',
  description: 'Gezyne LIS Fullstack Server',
  script: serviceScriptPath(),
  // allow the service to inherit env vars from the installer if desired
  env: [
    { name: 'NODE_ENV', value: 'production' }
  ]
});

svc.on('install', () => {
  console.log('Service installed. Starting...');
  svc.start();
});

svc.on('alreadyinstalled', () => console.log('Service already installed.'));
svc.on('start', () => console.log('Service started.'));
svc.on('stop', () => console.log('Service stopped.'));
svc.on('uninstall', () => console.log('Service uninstalled.'));
svc.on('error', (err) => console.error('Service error:', err));

if (action === 'install') svc.install();
else if (action === 'uninstall') svc.uninstall();
else console.log('Usage: node register-service.js install|uninstall');
