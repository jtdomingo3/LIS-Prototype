#!/usr/bin/env node
// Temporary recovery script for new-gezyne data
// Usage: node scripts/recover_gezyne.js <path-to-copied-new-gezyne-folder> [--out out.json] [--rows N]

const fs = require('fs');
const path = require('path');

function usage() {
  console.log('Usage: node scripts/recover_gezyne.js <path-to-new-gezyne> [--out out.json] [--rows N]');
}

if (process.argv.length < 3) {
  usage();
  process.exit(1);
}

const sourceDir = process.argv[2];
let outFile = path.resolve(process.cwd(), 'out_gezyne_dump.json');
let maxRows = 50;

for (let i = 3; i < process.argv.length; i++) {
  if (process.argv[i] === '--out' && process.argv[i+1]) { outFile = path.resolve(process.cwd(), process.argv[i+1]); i++; }
  else if (process.argv[i] === '--rows' && process.argv[i+1]) { maxRows = parseInt(process.argv[i+1], 10); i++; }
}

function parseWorkList(filePath) {
  const txt = fs.readFileSync(filePath, 'utf8');
  const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(l => l.length>0);
  const analyteDefs = {};
  const samples = [];

  let currentSample = null;
  const headerRe = /^(\d+)\s+(\d+)\s+(\d+)$/;
  const analyteLineRe = /^([A-Z0-9_]+)\s+(NO|[0-9.]+)\s+(\d+)$/i;
  const analyteDefRe = /^([A-Z0-9_]+)\s+([0-9.]+)\s+(\d+)$/i;

  for (const line of lines) {
    const h = headerRe.exec(line);
    if (h) {
      if (currentSample) samples.push(currentSample);
      currentSample = {slot: parseInt(h[1],10), sampleNo: parseInt(h[2],10), testsCount: parseInt(h[3],10), tests: []};
      continue;
    }
    const ad = analyteDefRe.exec(line);
    if (ad && !currentSample) {
      analyteDefs[ad[1]] = {value: parseFloat(ad[2]), flag: parseInt(ad[3],10)};
      continue;
    }
    const at = analyteLineRe.exec(line);
    if (at && currentSample) {
      const code = at[1];
      const val = (at[2] === 'NO') ? null : parseFloat(at[2]);
      currentSample.tests.push({code, result: val, flag: parseInt(at[3],10)});
      continue;
    }
    // otherwise ignore non-matching lines
  }
  if (currentSample) samples.push(currentSample);

  return {analyteDefs, samples};
}

function parseNewResult(filePath) {
  const txt = fs.readFileSync(filePath, 'utf8');
  // Unknown format; return raw lines for inspection
  const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(l=>l.length>0);
  return {lines};
}

async function tryReadMdb(filePath) {
  try {
    // try to require a pure-js MDB reader if available
    const MDBReader = require('mdb-reader');
    const buf = fs.readFileSync(filePath);
    const reader = new MDBReader(buf);
    const tables = reader.getTableNames();
    const sample = {};
    for (const t of tables) {
      try {
        const table = reader.getTable(t);
        const data = table.getData({start:0, length: maxRows});
        sample[t] = data;
      } catch (e) {
        sample[t] = {error: String(e)};
      }
    }
    return {file: filePath, tables: sample};
  } catch (err) {
    return {error: 'mdb-reader not available or failed: ' + String(err)};
  }
}

(async function main(){
  const out = {sourceDir: path.resolve(sourceDir), timestamp: new Date().toISOString(), parsers: {}};

  const ws = path.join(sourceDir, 'WorkSpace');
  const db = path.join(sourceDir, 'DataBase', 'Analyser.MDB');

  if (fs.existsSync(path.join(ws, 'WorkList.dat'))) {
    try {
      out.parsers.worklist = parseWorkList(path.join(ws, 'WorkList.dat'));
    } catch (e) {
      out.parsers.worklist = {error: String(e)};
    }
  }

  if (fs.existsSync(path.join(ws, 'New_Result.txt'))) {
    try {
      out.parsers.new_result = parseNewResult(path.join(ws, 'New_Result.txt'));
    } catch (e) {
      out.parsers.new_result = {error: String(e)};
    }
  }

  if (fs.existsSync(db)) {
    out.parsers.mdb = await tryReadMdb(db);
  } else {
    // also check for MDB directly under source
    const alt = path.join(sourceDir, 'Analyser.MDB');
    if (fs.existsSync(alt)) out.parsers.mdb = await tryReadMdb(alt);
  }

  fs.writeFileSync(outFile, JSON.stringify(out, null, 2), 'utf8');
  console.log('Wrote recovery dump to', outFile);
  if (out.parsers.mdb && out.parsers.mdb.error) {
    console.log('MDB read: ', out.parsers.mdb.error);
    console.log('To enable MDB parsing, run: npm install mdb-reader');
  } else if (out.parsers.mdb) {
    const tnames = Object.keys(out.parsers.mdb.tables || {});
    console.log('Found MDB with tables:', tnames.slice(0,20).join(', '));
  }
})();
