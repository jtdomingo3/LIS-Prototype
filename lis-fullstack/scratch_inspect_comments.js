const Database = require('better-sqlite3');
const db = new Database('lis-data.db');
// Find ultrasound tests and show their requestedTests and results
const rows = db.prepare("SELECT id, testType, json FROM tests WHERE testType LIKE '%ltrasound%' OR testType LIKE '%ltrasound%' LIMIT 5").all();
rows.forEach(r => {
  try {
    const data = JSON.parse(r.json || '{}');
    console.log('--- test id:', r.id, 'testType:', r.testType);
    if (data.requestedTests) {
      console.log('requestedTests:', JSON.stringify(data.requestedTests, null, 2));
    }
    if (data.results && data.results.comment_entries) {
      console.log('comment_entries:', JSON.stringify(data.results.comment_entries, null, 2));
    }
  } catch(e) {
    console.log('parse error:', e.message);
  }
});
if (!rows.length) console.log('No ultrasound tests found');
db.close();
