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
  console.log('[DB] SQLite database initialized at', absoluteDbPath);
}

export function closeDb(): void {
  if (db) {
    db.close();
    console.log('[DB] Database connection closed');
  }
}

export default { getDb, initializeDb, closeDb };
