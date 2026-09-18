const path = require('path');
const fs = require('fs');
const os = require('os');
const Database = require(path.join(__dirname, '..', 'lis-fullstack', 'node_modules', 'better-sqlite3'));
const { evaluateWestgardRules } = require(path.join(__dirname, '..', 'lis-fullstack', 'lib', 'leveyJenningsService'));
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();

const homedir = os.homedir ? os.homedir() : (process.env.USERPROFILE || '');
const dbPaths = [
  path.join(__dirname, '..', 'lis-fullstack', 'lis-data.db'),
  path.join(__dirname, '..', 'lis-app-standalone', 'lis-data.db'),
  path.join(homedir, 'Documents', 'LIS', 'app-sync', 'lis-data.db'),
  path.join(homedir, 'Documents', 'LIS', 'app_sync', 'lis-data.db')
];

const eqId = 'cc2c0b6e-eee1-4cd5-9a6b-02274cd90740'; // Mindray BS-240
const ctrlL2Id = '23cac19e-23c2-4464-994d-32d0fbad5405';

// Realistic Gaussian simulation offsets for 25 runs (Day 11 is 1:2s warning)
const offsets = [
  -0.12, 0.25, -0.35, 0.18, -0.05, 0.42, -0.28, 0.10, -0.45, 0.32,
  2.15, // Day 11 warning (1:2s rule violation demonstration)
  -0.15, 0.08, -0.22, 0.30, -0.18, 0.05, -0.32, 0.28, -0.10,
  0.15, -0.08, 0.22, -0.14, 0.02
];

const now = new Date('2026-09-08T12:00:00.000Z');
const daysAgo = (d) => new Date(now.getTime() - (d * 24 * 60 * 60 * 1000)).toISOString();

dbPaths.forEach(dbPath => {
  if (!fs.existsSync(dbPath)) return;
  console.log('\n--- Seeding Level 2 runs into:', dbPath);
  const db = new Database(dbPath);

  const ctrlRow = db.prepare('SELECT json FROM qc_controls WHERE id = ?').get(ctrlL2Id);
  if (!ctrlRow) {
    console.log('  Level 2 control not found in this db, skipping.');
    db.close();
    return;
  }

  const ctrlL2 = JSON.parse(ctrlRow.json);
  const analytes = ctrlL2.analytes || [];
  console.log(`  Found Level 2 control: "${ctrlL2.controlName}" with ${analytes.length} analytes.`);

  // Delete any pre-existing Level 2 runs to ensure fresh in-control seeded runs
  db.prepare('DELETE FROM qc_entries WHERE equipmentId = ? AND controlId = ?').run(eqId, ctrlL2Id);

  const insertStmt = db.prepare(`
    INSERT OR REPLACE INTO qc_entries (
      id, equipmentId, controlId, analyteCode, controlLot, runDate, measuredValue, zScore, status, createdAt, json
    ) VALUES (
      @id, @equipmentId, @controlId, @analyteCode, @controlLot, @runDate, @measuredValue, @zScore, @status, @createdAt, @json
    )
  `);

  let totalSeeded = 0;
  db.transaction(() => {
    for (const a of analytes) {
      const historyEntries = [];
      for (let dayIdx = 24; dayIdx >= 0; dayIdx--) {
        const runDate = daysAgo(dayIdx);
        const zSim = offsets[24 - dayIdx] || 0;
        let rawVal = a.targetMean + (zSim * a.targetSd);

        if (a.targetSd < 0.1) rawVal = Number(rawVal.toFixed(3));
        else if (a.targetSd < 1.0) rawVal = Number(rawVal.toFixed(2));
        else rawVal = Number(rawVal.toFixed(1));

        const evaluation = evaluateWestgardRules(
          { measuredValue: rawVal, targetMean: a.targetMean, targetSd: a.targetSd },
          historyEntries
        );

        const entry = {
          id: uuidv4(),
          equipmentId: eqId,
          controlId: ctrlL2.id,
          controlLot: ctrlL2.lotNumber || 'LOT-BR-2026-H2',
          controlLevel: ctrlL2.level || 'Level 2 (High)',
          analyteCode: a.analyteCode,
          analyteName: a.analyteName,
          unit: a.unit || 'mg/dL',
          runDate,
          runNumber: 1,
          measuredValue: rawVal,
          targetMean: a.targetMean,
          targetSd: a.targetSd,
          zScore: evaluation.zScore !== undefined ? Number(evaluation.zScore) : 0,
          status: evaluation.status,
          rulesViolated: evaluation.rulesViolated,
          violationType: evaluation.violationType,
          reagentLotNumber: 'RGT-CHEM-2026-H2',
          operatorName: (dayIdx % 2 === 0) ? 'J. Domingo, RMT' : 'M. Santos, RMT',
          notes: (evaluation.status === 'WARNING')
            ? `1:2s Warning (Z = ${evaluation.zScore}). Standard within acceptable clinical limits.`
            : 'Routine Level 2 daily QC calibration check. In-control.'
        };

        insertStmt.run({
          id: entry.id,
          equipmentId: entry.equipmentId,
          controlId: entry.controlId,
          analyteCode: entry.analyteCode,
          controlLot: entry.controlLot,
          runDate: entry.runDate,
          measuredValue: entry.measuredValue,
          zScore: entry.zScore,
          status: entry.status,
          createdAt: entry.runDate,
          json: JSON.stringify(entry)
        });

        historyEntries.push(entry);
        totalSeeded++;
      }
    }
  })();

  const totalRuns = db.prepare('SELECT COUNT(*) as cnt FROM qc_entries WHERE equipmentId = ?').get(eqId).cnt;
  console.log(`  ✓ Successfully seeded ${totalSeeded} Level 2 runs. Total QC runs for Mindray BS-240 is now: ${totalRuns}`);
  db.close();
});

console.log('\nAll databases seeded with Level 2 clinical QC runs!');
