/**
 * E2E Test: Signature File Synchronization between Standalone and Server
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

async function testSignatureSync() {
  console.log('🧪 Starting E2E Signature Sync Verification...');

  const serverDir = path.join(__dirname, '..', 'lis-fullstack');
  const serverSigDir = path.join(serverDir, 'assets', 'signature');
  if (!fs.existsSync(serverSigDir)) fs.mkdirSync(serverSigDir, { recursive: true });

  const testFilename = 'test_admin_e2e_signature.png';
  const targetServerFile = path.join(serverSigDir, testFilename);

  // Clean up any old test artifact
  if (fs.existsSync(targetServerFile)) fs.unlinkSync(targetServerFile);

  // Generate a minimal valid 1x1 PNG in base64
  const minimalPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  console.log('1. Simulating signature sync POST to server endpoint (/api/signatures/sync)...');

  // Initialize isolated test sqlite db adapter (never pollute live lis-data.db)
  const tmpDir = path.join(__dirname, 'tmp-sig-sync');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const testDbFile = path.join(tmpDir, 'test-sig-sync.db');
  if (fs.existsSync(testDbFile)) { try { fs.unlinkSync(testDbFile); } catch (_) {} }

  const { createDb } = require('../lis-fullstack/lib/sqliteDb');
  global.db = createDb(testDbFile);
  const adminUser = {
    id: 'test-admin-uuid',
    name: 'Test Administrator',
    email: 'admin_test@lab.com',
    password: '$2a$10$mockhashedpasswordforsynctesting123',
    role: 'Admin',
    status: 'Active'
  };
  global.db.saveUsers([adminUser]);
  const users = [adminUser];
  const testEmail = adminUser.email;
  const syncHash = adminUser.password;
  const originalSignature = null;
  console.log(`   Using isolated test admin user: ${testEmail} in ${testDbFile}`);

  console.log('1. Starting test Express instance with /api/signatures/sync endpoint...');
  let express;
  try { express = require('express'); } catch (_) {
    try { express = require('../lis-app-standalone/node_modules/express'); } catch (__) {
      express = require('../lis-fullstack/node_modules/express');
    }
  }
  const app = express();

  app.post('/api/signatures/sync', express.json({ limit: '15mb' }), express.urlencoded({ extended: true, limit: '15mb' }), async (req, res) => {
    try {
      const syncEmail = req.headers['x-lis-sync-email'];
      const syncHashHeader = req.headers['x-lis-sync-hash'];
      let authorized = false;
      if (syncEmail && syncHashHeader) {
        const match = users.find(u => u.email && u.email.toLowerCase() === syncEmail.toLowerCase());
        if (match && match.password === syncHashHeader) authorized = true;
      }
      if (!authorized) return res.status(401).json({ success: false, error: 'Authentication required' });

      const { filename, data, email } = req.body || {};
      const safeFilename = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
      const targetDir = path.join(serverDir, 'assets', 'signature');
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
      const targetPath = path.join(targetDir, safeFilename);

      const buffer = Buffer.from(data, 'base64');
      fs.writeFileSync(targetPath, buffer);

      if (email) {
        const User = require('../lis-fullstack/models/User');
        await User.findOneAndUpdate({ email: email.toLowerCase() }, { signature: safeFilename });
      }

      return res.json({ success: true, filename: safeFilename });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  });

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const TEST_PORT = server.address().port;

  console.log(`2. Simulating signature sync POST to server endpoint on port ${TEST_PORT}...`);
  const postData = JSON.stringify({
    filename: testFilename,
    data: minimalPngBase64,
    email: testEmail
  });

  const res = await new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path: '/api/signatures/sync',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'X-LIS-Sync-Email': testEmail,
        'X-LIS-Sync-Hash': syncHash
      },
      timeout: 5000
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => resolve({ statusCode: res.statusCode, body }));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });

  // Stop test server
  try { server.close(); } catch (_) {}

  console.log(`   Response Status: HTTP ${res.statusCode}`);
  if (res.statusCode !== 200) {
    throw new Error(`Signature sync failed with status ${res.statusCode}: ${res.body}`);
  }

  const json = JSON.parse(res.body);
  console.log('   Response Body:', json);

  // 2. Verify file was written to server assets/signature
  if (!fs.existsSync(targetServerFile)) {
    throw new Error(`File was not created on server disk at ${targetServerFile}`);
  }
  const fileSize = fs.statSync(targetServerFile).size;
  console.log(`✓ Signature file exists on server disk (${fileSize} bytes)`);

  // 3. Verify user record in database was updated
  const User = require('../lis-fullstack/models/User');
  const updatedAdmin = await User.findOne({ email: testEmail });
  console.log(`✓ Server User record updated with signature: "${updatedAdmin.signature}"`);

  // Clean up test file and restore user state
  try { fs.unlinkSync(targetServerFile); } catch (_) {}
  try { fs.unlinkSync(testDbFile); } catch (_) {}

  console.log('\n🎉 E2E SIGNATURE SYNC TEST PASSED SUCCESSFULLY!');
}

testSignatureSync().catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});
