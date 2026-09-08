const path = require('path');
const { initDb } = require('../lis-fullstack/lib/sqliteDb');
const DATA_DIR = require('../lis-fullstack/lib/dataPath').getDataDir();

async function cleanEmptyPlaceholders() {
  const dbPath = path.join(DATA_DIR, 'lis-data.db');
  const db = await initDb(dbPath);
  const allEq = db.getEquipment();
  
  for (const eq of allEq) {
    const ctrls = db.getQcControls(eq.id) || [];
    const entries = db.getQcEntries(eq.id) || [];
    if (entries.length === 0 && ctrls.length > 0) {
      for (const c of ctrls) {
        if (c.controlName.includes('Bio-Rad Lyphochek Chemistry Control Level 1') && c.lotNumber.startsWith('LOT-2026-01')) {
          console.log(`Removing auto-generated placeholder control ${c.id} from ${eq.equipmentCode}`);
          db.deleteQcControl(c.id);
        }
      }
    }
  }
  db.close();
}

cleanEmptyPlaceholders().catch(console.error);
