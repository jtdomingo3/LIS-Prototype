"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDb = getDb;
exports.initializeDb = initializeDb;
exports.closeDb = closeDb;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config({ path: path_1.default.join(__dirname, '..', '..', '.env') });
const DB_PATH = process.env.DB_PATH || './data/lis.db';
const absoluteDbPath = path_1.default.isAbsolute(DB_PATH)
    ? DB_PATH
    : path_1.default.join(__dirname, '..', '..', DB_PATH);
// Ensure data directory exists
const dbDir = path_1.default.dirname(absoluteDbPath);
if (!fs_1.default.existsSync(dbDir)) {
    fs_1.default.mkdirSync(dbDir, { recursive: true });
}
let db;
function getDb() {
    if (!db) {
        db = new better_sqlite3_1.default(absoluteDbPath);
        // Enable WAL mode for better concurrent read performance
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
    }
    return db;
}
function initializeDb() {
    const database = getDb();
    const schemaPath = path_1.default.join(__dirname, 'schema.sql');
    const schema = fs_1.default.readFileSync(schemaPath, 'utf-8');
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
        }
        catch (err) {
            console.warn(`Pragma warning: ${err.message}`);
        }
    }
    const transaction = database.transaction(() => {
        for (const stmt of ddl) {
            try {
                database.exec(stmt + ';');
            }
            catch (err) {
                console.error(`Failed to execute: ${stmt.substring(0, 80)}...`);
                console.error(err.message);
            }
        }
    });
    transaction();
    // ensure new columns are added on existing databases
    try {
        const cols = database.prepare("PRAGMA table_info(tests)").all();
        if (!cols.find(c => c.name === 'payment_history')) {
            console.log('[DB] adding missing payment_history column to tests');
            database.prepare("ALTER TABLE tests ADD COLUMN payment_history TEXT NOT NULL DEFAULT '{}'").run();
        }
    }
    catch (err) {
        console.warn('[DB] migration check failed:', err.message);
    }
    console.log('[DB] SQLite database initialized at', absoluteDbPath);
}
function closeDb() {
    if (db) {
        db.close();
        console.log('[DB] Database connection closed');
    }
}
exports.default = { getDb, initializeDb, closeDb };
//# sourceMappingURL=connection.js.map