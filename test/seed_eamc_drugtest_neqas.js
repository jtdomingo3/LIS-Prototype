/**
 * Seed Script: EAMC Drug Testing NEQAS Records
 * Inserts realistic NRL-EAMC Drug Testing proficiency records across all active databases:
 * 1. lis-fullstack/lis-data.db
 * 2. lis-app-standalone/lis-data.db
 * 3. %USERPROFILE%/Documents/LIS/app-sync/lis-data.db (if present)
 */
const fs = require('fs');
const path = require('path');
const Database = require(path.join(__dirname, '../lis-fullstack/node_modules/better-sqlite3'));
const NeqasRecord = require(path.join(__dirname, '../lis-fullstack/models/NeqasRecord'));

const now = new Date();
const daysAgo = (d) => new Date(now.getTime() - (d * 24 * 60 * 60 * 1000)).toISOString();

const targetDatabases = [
  path.join(__dirname, '../lis-fullstack/lis-data.db'),
  path.join(__dirname, '../lis-app-standalone/lis-data.db'),
  path.join(process.env.USERPROFILE || 'C:\\Users\\Jeff', 'Documents/LIS/app-sync/lis-data.db')
];

function seedDatabase(dbPath) {
  if (!fs.existsSync(dbPath)) {
    console.log(`[Skip] Database file does not exist: ${dbPath}`);
    return;
  }

  console.log(`\n========================================================`);
  console.log(`[Seeding EAMC Drug Testing] DB: ${dbPath}`);
  console.log(`========================================================`);

  const db = new Database(dbPath);

  // Check if neqas_records table exists
  const tableCheck = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='neqas_records'").get();
  if (!tableCheck) {
    console.log(`[Warning] neqas_records table not found in ${dbPath}. Skipping.`);
    db.close();
    return;
  }

  // Find a suitable equipment ID
  const eqRow = db.prepare("SELECT id, name FROM equipment WHERE department LIKE '%Chemistry%' OR department LIKE '%Microscopy%' LIMIT 1").get()
             || db.prepare("SELECT id, name FROM equipment LIMIT 1").get();
  const eqId = eqRow ? eqRow.id : 'eq-chem-default';
  const eqName = eqRow ? eqRow.name : 'Clinical Laboratory Analyzer';

  const eamcRecords = [
    new NeqasRecord({
      id: 'eamc-pt-2026-met-01',
      equipmentId: eqId,
      equipmentName: eqName,
      cycleYear: '2026',
      eventNumber: 'Survey 1',
      nrlName: 'East Avenue Medical Center (EAMC - Toxicology & Drug Testing)',
      sampleId: 'EAMC-DT-2026-PT01',
      analyteCode: 'met',
      analyteName: 'Methamphetamine (MET / Shabu Screening)',
      unit: 'ng/mL',
      reportedValue: 620.0,
      submissionDate: daysAgo(25),
      reportedBy: 'J. Domingo, RMT',
      peerMean: 615.0,
      peerSd: 22.5,
      peerCount: 142,
      evaluationGrade: 'ACCEPTABLE',
      notes: 'Proficiency testing survey for accredited DOH screening drug testing laboratory (DOH AO 2020-0035). Cut-off: 500 ng/mL.'
    }),
    new NeqasRecord({
      id: 'eamc-pt-2026-thc-02',
      equipmentId: eqId,
      equipmentName: eqName,
      cycleYear: '2026',
      eventNumber: 'Survey 1',
      nrlName: 'East Avenue Medical Center (EAMC - Toxicology & Drug Testing)',
      sampleId: 'EAMC-DT-2026-PT02',
      analyteCode: 'thc',
      analyteName: 'Cannabinoids / THC (Marijuana Screening)',
      unit: 'ng/mL',
      reportedValue: 78.0,
      submissionDate: daysAgo(25),
      reportedBy: 'J. Domingo, RMT',
      peerMean: 76.5,
      peerSd: 4.2,
      peerCount: 142,
      evaluationGrade: 'ACCEPTABLE',
      notes: 'NRL-EAMC national proficiency survey for accredited drug testing centers. Cut-off: 50 ng/mL.'
    }),
    new NeqasRecord({
      id: 'eamc-pt-2025-conf-03',
      equipmentId: eqId,
      equipmentName: eqName,
      cycleYear: '2025',
      eventNumber: 'Survey 2',
      nrlName: 'East Avenue Medical Center (EAMC - Toxicology & Drug Testing)',
      sampleId: 'EAMC-DT-2025-PT03',
      analyteCode: 'met-conf',
      analyteName: 'Methamphetamine (MET - GC/MS Confirmatory)',
      unit: 'ng/mL',
      reportedValue: 310.0,
      submissionDate: daysAgo(150),
      reportedBy: 'J. Domingo, RMT',
      peerMean: 305.0,
      peerSd: 11.0,
      peerCount: 88,
      evaluationGrade: 'ACCEPTABLE',
      notes: 'Confirmatory drug testing proficiency assessment using GC-MS instrumentation.'
    })
  ];

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO neqas_records (id, equipmentId, cycleYear, eventNumber, nrlName, sampleId, analyteCode, status, createdAt, json)
    VALUES (@id, @equipmentId, @cycleYear, @eventNumber, @nrlName, @sampleId, @analyteCode, @status, @createdAt, @json)
  `);

  for (const r of eamcRecords) {
    insertStmt.run({
      id: r.id,
      equipmentId: r.equipmentId,
      cycleYear: r.cycleYear,
      eventNumber: r.eventNumber,
      nrlName: r.nrlName,
      sampleId: r.sampleId,
      analyteCode: r.analyteCode,
      status: r.status,
      createdAt: r.createdAt,
      json: JSON.stringify(r)
    });
    console.log(`  ✓ Inserted EAMC PT: [${r.sampleId}] ${r.analyteName} -> SDI: ${r.nrlEvaluation.sdi} (${r.nrlEvaluation.evaluationGrade})`);
  }

  db.close();
}

targetDatabases.forEach(seedDatabase);
console.log('\n[EAMC Seed] Finished seeding all databases successfully.');
