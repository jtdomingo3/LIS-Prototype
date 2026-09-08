const path = require('path');
const { initDb } = require('../lis-fullstack/lib/sqliteDb');
const DATA_DIR = require('../lis-fullstack/lib/dataPath').getDataDir();

async function inspectAndClean() {
  const dbPath = path.join(DATA_DIR, 'lis-data.db');
  const db = await initDb(dbPath);
  const allEq = db.getEquipment();
  
  for (const eq of allEq) {
    const ctrls = db.getQcControls(eq.id) || [];
    const entries = db.getQcEntries(eq.id) || [];
    console.log(`[${eq.equipmentCode}] ${eq.name} - Controls: ${ctrls.length}, Entries: ${entries.length}`);
    for (const c of ctrls) {
      console.log(`   Control: ${c.controlName} (ID: ${c.id}), lot: ${c.lotNumber}`);
      // If equipment is non-lab (X-Ray, Biosafety Cabinet) or has 0 entries and was accidentally auto-created
      const isNonLab = (eq.category && (eq.category.includes('X-Ray') || eq.category.includes('Biosafety')));
      if (isNonLab && entries.length === 0) {
        console.log(`   --> Removing accidental control from non-lab equipment: ${eq.equipmentCode}`);
        db.deleteQcControl(c.id);
      }
    }
  }
  db.close();
}

inspectAndClean().catch(console.error);
