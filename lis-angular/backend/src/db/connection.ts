import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const DB_PATH = process.env.DB_PATH || './data/lis.db';
const absoluteDbPath = path.isAbsolute(DB_PATH)
  ? DB_PATH
  : path.join(__dirname, '..', '..', DB_PATH);

// Ensure data directory exists
const dbDir = path.dirname(absoluteDbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(absoluteDbPath);
    // Enable WAL mode for better concurrent read performance
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

export function initializeDb(): void {
  const database = getDb();
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');

  // Strip SQL comments, then split by semicolons
  const stripped = schema.replace(/--[^\n]*/g, '');
  const statements = stripped
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  // Execute PRAGMAs outside transaction first
  const pragmas = statements.filter(s => s.toUpperCase().startsWith('PRAGMA'));
  const ddl = statements.filter(s => !s.toUpperCase().startsWith('PRAGMA'));

  for (const pragma of pragmas) {
    try {
      database.exec(pragma + ';');
    } catch (err: any) {
      console.warn(`Pragma warning: ${err.message}`);
    }
  }

  const transaction = database.transaction(() => {
    for (const stmt of ddl) {
      try {
        database.exec(stmt + ';');
      } catch (err: any) {
        console.error(`Failed to execute: ${stmt.substring(0, 80)}...`);
        console.error(err.message);
      }
    }
  });

  transaction();

  // ensure new columns are added on existing databases
  try {
    const testCols = database.prepare("PRAGMA table_info(tests)").all() as { name: string }[];
    if (!testCols.find(c => c.name === 'payment_history')) {
      console.log('[DB] adding missing payment_history column to tests');
      database.prepare("ALTER TABLE tests ADD COLUMN payment_history TEXT NOT NULL DEFAULT '{}'").run();
    }
    if (!testCols.find(c => c.name === 'assigned_doctor_id')) {
      database.prepare("ALTER TABLE tests ADD COLUMN assigned_doctor_id TEXT").run();
    }
    if (!testCols.find(c => c.name === 'assigned_doctor_name')) {
      database.prepare("ALTER TABLE tests ADD COLUMN assigned_doctor_name TEXT").run();
    }
    if (!testCols.find(c => c.name === 'awaiting_only')) {
      database.prepare("ALTER TABLE tests ADD COLUMN awaiting_only INTEGER NOT NULL DEFAULT 0").run();
    }

    const userCols = database.prepare("PRAGMA table_info(users)").all() as { name: string }[];
    if (!userCols.find(c => c.name === 'designation')) {
      console.log('[DB] adding missing designation column to users');
      database.prepare("ALTER TABLE users ADD COLUMN designation TEXT").run();
    }

    const batchCols = database.prepare("PRAGMA table_info(inventory_batches)").all() as { name: string }[];
    if (!batchCols.find(c => c.name === 'qc_status')) {
      console.log('[DB] adding missing qc_status column to inventory_batches');
      database.prepare("ALTER TABLE inventory_batches ADD COLUMN qc_status TEXT NOT NULL DEFAULT 'PASSED'").run();
    }
    if (!batchCols.find(c => c.name === 'open_vial_expiry_date')) {
      database.prepare("ALTER TABLE inventory_batches ADD COLUMN open_vial_expiry_date TEXT").run();
    }
    if (!batchCols.find(c => c.name === 'qc_verified_by')) {
      database.prepare("ALTER TABLE inventory_batches ADD COLUMN qc_verified_by TEXT").run();
    }
    if (!batchCols.find(c => c.name === 'qc_verified_date')) {
      database.prepare("ALTER TABLE inventory_batches ADD COLUMN qc_verified_date TEXT").run();
    }

    const qcControlCols = database.prepare("PRAGMA table_info(qc_controls)").all() as { name: string }[];
    if (!qcControlCols.find(c => c.name === 'analytes')) {
      console.log('[DB] adding missing analytes column to qc_controls');
      database.prepare("ALTER TABLE qc_controls ADD COLUMN analytes TEXT NOT NULL DEFAULT '[]'").run();
    }

    const qcEntryCols = database.prepare("PRAGMA table_info(qc_entries)").all() as { name: string }[];
    if (!qcEntryCols.find(c => c.name === 'corrective_action')) {
      console.log('[DB] adding missing corrective_action column to qc_entries');
      database.prepare("ALTER TABLE qc_entries ADD COLUMN corrective_action TEXT").run();
    }
    if (!qcEntryCols.find(c => c.name === 'reagent_lot_number')) {
      database.prepare("ALTER TABLE qc_entries ADD COLUMN reagent_lot_number TEXT").run();
    }
    if (!qcEntryCols.find(c => c.name === 'run_number')) {
      database.prepare("ALTER TABLE qc_entries ADD COLUMN run_number INTEGER DEFAULT 1").run();
    }
    if (!qcEntryCols.find(c => c.name === 'violation_type')) {
      database.prepare("ALTER TABLE qc_entries ADD COLUMN violation_type TEXT").run();
    }
  } catch (err: any) {
    console.warn('[DB] migration check failed:', err.message);
  }

  console.log('[DB] SQLite database initialized at', absoluteDbPath);
}

export function closeDb(): void {
  if (db) {
    db.close();
    console.log('[DB] Database connection closed');
  }
}

export default { getDb, initializeDb, closeDb };
