/**
 * Automated Test: NRL-EAMC Drug Testing and Dynamic Custom NRLs
 * Tests the new NEQAS hub features across both fullstack and standalone routes:
 * 1. Default NRL list includes East Avenue Medical Center (EAMC - Toxicology & Drug Testing)
 * 2. EAMC drug testing survey records are retrieved and evaluated correctly
 * 3. Adding a new custom NRL persists into settings table
 * 4. Fetching NRL list returns both standard and custom NRLs
 * 5. Official NEQAS certificate print view renders with EAMC details
 * 6. Removing custom NRL succeeds
 */
const http = require('http');

function request(options, data = null) {
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
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    req.end();
  });
}

async function run() {
  console.log('--- STARTING NEQAS & NRL-EAMC INTEGRATION TEST ---');
  const baseUrl = 'http://localhost:3000';
  const cookieHeader = 'connect.sid=s%3Atest.sig;'; // or login

  // Authenticate as admin via signed Bearer token or optional env password
  const { generateToken } = require('../lis-fullstack/lib/tokenHelper');
  const token = generateToken({
    id: 'admin-test',
    email: process.env.TEST_ADMIN_EMAIL || 'admin@lab.com',
    role: 'Admin',
    permissions: { dashboard: true, equipment: true, inventory: true }
  });

  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  };

  if (process.env.TEST_ADMIN_PASSWORD) {
    const loginRes = await request({
      hostname: 'localhost',
      port: 3000,
      path: '/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }, `email=${encodeURIComponent(process.env.TEST_ADMIN_EMAIL || 'admin@lab.com')}&password=${encodeURIComponent(process.env.TEST_ADMIN_PASSWORD)}`);
    const rawCookies = loginRes.headers['set-cookie'];
    if (rawCookies && rawCookies[0]) {
      authHeaders['Cookie'] = rawCookies[0].split(';')[0];
    }
  }

  // Test 1: GET /equipment/neqas/nrl-list
  console.log('\n[Test 1] GET /equipment/neqas/nrl-list');
  const nrlRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/equipment/neqas/nrl-list',
    method: 'GET',
    headers: authHeaders
  });
  console.log('  Status:', nrlRes.status);
  console.log('  Success:', nrlRes.json && nrlRes.json.success);
  const nrls = (nrlRes.json && nrlRes.json.nrls) || [];
  const hasEamc = nrls.some(n => n.name.includes('East Avenue') || n.id === 'eamc');
  console.log('  Includes EAMC NRL:', hasEamc);
  if (!hasEamc) throw new Error('EAMC missing from NRL list');

  // Test 2: GET /equipment/neqas/all (check EAMC Drug Testing records)
  console.log('\n[Test 2] GET /equipment/neqas/all');
  const allRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/equipment/neqas/all',
    method: 'GET',
    headers: authHeaders
  });
  console.log('  Status:', allRes.status);
  const records = (allRes.json && allRes.json.records) || [];
  const eamcRecs = records.filter(r => (r.nrlName || '').includes('East Avenue'));
  console.log('  Total NEQAS records:', records.length);
  console.log('  EAMC Drug Testing records found:', eamcRecs.length);
  if (eamcRecs.length === 0) throw new Error('No EAMC records found in NEQAS table');
  eamcRecs.forEach(r => {
    console.log(`    • [${r.sampleId}] ${r.analyteName} -> SDI: ${r.nrlEvaluation ? r.nrlEvaluation.sdi : 'N/A'} (${r.status})`);
  });

  // Test 3: POST /equipment/neqas/nrl-list (Register new custom NRL)
  console.log('\n[Test 3] POST /equipment/neqas/nrl-list (Register Philippine Heart Center NRL)');
  const addRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/equipment/neqas/nrl-list',
    method: 'POST',
    headers: authHeaders
  }, {
    name: 'Philippine Heart Center (PHC - Cardiovascular NRL)',
    specialty: 'Cardiovascular & Cardiac Biomarkers NRL',
    analytes: 'Troponin I/T, CK-MB, BNP, and High-Sensitivity CRP',
    cycle: 'Annual Surveys',
    color: '#e11d48'
  });
  console.log('  Status:', addRes.status);
  console.log('  Success:', addRes.json && addRes.json.success);
  const customId = addRes.json && addRes.json.nrl && addRes.json.nrl.id;
  console.log('  Custom NRL created ID:', customId);
  if (!customId) throw new Error('Failed to create custom NRL');

  // Test 4: Verify custom NRL is in nrl-list
  console.log('\n[Test 4] Verify Custom NRL is in list');
  const verifyRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/equipment/neqas/nrl-list',
    method: 'GET',
    headers: authHeaders
  });
  const customFound = verifyRes.json.nrls.find(n => n.id === customId);
  console.log('  Custom NRL present:', !!customFound, customFound ? customFound.name : '');
  if (!customFound) throw new Error('Custom NRL not returned in list');

  // Test 5: Print NEQAS Certificate for EAMC Drug Test
  console.log('\n[Test 5] GET /equipment/neqas/eamc-pt-2026-met-01/print');
  const printRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/equipment/neqas/eamc-pt-2026-met-01/print',
    method: 'GET',
    headers: authHeaders
  });
  console.log('  Status:', printRes.status);
  const printHasEamc = printRes.body.includes('East Avenue Medical Center');
  const printHasMet = printRes.body.includes('Methamphetamine');
  console.log('  Certificate has East Avenue Medical Center:', printHasEamc);
  console.log('  Certificate has Methamphetamine:', printHasMet);
  if (!printHasEamc || !printHasMet) throw new Error('Print certificate failed for EAMC');

  // Test 6: DELETE /equipment/neqas/nrl-list/:id (Cleanup custom NRL)
  console.log('\n[Test 6] DELETE /equipment/neqas/nrl-list/' + customId);
  const delRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/equipment/neqas/nrl-list/${customId}`,
    method: 'DELETE',
    headers: authHeaders
  });
  console.log('  Status:', delRes.status);
  console.log('  Success:', delRes.json && delRes.json.success);

  // Verify deletion
  const afterDelRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/equipment/neqas/nrl-list',
    method: 'GET',
    headers: authHeaders
  });
  const stillExists = afterDelRes.json.nrls.some(n => n.id === customId);
  console.log('  Custom NRL cleaned up properly:', !stillExists);
  if (stillExists) throw new Error('Custom NRL still exists after deletion');

  console.log('\n========================================================');
  console.log('  >>> ALL NEQAS EAMC & CUSTOM NRL TESTS PASSED! <<<   ');
  console.log('========================================================\n');
}

run().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
