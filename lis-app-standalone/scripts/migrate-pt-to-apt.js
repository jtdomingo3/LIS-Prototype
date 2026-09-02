const fs = require('fs');
const path = require('path');
const { dataFile } = require('../lib/dataPath');

// Migrate coagulation tests that were mistakenly assigned PT-prefixed IDs
// to the proper APT prefix. Usage: node scripts/migrate-pt-to-apt.js

const DATA_FILE = dataFile('data.json');

function loadData() { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
function saveData(d) { fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2), 'utf8'); }

function isAptType(s) {
  if (!s) return false;
  return /\b(?:pt|prothrombin|pt-aptt|ptaptt|aptt)\b/i.test(String(s));
}

function isPregnancyType(s) {
  if (!s) return false;
  return /pregnan|pregnancy/i.test(String(s));
}

function parseNumericSuffix(testId, prefix) {
  if (!testId || !prefix) return 0;
  const up = String(testId).toUpperCase();
  if (!up.startsWith(prefix)) return 0;
  const num = up.slice(prefix.length).replace(/^0+/, '');
  const n = parseInt(num || '0', 10);
  return isNaN(n) ? 0 : n;
}

function padNum(n) { return String(n).padStart(7, '0'); }

function main() {
  console.log('Loading data file:', DATA_FILE);
  const data = loadData();
  data.tests = Array.isArray(data.tests) ? data.tests : [];
  data.counters = data.counters || {};

  const existingAptNums = data.tests.map(t => parseNumericSuffix(t.testId || '', 'APT'));
  const maxExistingApt = existingAptNums.length ? Math.max(...existingAptNums) : 0;
  const counterVal = Math.max(maxExistingApt, (data.counters.APT || 0));
  let next = counterVal;

  const updated = [];
  for (const t of data.tests) {
    if (!t) continue;
    const tt = t.testType || t.template || '';
    // Only convert coagulation (APTT/PT) tests that are NOT pregnancy tests
    if (isAptType(tt) && !isPregnancyType(tt)) {
      const tid = String(t.testId || '').toUpperCase();
      if (tid.startsWith('PT')) {
        next += 1;
        const newId = 'APT' + padNum(next);
        console.log(`Migrating test ${t.id || t._id}: ${tid} -> ${newId} (type='${tt}')`);
        t.testId = newId;
        try { t.updatedAt = (new Date()).toISOString(); } catch (e) { t.updatedAt = String(new Date()); }
        updated.push({ id: t.id || t._id, old: tid, new: newId });
      }
    }
  }

  if (updated.length) {
    data.counters.APT = next;
    saveData(data);
    console.log(`Updated ${updated.length} tests and set counters.APT = ${next}. Please restart the server.`);
  } else {
    console.log('No PT-prefixed coagulation tests found to migrate.');
  }
}

if (require.main === module) main();
