const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data.json');

function safeNum(v) { const n = Number(v); return isNaN(n) ? 0 : n; }

function computeFromRequested(rlist) {
  let clin = 0, xray = 0;
  if (!Array.isArray(rlist)) return { clin: 0, xray: 0 };
  for (const r of rlist) {
    try {
      const amt = safeNum(r && (r.amount || r.price || r.cost) ? (r.amount || r.price || r.cost) : 0);
      const lab = String(r && r.lab ? r.lab : '').toLowerCase();
      const label = String(r && (r.label || r.key || r.name) ? (r.label || r.key || r.name) : '').toLowerCase();
      if (lab === 'xray' || label.includes('xray')) xray += amt; else clin += amt;
    } catch (e) { }
  }
  return { clin, xray };
}

function backfill() {
  if (!fs.existsSync(DATA_FILE)) {
    console.error('data.json not found at', DATA_FILE);
    process.exit(1);
  }
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  const data = JSON.parse(raw);
  const tests = Array.isArray(data.tests) ? data.tests : [];
  const patients = Array.isArray(data.patients) ? data.patients : [];
  const patientMap = {};
  for (const p of patients) patientMap[p.id] = p;

  let added = 0;
  for (const t of tests) {
    if (!t || !t.patient) continue;
    const p = patientMap[t.patient];
    if (!p) continue;
    const rlist = Array.isArray(t.requestedTests) ? t.requestedTests : [];
    const { clin, xray } = computeFromRequested(rlist);
    const total = clin + xray;
    if (total <= 0) continue; // skip zero-amount tests

    const ts = t.testDate || t.createdAt || (new Date()).toISOString();
    const entry = {
      timestamp: ts,
      source: 'backfill-tests',
      note: `Backfilled from test ${t.testId || t.id}`,
      clinical: clin,
      xray: xray,
      total: total,
      tests: [t.testId || t.id]
    };

    p.paymentHistory = Array.isArray(p.paymentHistory) ? p.paymentHistory : [];
    // avoid duplicate backfills: skip if there's already an entry with same source and test id
    const exists = p.paymentHistory.some(h => h && h.source === 'backfill-tests' && Array.isArray(h.tests) && h.tests.includes(t.testId));
    if (exists) continue;

    p.paymentHistory.push(entry);
    added++;
  }

  const dry = process.argv && process.argv.indexOf('--dry-run') >= 0;
  if (added > 0) {
    if (!dry) {
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
      console.log(`Backfilled ${added} paymentHistory entries into ${DATA_FILE}`);
    } else {
      console.log(`[dry-run] Would backfill ${added} paymentHistory entries into ${DATA_FILE}`);
    }
  } else {
    console.log('No backfill entries added (no non-zero requested test amounts or already backfilled).');
  }
}

if (require.main === module) {
  backfill();
}

module.exports = { backfill };
