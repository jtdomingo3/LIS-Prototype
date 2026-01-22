const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data.json');
const backupPath = path.join(__dirname, '..', 'data.json.bak');

console.log('Loading', dbPath);
const raw = fs.readFileSync(dbPath, 'utf8');
fs.writeFileSync(backupPath, raw, 'utf8');
console.log('Backup written to', backupPath);

const db = JSON.parse(raw);
if (Array.isArray(db.tests)) {
  let changed = 0;
  for (const t of db.tests) {
    if (!t || typeof t.status !== 'string') continue;
    const s = t.status.trim();
    if (s === 'Extraction') { t.status = 'Extraction Area'; changed++; }
    if (s === 'X-Ray') { t.status = 'X-ray'; changed++; }
    if (s === 'Drugtest') { t.status = 'Drug Test'; changed++; }
  }
  if (changed) {
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
    console.log('Updated', changed, 'test status values and saved to', dbPath);
  } else {
    console.log('No test status values needed updating');
  }
} else {
  console.error('No tests array found in data.json');
}

// Optionally update patients.requiredAreas values
if (Array.isArray(db.patients)) {
  let changed = 0;
  for (const p of db.patients) {
    if (!p || !Array.isArray(p.requiredAreas)) continue;
    const ra = p.requiredAreas.map(r => {
      if (r === 'Extraction') { changed++; return 'Extraction Area'; }
      if (r === 'X-Ray') { changed++; return 'X-ray'; }
      return r;
    });
    p.requiredAreas = ra;
  }
  if (changed) {
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
    console.log('Updated', changed, 'patient requiredAreas entries and saved to', dbPath);
  }
}

console.log('Done. Please restart the server.');
