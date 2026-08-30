const path = require('path');
const fs = require('fs');

console.log('--- Hello from test pkg script ---');
console.log('process.pkg:', !!process.pkg);
console.log('execPath:', process.execPath);

const addonPath = path.join(path.dirname(process.execPath), 'better_sqlite3.node');
console.log('Checking addonPath:', addonPath, 'exists:', fs.existsSync(addonPath));

if (fs.existsSync(addonPath)) {
  const mod = { exports: {} };
  process.dlopen(mod, addonPath);
  console.log('Loaded native addon keys:', Object.keys(mod.exports));
  
  const Database = require('better-sqlite3');
  const db = new Database(':memory:', { nativeBinding: mod.exports });
  console.log('SQLite in memory test:', db.pragma('journal_mode'));
  db.close();
}
console.log('--- End test pkg script ---');
