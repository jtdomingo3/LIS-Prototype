const path = require('path');
const fs = require('fs');
const User = require('./models/User');
const Patient = require('./models/Patient');
const Test = require('./models/Test');
const Template = require('./models/Template');

const DATA_FILE = path.join(__dirname, 'data.json');
const USERS_FILE = path.join(__dirname, 'data-users.json');
const crypto = require('crypto');
const USER_DATA_KEY = process.env.DATA_USERS_KEY || process.env.USER_DATA_KEY || null;

// Initialize data file if it doesn't exist
if (!fs.existsSync(DATA_FILE)) {
  const initialData = {
    users: [],
    patients: [],
    tests: [],
    templates: []
  };
  fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
}

// Ensure users file exists
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, USER_DATA_KEY ? JSON.stringify([]) : JSON.stringify([], null, 2));
}

function deriveKey(secret) {
  return crypto.createHash('sha256').update(String(secret)).digest();
}

function encryptJson(obj) {
  if (!USER_DATA_KEY) return JSON.stringify(obj, null, 2);
  const key = deriveKey(USER_DATA_KEY);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(obj));
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({ v: 1, iv: iv.toString('base64'), tag: tag.toString('base64'), data: encrypted.toString('base64') }, null, 2);
}

function decryptJson(raw) {
  if (!raw) return [];
  if (!USER_DATA_KEY) return JSON.parse(raw);
  let parsed;
  try { parsed = JSON.parse(raw); } catch (e) { return JSON.parse(raw || '[]'); }
  if (!parsed || !parsed.data) return parsed;
  const key = deriveKey(USER_DATA_KEY);
  const iv = Buffer.from(parsed.iv, 'base64');
  const tag = Buffer.from(parsed.tag, 'base64');
  const encrypted = Buffer.from(parsed.data, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(dec.toString('utf8'));
}

// Simple file-based database functions
const db = {
  read: () => JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')),
  write: (data) => fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)),
  // Users are stored in a separate file (data-users.json)
  getUsers: () => {
    try {
      const raw = fs.readFileSync(USERS_FILE, 'utf8');
      return decryptJson(raw);
    } catch (e) {
      return [];
    }
  },
  saveUsers: (users) => {
    try {
      fs.writeFileSync(USERS_FILE, encryptJson(users), 'utf8');
    } catch (e) {
      console.error('Failed to write users file:', e);
    }
  },
  getPatients: () => db.read().patients,
  getTests: () => db.read().tests,
  getTemplates: () => db.read().templates,
  savePatients: (patients) => { const data = db.read(); data.patients = patients; db.write(data); },
  saveTests: (tests) => { const data = db.read(); data.tests = tests; db.write(data); },
  saveTemplates: (templates) => { const data = db.read(); data.templates = templates; db.write(data); }
};

// Make db available globally
global.db = db;

async function seedDatabase() {
  try {
    console.log('Starting database seeding...');

    // Load users from data-users.json and ensure admin exists
    const existingUsers = db.getUsers() || [];
    let adminUser = existingUsers.find(u => u.email === 'admin@lab.com');

    if (!adminUser) {
      adminUser = new User({
        name: 'Admin User',
        email: 'admin@lab.com',
        password: 'password123',
        role: 'Admin',
        status: 'Active'
      });
      await adminUser.save();
      console.log('Created admin user in data-users.json');
    } else {
      // ensure admin password remains password123 if it is plaintext or missing
      if (!adminUser.password || !adminUser.password.startsWith('$2a$')) {
        const u = new User(Object.assign({}, adminUser, { password: 'password123' }));
        await u.save();
        console.log('Ensured admin password is set and hashed');
      }
      adminUser = await User.findOne({ email: 'admin@lab.com' });
    }

    // Ensure other existing users have a default password 'gezyne' if not set or not hashed
    for (const u of existingUsers) {
      if (u.email === 'admin@lab.com') continue;
      if (!u.password || !u.password.startsWith('$2a$')) {
        const tmp = new User(Object.assign({}, u, { password: 'gezyne' }));
        await tmp.save();
        console.log(`Set default password for ${u.email}`);
      }
    }
    console.log('Loaded users from data-users.json');

    // Sample patients, tests, and templates were removed per request.

    console.log('Database seeded successfully!');
    console.log('\nLogin credentials:');
    console.log('Admin: admin@lab.com / password123');
    console.log('Other users: see data-users.json (default password if not set: gezyne)');

  } catch (error) {
    console.error('Error seeding database:', error);
  }
}

// Run the seed function
seedDatabase();