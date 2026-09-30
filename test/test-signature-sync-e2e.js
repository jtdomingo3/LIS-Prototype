const crypto = require('crypto');
const path = require('path');

process.env.AUTH_TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || 'test-secret-for-regression-only';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-for-regression-only';

const { createDb } = require('../lis-fullstack/lib/sqliteDb');
const { generateSyncToken, validateSyncToken, validateSyncUser } = require('../lis-fullstack/lib/syncAuth');

const http = require('http');
const express = require('../lis-fullstack/node_modules/express');
const session = require('../lis-fullstack/node_modules/express-session');
const { requireAuth } = require('../lis-fullstack/middleware/auth');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function postJson(port, headers) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: '/protected',
      method: 'GET',
      headers
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function testSyncAuth() {
  const tmpDir = path.join(__dirname, 'tmp-sync-auth');
  const testDbFile = path.join(tmpDir, 'test-sync-auth.db');
  const fs = require('fs');
  fs.mkdirSync(tmpDir, { recursive: true });
  try { fs.unlinkSync(testDbFile); } catch (_) {}

  const db = createDb(testDbFile);
  const user = {
    id: 'test-admin-uuid',
    name: 'Test Administrator',
    email: 'admin_test@lab.com',
    password: '$2a$10$mockhashedpasswordforsynctesting123',
    role: 'Admin',
    status: 'Active'
  };
  db.saveUsers([user]);
  global.db = db;

  const app = express();
  app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false
  }));
  app.get('/protected', requireAuth, (req, res) => res.json({ email: req.session.user.email }));
  const server = await new Promise(resolve => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const port = server.address().port;
  const token = generateSyncToken(user.email, user.password);
  const headers = { 'X-LIS-Sync-Email': user.email, 'X-LIS-Sync-Hash': token, Accept: 'application/json' };

  try {
    assert(validateSyncUser(token, user.email, user), 'Fullstack sync token validator rejected valid HMAC');
    assert(!validateSyncUser(user.password, user.email, user), 'Fullstack sync validator accepted raw password hash');
    assert(!validateSyncToken(token, 'other@lab.com', user.password), 'Sync token validator accepted wrong email');

    const accepted = await postJson(port, headers);
    assert(accepted.statusCode === 200 && JSON.parse(accepted.body).email === user.email, 'Standalone auth middleware rejected valid HMAC token');

    const rawHash = await postJson(port, { ...headers, 'X-LIS-Sync-Hash': user.password });
    assert(rawHash.statusCode === 401, 'Standalone auth middleware accepted raw stored password hash');

    const invalid = await postJson(port, { ...headers, 'X-LIS-Sync-Hash': `${token.slice(0, -1)}0` });
    assert(invalid.statusCode === 401, 'Standalone auth middleware accepted invalid HMAC token');

    const expiredTimestamp = Math.floor(Date.now() / 1000) - 301;
    const expiredData = `${user.email}:${expiredTimestamp}`;
    const expiredHmac = crypto.createHmac('sha256', user.password).update(expiredData).digest('hex');
    const expired = await postJson(port, { ...headers, 'X-LIS-Sync-Hash': `${expiredData}:${expiredHmac}` });
    assert(expired.statusCode === 401, 'Standalone auth middleware accepted expired HMAC token');

    console.log('Sync authentication regression tests passed.');
  } finally {
    await new Promise(resolve => server.close(resolve));
    try { fs.unlinkSync(testDbFile); } catch (_) {}
    try { fs.rmdirSync(tmpDir); } catch (_) {}
    global.db = undefined;
  }
}

testSyncAuth().catch(error => {
  console.error('Sync authentication regression test failed:', error);
  process.exitCode = 1;
});
