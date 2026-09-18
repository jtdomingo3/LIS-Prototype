const Database = require('better-sqlite3');
const db = new Database('./lis-fullstack/lis-data.db');
console.log('Tables:', db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all());
try {
  console.log('kv count:', db.prepare('SELECT count(*) as count FROM kv').get());
  const row = db.prepare("SELECT value FROM kv WHERE key='data'").get();
  if (row) {
    const data = JSON.parse(row.value);
    console.log('Patients in KV store:', (data.patients || []).length);
    console.log('Last patient:', (data.patients || []).slice(-1));
  }
} catch (e) {
  console.log('KV check:', e.message);
}
try {
  console.log('patients table count:', db.prepare('SELECT count(*) as count FROM patients').get());
  const rows = db.prepare('SELECT * FROM patients LIMIT 3').all();
  console.log('patients sample:', rows);
} catch (e) {
  console.log('patients table:', e.message);
}
