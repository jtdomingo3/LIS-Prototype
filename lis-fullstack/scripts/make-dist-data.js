const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const OUT_DIR = path.join(__dirname, '..', 'build', 'installer-resources');
fs.mkdirSync(OUT_DIR, { recursive: true });

async function make() {
  const now = new Date().toISOString();
  const plaintext = 'password123';
  const salt = await bcrypt.genSalt(12);
  const hash = await bcrypt.hash(plaintext, salt);

  const admin = {
    id: uuidv4(),
    name: 'Admin User',
    email: 'admin@lab.com',
    password: hash,
    role: 'Admin',
    status: 'Active',
    createdAt: now,
    lastLogin: null
  };

  const usersPath = path.join(OUT_DIR, 'data-users.json');
  const dataPath = path.join(OUT_DIR, 'data.json');

  fs.writeFileSync(usersPath, JSON.stringify([admin], null, 2), 'utf8');

  const initialData = {
    users: [],
    patients: [],
    tests: [],
    templates: [],
    counters: {}
  };
  fs.writeFileSync(dataPath, JSON.stringify(initialData, null, 2), 'utf8');

  console.log('Wrote installer resources to', OUT_DIR);
  console.log(' -', usersPath);
  console.log(' -', dataPath);
}

make().catch(err => { console.error(err); process.exit(1); });
