const mod = require('./lis-fullstack/node_modules/mdb-reader');
const MDBReader = mod && mod.default ? mod.default : mod;
const fs = require('fs');

const mdbPath = '\\\\192.168.31.86\\new-gezyne\\DataBase\\Analyser.MDB';
const buffer = fs.readFileSync(mdbPath);
const reader = new MDBReader(buffer);

// Get PATIENTINFO202601 table
const patTable = reader.getTable('PATIENTINFO202601');
const patients = patTable.getData({ start: 0, length: 2000 });

// Find patient with ID 202601230014
const target = patients.find(p => p.ID && p.ID.toString() === '202601230014');
console.log('\n=== Patient ID 202601230014 ===');
if (target) {
  console.log('FOUND!');
  console.log('Name:', target.FIRST_NAME);
  console.log('Age:', target.AGE);
  console.log('Sex:', target.SEX);
  console.log('ID:', target.ID);
  console.log('Collection Date:', target.COLLECT_DATE);
} else {
  console.log('NOT FOUND in first 2000 rows');
  console.log('Total rows:', patients.length);
  console.log('Sample IDs:', patients.slice(0, 10).map(p => p.ID));
}

// Get CHECK_RESULT202601 table
const checkTable = reader.getTable('CHECK_RESULT202601');
const results = checkTable.getData({ start: 0, length: 10000 });

// Find results for this patient
const patientResults = results.filter(r => r.ID && r.ID.toString() === '202601230014');
console.log('\n=== Test Results for 202601230014 ===');
console.log('Found', patientResults.length, 'results');
patientResults.forEach(r => {
  console.log(`  ${r.ITEM}: ${r.RESULT} ${r.UNIT}`);
});
