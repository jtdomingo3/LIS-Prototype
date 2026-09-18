const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const OUT_DIR = path.join(__dirname, '..', 'build', 'installer-resources');
fs.mkdirSync(OUT_DIR, { recursive: true });

async function make() {
  const now = new Date().toISOString();
  // Pre-hashed default administrator credential (cost factor 12)
  const hash = process.env.ADMIN_INITIAL_PASSWORD_HASH || '$2a$12$t1ORj/D94UYW057qZm1Ga.KU07BHErrr3BzmeO7fNbu5h5encZvD2';

  const admin = {
    id: uuidv4(),
    name: 'Admin User',
    email: 'admin@lab.com',
    password: hash,
    role: 'Admin',
    status: 'Active',
    permissions: {
      dashboard: true, patients: true, reception: true,
      tests: true, reports: true, worksheet: true,
      templates: true, users: true, delete: true
    },
    createdAt: now,
    lastLogin: null
  };

  const usersPath = path.join(OUT_DIR, 'data-users.json');
  const dataPath = path.join(OUT_DIR, 'data.json');
  const dbPath = path.join(OUT_DIR, 'lis-data.db');

  fs.writeFileSync(usersPath, JSON.stringify([admin], null, 2), 'utf8');

  const initialData = {
    users: [],
    patients: [],
    tests: [],
    templates: [],
    counters: {}
  };
  fs.writeFileSync(dataPath, JSON.stringify(initialData, null, 2), 'utf8');

  // Create clean seed SQLite database
  try {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    const { createDb } = require('../lib/sqliteDb');
    const db = createDb(dbPath);
    db.saveUsers([admin]);
    db.write(initialData);
    db.close();
    console.log(' -', dbPath);
  } catch (e) {
    console.warn('Warning: could not create seed SQLite db in installer-resources:', e.message);
  }

  console.log('Wrote installer resources to', OUT_DIR);
  console.log(' -', usersPath);
  console.log(' -', dataPath);
}

make().catch(err => { console.error(err); process.exit(1); });
