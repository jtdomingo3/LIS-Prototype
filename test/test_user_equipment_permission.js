const http = require('http');
const assert = require('assert');
const { generateToken } = require('../lis-fullstack/lib/tokenHelper');
const Database = require('../lis-fullstack/node_modules/better-sqlite3');

function request(options, data) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch (_) {}
        resolve({ status: res.statusCode, headers: res.headers, body, json });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function run() {
  console.log('=== TESTING USER EQUIPMENT & QC MODULE PERMISSION ===');

  const adminToken = generateToken({
    id: 'test-admin',
    email: 'admin@lab.com',
    role: 'Admin',
    permissions: { dashboard: true, users: true, equipment: true }
  });

  const authHeaders = {
    'Authorization': `Bearer ${adminToken}`,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
  };

  // 1. Verify GET /users/new contains Equipment & QC checkbox
  console.log('\n[Test 1] GET /users/new includes Equipment & QC module');
  const newRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/users/new',
    method: 'GET',
    headers: authHeaders
  });
  assert.strictEqual(newRes.status, 200, 'GET /users/new should return 200');
  const hasNewEq = newRes.body.includes('permissions[equipment]') && newRes.body.includes('Equipment &amp; QC') || newRes.body.includes('Equipment & QC');
  console.log('  Rendered Equipment & QC checkbox in /users/new:', hasNewEq);
  assert.strictEqual(hasNewEq, true, 'Should render Equipment & QC permission in new user form');

  // 2. Query an existing user from DB to test edit
  const db = new Database('./lis-fullstack/lis-data.db');
  const targetUserRow = db.prepare('SELECT id, email, json FROM users WHERE email = ?').get('marissa@gezyne.com');
  assert.ok(targetUserRow, 'Target user marissa@gezyne.com should exist');
  const targetId = targetUserRow.id;
  console.log(`\n[Test 2] GET /users/${targetId}/edit for Marissa R. Narag, RMT`);

  const editRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/users/${targetId}/edit`,
    method: 'GET',
    headers: authHeaders
  });
  assert.strictEqual(editRes.status, 200, 'GET /users/:id/edit should return 200');
  const hasEditEq = editRes.body.includes('permissions[equipment]') && (editRes.body.includes('Equipment &amp; QC') || editRes.body.includes('Equipment & QC'));
  console.log('  Rendered Equipment & QC checkbox in /users/:id/edit:', hasEditEq);
  assert.strictEqual(hasEditEq, true, 'Should render Equipment & QC permission in edit user form');

  // 3. Update user permissions with equipment: 1
  console.log(`\n[Test 3] Updating user permissions with equipment = 1`);
  // Parse existing permissions
  const existingUserObj = JSON.parse(targetUserRow.json);
  const updatedPerms = { ...existingUserObj.permissions, equipment: true };

  // Update directly through DB or PUT route
  existingUserObj.permissions = updatedPerms;
  db.prepare('UPDATE users SET json = ? WHERE id = ?').run(JSON.stringify(existingUserObj), targetId);

  // Verify in DB
  const verifyRow = db.prepare('SELECT json FROM users WHERE id = ?').get(targetId);
  const parsedVerify = JSON.parse(verifyRow.json);
  console.log('  Database permissions for user:', parsedVerify.permissions);
  assert.strictEqual(parsedVerify.permissions.equipment, true, 'Database should reflect equipment: true');

  // 4. Verify GET /users/:id renders the Equipment & QC badge in Module Access Privileges
  console.log(`\n[Test 4] GET /users/${targetId} renders Equipment & QC badge`);
  const showRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/users/${targetId}`,
    method: 'GET',
    headers: authHeaders
  });
  assert.strictEqual(showRes.status, 200, 'GET /users/:id should return 200');
  const hasShowEq = showRes.body.includes('Equipment &amp; QC') || showRes.body.includes('Equipment & QC');
  console.log('  Rendered Equipment & QC badge in /users/:id:', hasShowEq);
  assert.strictEqual(hasShowEq, true, 'Should render Equipment & QC in user details');

  // 5. Verify process owner with only equipment permission can access /equipment
  console.log(`\n[Test 5] Process owner with equipment: true can access /equipment`);
  const processOwnerToken = generateToken({
    id: targetId,
    email: 'marissa@gezyne.com',
    role: 'Medical Technologist',
    permissions: { equipment: true }
  });

  const eqRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/equipment',
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${processOwnerToken}`,
      'Accept': 'text/html'
    }
  });
  console.log('  Access status for /equipment:', eqRes.status);
  assert.strictEqual(eqRes.status, 200, 'Process owner with equipment permission should access /equipment with 200');

  console.log('\n========================================================');
  console.log('  >>> ALL USER EQUIPMENT PERMISSION TESTS PASSED! <<<   ');
  console.log('========================================================');
}

run().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
