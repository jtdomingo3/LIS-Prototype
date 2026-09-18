const path = require('path');
const fs = require('fs');
const os = require('os');
const Database = require(path.join(__dirname, '..', 'lis-fullstack', 'node_modules', 'better-sqlite3'));

const srcDbPath = path.join(__dirname, '..', 'lis-fullstack', 'lis-data.db');
if (!fs.existsSync(srcDbPath)) {
  console.error('Source db not found:', srcDbPath);
  process.exit(1);
}
const srcDb = new Database(srcDbPath);

const homedir = (os.homedir ? os.homedir() : process.env.USERPROFILE || '');
const targetDbPaths = [
  path.join(__dirname, '..', 'lis-app-standalone', 'lis-data.db'),
  path.join(homedir, 'Documents', 'LIS', 'app-sync', 'lis-data.db'),
  path.join(homedir, 'Documents', 'LIS', 'app_sync', 'lis-data.db')
];

const tablesToMigrate = ['equipment', 'equipment_logs', 'qc_controls', 'qc_entries', 'neqas_records'];

const schemaSql = `
  CREATE TABLE IF NOT EXISTS equipment (
    id TEXT PRIMARY KEY,
    equipmentCode TEXT UNIQUE,
    name TEXT,
    category TEXT,
    department TEXT,
    serialNumber TEXT,
    status TEXT,
    nextCalibrationDate TEXT,
    nextPmDate TEXT,
    createdAt TEXT,
    updatedAt TEXT,
    json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_eq_code ON equipment(equipmentCode);
  CREATE INDEX IF NOT EXISTS idx_eq_category ON equipment(category);
  CREATE INDEX IF NOT EXISTS idx_eq_dept ON equipment(department);
  CREATE INDEX IF NOT EXISTS idx_eq_status ON equipment(status);
  CREATE INDEX IF NOT EXISTS idx_eq_next_cal ON equipment(nextCalibrationDate);

  CREATE TABLE IF NOT EXISTS equipment_logs (
    id TEXT PRIMARY KEY,
    equipmentId TEXT,
    logType TEXT,
    serviceDate TEXT,
    resultStatus TEXT,
    certificateNumber TEXT,
    createdAt TEXT,
    json TEXT NOT NULL,
    FOREIGN KEY(equipmentId) REFERENCES equipment(id)
  );
  CREATE INDEX IF NOT EXISTS idx_eq_logs_eqid ON equipment_logs(equipmentId);
  CREATE INDEX IF NOT EXISTS idx_eq_logs_type ON equipment_logs(logType);
  CREATE INDEX IF NOT EXISTS idx_eq_logs_date ON equipment_logs(serviceDate);

  CREATE TABLE IF NOT EXISTS qc_controls (
    id TEXT PRIMARY KEY,
    equipmentId TEXT,
    controlName TEXT,
    lotNumber TEXT,
    level TEXT,
    expirationDate TEXT,
    isActive INTEGER DEFAULT 1,
    createdAt TEXT,
    json TEXT NOT NULL,
    FOREIGN KEY(equipmentId) REFERENCES equipment(id)
  );
  CREATE INDEX IF NOT EXISTS idx_qc_ctrl_eqid ON qc_controls(equipmentId);
  CREATE INDEX IF NOT EXISTS idx_qc_ctrl_lot ON qc_controls(lotNumber);

  CREATE TABLE IF NOT EXISTS qc_entries (
    id TEXT PRIMARY KEY,
    equipmentId TEXT,
    controlId TEXT,
    analyteCode TEXT,
    controlLot TEXT,
    runDate TEXT,
    measuredValue REAL,
    zScore REAL,
    status TEXT,
    createdAt TEXT,
    json TEXT NOT NULL,
    FOREIGN KEY(equipmentId) REFERENCES equipment(id),
    FOREIGN KEY(controlId) REFERENCES qc_controls(id)
  );
  CREATE INDEX IF NOT EXISTS idx_qc_entry_eqid ON qc_entries(equipmentId);
  CREATE INDEX IF NOT EXISTS idx_qc_entry_ctrl ON qc_entries(controlId);
  CREATE INDEX IF NOT EXISTS idx_qc_entry_analyte ON qc_entries(analyteCode);
  CREATE INDEX IF NOT EXISTS idx_qc_entry_date ON qc_entries(runDate);

  CREATE TABLE IF NOT EXISTS neqas_records (
    id TEXT PRIMARY KEY,
    equipmentId TEXT,
    cycleYear TEXT,
    eventNumber TEXT,
    nrlName TEXT,
    sampleId TEXT,
    analyteCode TEXT,
    status TEXT,
    createdAt TEXT,
    json TEXT NOT NULL,
    FOREIGN KEY(equipmentId) REFERENCES equipment(id)
  );
  CREATE INDEX IF NOT EXISTS idx_neqas_eqid ON neqas_records(equipmentId);
  CREATE INDEX IF NOT EXISTS idx_neqas_year ON neqas_records(cycleYear);
  CREATE INDEX IF NOT EXISTS idx_neqas_status ON neqas_records(status);
`;

targetDbPaths.forEach(targetPath => {
  if (!fs.existsSync(targetPath)) {
    console.log('Target path does not exist, skipping:', targetPath);
    return;
  }

  console.log('\nMigrating database at:', targetPath);
  const targetDb = new Database(targetPath);

  // Apply schema
  targetDb.exec(schemaSql);

  // Copy rows table by table
  tablesToMigrate.forEach(tbl => {
    const srcRows = srcDb.prepare(`SELECT * FROM ${tbl}`).all();
    if (!srcRows.length) {
      console.log(`  Table ${tbl}: 0 source rows, skipping.`);
      return;
    }

    const cols = Object.keys(srcRows[0]);
    const colNames = cols.join(', ');
    const placeholders = cols.map(c => '@' + c).join(', ');
    const insertStmt = targetDb.prepare(`INSERT OR REPLACE INTO ${tbl} (${colNames}) VALUES (${placeholders})`);

    const insertMany = targetDb.transaction((rows) => {
      for (const row of rows) {
        insertStmt.run(row);
      }
    });

    insertMany(srcRows);
    const count = targetDb.prepare(`SELECT COUNT(*) as cnt FROM ${tbl}`).get().cnt;
    console.log(`  Table ${tbl}: synced ${srcRows.length} rows (total in target: ${count})`);
  });

  targetDb.close();
});

srcDb.close();
console.log('\nAll standalone databases successfully migrated and seeded!');
