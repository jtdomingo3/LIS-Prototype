const path = require('path');
const { initDb } = require('../lis-fullstack/lib/sqliteDb');
const DATA_DIR = require('../lis-fullstack/lib/dataPath').getDataDir();

async function check() {
  const dbPath = path.join(DATA_DIR, 'lis-data.db');
  console.log('Database Path:', dbPath);
  const db = await initDb(dbPath);
  const allEq = db.getEquipment();
  console.log(`Total Equipment: ${allEq.length}`);
  
  for (const eq of allEq) {
    const ctrls = db.getQcControls(eq.id) || [];
    const entries = db.getQcEntries(eq.id) || [];
    console.log(`Equipment: [${eq.id}] ${eq.equipmentCode} - ${eq.name}`);
    console.log(`   Category: ${eq.category}, Controls: ${ctrls.length}, Entries: ${entries.length}`);
    if (entries.length > 0) {
      const analytes = [...new Set(entries.map(e => e.analyteCode))];
      console.log(`   Analyte codes in entries: ${analytes.join(', ')}`);
    }
  }
  db.close();
}

check().catch(console.error);
