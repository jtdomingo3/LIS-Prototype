const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

async function main() {
  const args = require('minimist')(process.argv.slice(2));
  const email = args.email || args.e || 'admin@local';
  const password = args.password || args.p || 'admin123';
  const name = args.name || args.n || 'Administrator';

  const usersFile = path.join(__dirname, '..', 'data-users.json');

  let users = [];
  // Prefer explicit users file; fallback to legacy data.json migration if present
  if (fs.existsSync(usersFile)) {
    try {
      const raw = fs.readFileSync(usersFile, 'utf8');
      users = JSON.parse(raw) || [];
    } catch (e) {
      console.error('Failed to parse data-users.json:', e);
      process.exit(1);
    }
  } else {
    const legacy = path.join(__dirname, '..', 'data.json');
    if (fs.existsSync(legacy)) {
      try {
        const raw = fs.readFileSync(legacy, 'utf8');
        const parsed = JSON.parse(raw) || {};
        users = parsed.users || [];
        console.log('Migrated users from legacy data.json');
      } catch (e) {
        console.error('Failed to parse legacy data.json:', e);
        process.exit(1);
      }
    }
  }

  // Check existing
  const exists = users.find(u => u.email === email);
  if (exists) {
    console.log('User with this email already exists:', email);
    process.exit(0);
  }

  const salt = await bcrypt.genSalt(12);
  const hash = await bcrypt.hash(password, salt);

  const user = {
    id: uuidv4(),
    name,
    email,
    password: hash,
    role: 'Admin',
    status: 'Active',
    createdAt: new Date().toISOString(),
    lastLogin: null
  };

  users.push(user);
  try {
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
    console.log('Admin user created:', email);
  } catch (e) {
    console.error('Failed to write users file:', e);
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
