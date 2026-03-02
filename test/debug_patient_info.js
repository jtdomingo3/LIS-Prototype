const MDBReader = require('mdb-reader');
const fs = require('fs');
const path = require('path');

const mdbPath = '\\\\192.168.31.86\\new-gezyne\\DataBase\\Analyser.MDB';

console.log('Reading MDB:', mdbPath);
const buffer = fs.readFileSync(mdbPath);
const reader = new MDBReader(buffer);

const tables = reader.getTableNames();
console.log('\nAll tables:', tables);

// Find all patient-related tables
const patientTables = tables.filter(t => /patient/i.test(t));
console.log('\nPatient tables:', patientTables);

// Check a recent patient table (Jan 2026)
const table202601 = 'PATIENTINFO202601';
if (tables.includes(table202601)) {
  console.log(`\n=== ${table202601} ===`);
  const tbl = reader.getTable(table202601);
  const rows = tbl.getData({ start: 0, length: 5 });
  console.log('Column names:', tbl.getColumnNames());
  console.log('\nFirst 5 rows:');
  rows.forEach((r, idx) => {
    console.log(`\nRow ${idx + 1}:`);
    console.log('  ID:', r.ID);
    console.log('  FIRST_NAME:', r.FIRST_NAME);
    console.log('  SEX:', r.SEX);
    console.log('  AGE:', r.AGE);
    console.log('  COLLECT_DATE:', r.COLLECT_DATE);
  });
}

// Check corresponding CHECK_RESULT table
const checkTable = 'CHECK_RESULT202601';
if (tables.includes(checkTable)) {
  console.log(`\n=== ${checkTable} ===`);
  const tbl = reader.getTable(checkTable);
  const rows = tbl.getData({ start: 0, length: 10 });
  console.log('Column names:', tbl.getColumnNames());
  console.log('\nFirst 10 rows:');
  rows.forEach((r, idx) => {
    console.log(`\nRow ${idx + 1}:`);
    console.log('  ID:', r.ID);
    console.log('  ITEM:', r.ITEM);
    console.log('  RESULT:', r.RESULT);
    console.log('  SAMPLE_NO:', r.SAMPLE_NO);
  });
  
  // Find rows for sample 14 (from the screenshot)
  console.log('\n=== Rows for SAMPLE_NO = 14 ===');
  const sample14 = rows.filter(r => r.SAMPLE_NO === 14);
  sample14.forEach(r => {
    console.log(`  ID: ${r.ID}, ITEM: ${r.ITEM}, RESULT: ${r.RESULT}`);
  });
}

// Look for FELICIA, ROMEO in all patient tables
console.log('\n=== Searching for FELICIA, ROMEO ===');
for (const tblName of patientTables) {
  try {
    const tbl = reader.getTable(tblName);
    const rows = tbl.getData({ start: 0, length: 500 });
    const felicia = rows.filter(r => 
      r.FIRST_NAME && r.FIRST_NAME.toString().toUpperCase().includes('FELICIA')
    );
    if (felicia.length > 0) {
      console.log(`\nFound in ${tblName}:`);
      felicia.forEach(r => {
        console.log('  ID:', r.ID);
        console.log('  FIRST_NAME:', r.FIRST_NAME);
        console.log('  SEX:', r.SEX);
        console.log('  AGE:', r.AGE);
        console.log('  COLLECT_DATE:', r.COLLECT_DATE);
      });
    }
  } catch (e) {
    console.log(`  Error reading ${tblName}:`, e.message);
  }
}
