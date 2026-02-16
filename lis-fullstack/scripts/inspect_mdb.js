#!/usr/bin/env node
// Inspect specified tables from an Access MDB using mdb-reader
// Usage: node scripts/inspect_mdb.js <path-to-new-gezyne> [PATIENT_DATABASE,CHECK_RESULT] [--rows N] [--out file.json]

const fs = require('fs');
const path = require('path');

if (process.argv.length < 3) {
  console.log('Usage: node scripts/inspect_mdb.js <path-to-new-gezyne> [table1,table2] [--rows N] [--out file.json]');
  process.exit(1);
}

const sourceDir = process.argv[2];
let tablesArg = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : 'PATIENT_DATABASE,CHECK_RESULT';
let rows = 20;
let outFile = null;

for (let i = 3; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--rows' && process.argv[i+1]) { rows = parseInt(process.argv[i+1],10); i++; }
  else if (a === '--out' && process.argv[i+1]) { outFile = path.resolve(process.cwd(), process.argv[i+1]); i++; }
}

const tables = tablesArg.split(',').map(s => s.trim()).filter(Boolean);
const mdbPath = path.join(sourceDir, 'DataBase', 'Analyser.MDB');

async function loadMDB(file) {
  try {
    let MDBReader;
    try {
      const mod = require('mdb-reader');
      MDBReader = mod && mod.default ? mod.default : mod;
    } catch (e) {
      const mod = await import('mdb-reader');
      MDBReader = mod && mod.default ? mod.default : mod;
    }
    const buf = fs.readFileSync(file);
    return new MDBReader(buf);
  } catch (err) {
    throw new Error('Failed to load mdb-reader or read file: ' + String(err));
  }
}

(async function main(){
  if (!fs.existsSync(mdbPath)) {
    console.error('Could not find', mdbPath);
    process.exit(2);
  }

  try {
    const reader = await loadMDB(mdbPath);
    const available = reader.getTableNames();
    const result = {mdb: mdbPath, availableTables: available, preview: {}};

    for (const t of tables) {
      if (!available.includes(t)) {
        result.preview[t] = {error: 'Table not found'};
        continue;
      }
      try {
        const table = reader.getTable(t);
        const data = table.getData({start:0, length: rows});
        result.preview[t] = {rows: data.length, data};
      } catch (e) {
        result.preview[t] = {error: String(e)};
      }
    }

    const out = JSON.stringify(result, null, 2);
    if (outFile) fs.writeFileSync(outFile, out, 'utf8');
    console.log(out);
  } catch (err) {
    console.error('Error:', String(err));
    process.exit(3);
  }
})();
