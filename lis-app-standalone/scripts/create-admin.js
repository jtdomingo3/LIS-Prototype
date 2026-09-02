const fs = require('fs');
const path = require('path');
const { dataFile } = require('../lib/dataPath');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

async function main() {
  const args = require('minimist')(process.argv.slice(2));
  const email = args.email || args.e || 'admin@local';
  const password = args.password || args.p || 'admin123';
  const name = args.name || args.n || 'Administrator';

  const dataFilePath = dataFile('data.json');
  if (!fs.existsSync(dataFilePath)) {
    console.error('data.json not found at', dataFilePath);
    process.exit(1);
  }

  const raw = fs.readFileSync(dataFile, 'utf8');
  let data;
  try { data = JSON.parse(raw); } catch (e) { console.error('Failed to parse data.json:', e); process.exit(1); }

  data.users = data.users || [];

  // Check existing
  const exists = data.users.find(u => u.email === email);
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

  data.users.push(user);
  fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2));
  console.log('Admin user created:', email);
}

main().catch(e => { console.error(e); process.exit(1); });
