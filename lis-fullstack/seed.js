const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const USERS_FILE = path.join(__dirname, 'data-users.json');

function readUsers() {
  try { const raw = fs.readFileSync(USERS_FILE, 'utf8'); return JSON.parse(raw); } catch (e) { return []; }
}

function writeUsers(users) {
  try { fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8'); } catch (e) { console.error('Failed to write users file:', e); }
}

async function seedAdminOnly() {
  try {
    const existing = readUsers() || [];
    let admin = existing.find(u => u.email === 'admin@lab.com');
    // Pre-hashed default administrator credential (cost factor 12)
    const hash = process.env.ADMIN_INITIAL_PASSWORD_HASH || '$2a$12$t1ORj/D94UYW057qZm1Ga.KU07BHErrr3BzmeO7fNbu5h5encZvD2';
    if (!admin) {
      admin = {
        id: uuidv4(),
        name: 'Admin User',
        email: 'admin@lab.com',
        password: hash,
        role: 'Admin',
        status: 'Active',
        createdAt: new Date().toISOString(),
        lastLogin: null
      };
      writeUsers([admin]);
      console.log('Created admin user in data-users.json');
    } else {
      // ensure password is hashed and remove any other users
      if (!admin.password || !admin.password.startsWith('$2a$')) {
        admin.password = hash;
      }
      writeUsers([admin]);
      console.log('Ensured only admin user exists and password is encrypted');
    }
  } catch (e) {
    console.error('Seeding failed:', e);
    process.exit(1);
  }
}

seedAdminOnly();