const fs = require('fs');
const path = require('path');

// One-off script to fix tests whose type is PT/APTT (coagulation) but have BC-prefixed testId.
// This will reassign them to the APT prefix. Usage: node scripts/fix-pt-test-ids.js

const DATA_FILE = path.join(__dirname, '..', 'data.json');

function loadData() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function saveData(d) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2), 'utf8');
}

function isAptType(s) {
  if (!s) return false;
  return /\b(?:pt|prothrombin|pt-aptt|ptaptt|aptt)\b/i.test(String(s));
}

function parseNumericSuffix(testId, prefix) {
  if (!testId || !prefix) return 0;
  if (!testId.startsWith(prefix)) return 0;
  const num = testId.slice(prefix.length).replace(/^0+/, '');
  const n = parseInt(num || '0', 10);
  return isNaN(n) ? 0 : n;
}

function padNum(n) { return String(n).padStart(7, '0'); }

function main() {
  console.log('Loading data file:', DATA_FILE);
  const data = loadData();
  data.tests = Array.isArray(data.tests) ? data.tests : [];
  data.counters = data.counters || {};

  // compute current max APT counter from existing testIds and counters
  const existingAptNums = data.tests.map(t => parseNumericSuffix(t.testId || '', 'APT'));
  const maxExistingApt = existingAptNums.length ? Math.max(...existingAptNums) : 0;
  const counterVal = Math.max(maxExistingApt, (data.counters.APT || 0));

  let next = counterVal;
  const updated = [];

  for (const t of data.tests) {
    if (!t) continue;
    const tt = t.testType || t.template || '';
    if (isAptType(tt)) {
      const tid = String(t.testId || '');
      if (tid.toUpperCase().startsWith('BC')) {
        // assign next PT id
        next += 1;
        const newId = 'APT' + padNum(next);
        console.log(`Updating test id ${t.id || t._id} (${t.testId}) -> ${newId} (type='${tt}')`);
        t.testId = newId;
        // update updatedAt for merge logic
        try { t.updatedAt = (new Date()).toISOString(); } catch (e) { t.updatedAt = String(new Date()); }
        updated.push({ id: t.id || t._id, old: tid, new: newId });
      }
    }
  }

  if (updated.length) {
    data.counters.APT = next;
    console.log('Saving changes for', updated.length, 'tests and updating counters.APT =', next);
    saveData(data);
    console.log('Done. Please restart the server to pick up changes.');
  } else {
    console.log('No BC-prefixed PT/APTT (coagulation) tests found. No changes made.');
  }
}

if (require.main === module) main();
