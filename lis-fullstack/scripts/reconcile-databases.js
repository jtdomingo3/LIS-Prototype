/**
 * ============================================================================
 * GEZYNE LIS - LOCAL ENVIRONMENT TWO-WAY DATABASE RECONCILIATION
 * ============================================================================
 * 
 * Safely creates timestamped backups of all 4 local database files, merges
 * all diverged patient and test records (dev vs doc vs app_sync), and unifies
 * them into the canonical database Documents/LIS/data/lis-data.db.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('../node_modules/better-sqlite3');

const home = os.homedir();
const paths = {
  dev: path.join(__dirname, '..', 'lis-data.db'),
  doc: path.join(home, 'Documents', 'LIS', 'data', 'lis-data.db'),
  appSync: path.join(home, 'Documents', 'LIS', 'app_sync', 'lis-data.db'),
  appSyncHyphen: path.join(home, 'Documents', 'LIS', 'app-sync', 'lis-data.db'),
  backupRoot: path.join(home, 'Documents', 'LIS', 'backups')
};

async function run() {
  console.log('--- STARTING LOCAL DATABASE RECONCILIATION ---');
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(paths.backupRoot, `pre-reconciliation-${ts}`);
  fs.mkdirSync(backupDir, { recursive: true });

  // Backup all existing files
  for (const [key, p] of Object.entries(paths)) {
    if (key === 'backupRoot') continue;
    if (fs.existsSync(p)) {
      const dest = path.join(backupDir, `${key}-lis-data.db`);
      fs.copyFileSync(p, dest);
      console.log(`  ✓ Backed up ${key} (${fs.statSync(p).size} bytes) -> ${dest}`);
    }
  }

  // Canonical target: Documents/LIS/data/lis-data.db
  // If doc doesn't exist, copy dev over first
  if (!fs.existsSync(paths.doc) && fs.existsSync(paths.dev)) {
    fs.mkdirSync(path.dirname(paths.doc), { recursive: true });
    fs.copyFileSync(paths.dev, paths.doc);
  }

  const canonicalDb = new Database(paths.doc);

  // Helper to merge from a source DB into canonicalDb
  function mergeFrom(sourcePath, label) {
    if (!fs.existsSync(sourcePath)) {
      console.log(`  - Source ${label} does not exist, skipping.`);
      return;
    }
    const srcDb = new Database(sourcePath, { readonly: true });
    try {
      const existingPatientIds = new Set(canonicalDb.prepare('SELECT id FROM patients').all().map(r => r.id));
      const existingTestIds = new Set(canonicalDb.prepare('SELECT id FROM tests').all().map(r => r.id));

      const srcPatients = srcDb.prepare('SELECT * FROM patients').all();
      const srcTests = srcDb.prepare('SELECT * FROM tests').all();

      let pAdded = 0;
      let tAdded = 0;

      canonicalDb.transaction(() => {
        const insertPatient = canonicalDb.prepare(`
          INSERT OR IGNORE INTO patients (id, patientId, json, createdAt)
          VALUES (@id, @patientId, @json, @createdAt)
        `);
        for (const p of srcPatients) {
          if (!existingPatientIds.has(p.id)) {
            insertPatient.run(p);
            pAdded++;
          }
        }

        const insertTest = canonicalDb.prepare(`
          INSERT OR IGNORE INTO tests (id, testId, json, createdAt)
          VALUES (@id, @testId, @json, @createdAt)
        `);
        for (const t of srcTests) {
          if (!existingTestIds.has(t.id)) {
            insertTest.run(t);
            tAdded++;
          }
        }

        // Merge counters
        try {
          const srcCounters = srcDb.prepare('SELECT id, val FROM counters').all();
          const upsertCounter = canonicalDb.prepare(`
            INSERT INTO counters (id, val) VALUES (?, ?)
            ON CONFLICT(id) DO UPDATE SET val = MAX(counters.val, excluded.val)
          `);
          for (const c of srcCounters) {
            upsertCounter.run(c.id, c.val);
          }
        } catch (_) {}
      })();

      console.log(`  ✓ Merged from ${label}: +${pAdded} patients, +${tAdded} tests.`);
    } finally {
      srcDb.close();
    }
  }

  mergeFrom(paths.dev, 'dev (lis-fullstack)');
  mergeFrom(paths.appSync, 'legacy app_sync');

  const totalPatients = canonicalDb.prepare('SELECT COUNT(*) as c FROM patients').get().c;
  const totalTests = canonicalDb.prepare('SELECT COUNT(*) as c FROM tests').get().c;
  canonicalDb.close();

  // Sync canonical back to dev and app-sync so all workspaces share the complete unified database
  console.log('\n--- SYNCHRONIZING CANONICAL DB TO LOCAL STATIONS ---');
  fs.copyFileSync(paths.doc, paths.dev);
  console.log(`  ✓ Copied unified DB to dev: ${paths.dev}`);

  fs.mkdirSync(path.dirname(paths.appSyncHyphen), { recursive: true });
  fs.copyFileSync(paths.doc, paths.appSyncHyphen);
  console.log(`  ✓ Copied unified DB to app-sync: ${paths.appSyncHyphen}`);

  console.log('\n========================================================');
  console.log(`  RECONCILIATION COMPLETE:`);
  console.log(`  Total Canonical Patients : ${totalPatients}`);
  console.log(`  Total Canonical Tests    : ${totalTests}`);
  console.log('========================================================');
}

run().catch(err => {
  console.error('Reconciliation failed:', err);
  process.exit(1);
});

