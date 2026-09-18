const path = require('path');
const { initDb } = require('../lis-fullstack/lib/sqliteDb');
const DATA_DIR = require('../lis-fullstack/lib/dataPath').getDataDir();

async function inspectDates() {
  const dbPath = path.join(DATA_DIR, 'lis-data.db');
  const db = await initDb(dbPath);
  const entries = db.getQcEntries('cc2c0b6e-eee1-4cd5-9a6b-02274cd90740') || [];
  console.log(`Total entries for Mindray BS-240: ${entries.length}`);
  const dates = entries.map(e => (e.runDate || '').split('T')[0]).filter(Boolean).sort();
  console.log(`Min runDate: ${dates[0]}`);
  console.log(`Max runDate: ${dates[dates.length - 1]}`);
  console.log('Sample dates:', dates.slice(0, 10));
  console.log('Sample recent dates:', dates.slice(-10));
  db.close();
}

inspectDates().catch(console.error);
