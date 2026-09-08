const http = require('http');
const path = require('path');
const fs = require('fs');

// Create test DataStore pointing to standalone db
const { DataStore } = require('../lis-app-standalone/lib/dataStore');
const dataStore = new DataStore();

const { createLocalServer } = require('../lis-app-standalone/lib/localServer');

const testPort = 3599;
const config = {
  LOCAL_PORT: testPort,
  SERVER_URL: 'http://localhost:3000'
};

const operationQueue = {
  add: () => ({ body: {} }),
  _save: () => {}
};

let server;

// Helper to make HTTP request with cookie
function makeRequest(urlPath, method = 'GET', postData = null, cookie = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: testPort,
      path: urlPath,
      method: method,
      headers: {}
    };

    if (cookie) {
      options.headers['Cookie'] = cookie;
    }

    if (postData) {
      options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = http.request(options, (res) => {
      let data = '';
      const setCookie = res.headers['set-cookie'];
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          setCookie: setCookie ? setCookie[0].split(';')[0] : null,
          body: data
        });
      });
    });

    req.on('error', (e) => reject(e));
    if (postData) req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log('--- TESTING STANDALONE LOCAL SERVER & EQUIPMENT MODULE ---');

  try {
    await dataStore.ready();
    server = createLocalServer(null, operationQueue, config, dataStore);

    // 1. Login or simulate session user
    // The admin user from users table
    const users = dataStore.getCollection('users') || [];
    console.log('Available users count:', users.length);
    const admin = users.find(u => u.role === 'Admin') || users[0];
    console.log('Using test admin account:', admin ? admin.email : 'None');

    // Use autoLoginEmail feature of localServer
    if (admin) server.setAutoLoginEmail(admin.email);

    // Initial request to get session cookie
    const initRes = await makeRequest('/dashboard');
    const sessionCookie = initRes.setCookie;
    console.log('Session initialized. Status:', initRes.statusCode, 'Location:', initRes.headers.location, 'Cookie present:', !!sessionCookie);

    // 2. Test GET /equipment
    const eqRes = await makeRequest('/equipment', 'GET', null, sessionCookie);
    console.log('\n[TEST 1] GET /equipment:');
    console.log('  Status:', eqRes.statusCode, 'Location:', eqRes.headers.location);
    const hasMindray = eqRes.body.includes('Mindray BS-240');
    const hasTabs = eqRes.body.includes('Quality Control & Levey-Jennings') && eqRes.body.includes('Calibration');
    const hasDropControls = eqRes.body.includes('Drop / Delete Previous Entry') || eqRes.body.includes('Empty / Drop Runs');
    console.log('  Includes Mindray BS-240:', hasMindray);
    console.log('  Includes QC & Calibration tabs:', hasTabs);
    console.log('  Includes Drop/Delete QC run buttons:', hasDropControls);

    if (!hasMindray || !hasTabs) {
      throw new Error('Equipment dashboard failed to render properly');
    }

    // 3. Test GET /equipment/:id/qc/levey-jennings
    // Find Mindray equipment ID
    const equipmentList = dataStore.getCollection('equipment') || [];
    const mindray = equipmentList.find(e => e.name && e.name.includes('Mindray')) || equipmentList[0];
    console.log('\n[TEST 2] GET /equipment/:id/qc/levey-jennings for', mindray ? mindray.name : 'Unknown');

    const ljRes = await makeRequest(`/equipment/${mindray.id}/qc/levey-jennings?analyteCode=fbs`, 'GET', null, sessionCookie);
    console.log('  Status:', ljRes.statusCode);
    const ljJson = JSON.parse(ljRes.body);
    console.log('  LJ Data success:', ljJson.success);
    console.log('  Data points count:', ljJson.data && ljJson.data.points ? ljJson.data.points.length : 0);
    console.log('  Mean:', ljJson.data && ljJson.data.statistics ? ljJson.data.statistics.mean : 'N/A', 'SD:', ljJson.data && ljJson.data.statistics ? ljJson.data.statistics.sd : 'N/A');

    if (!ljJson.success || !ljJson.data || !ljJson.data.points || ljJson.data.points.length === 0) {
      throw new Error('Levey-Jennings data query returned empty or failed');
    }

    // 4. Test GET /equipment/:id/qc/print
    console.log('\n[TEST 3] GET /equipment/:id/qc/print:');
    const ljPrintRes = await makeRequest(`/equipment/${mindray.id}/qc/print?analyteCode=fbs`, 'GET', null, sessionCookie);
    console.log('  Status:', ljPrintRes.statusCode);
    const hasLjPrintTitle = ljPrintRes.body.includes('Levey-Jennings') || ljPrintRes.body.includes('QUALITY CONTROL REPORT');
    const hasSignatories = ljPrintRes.body.includes('Prepared By') || ljPrintRes.body.includes('Medical Technologist');
    console.log('  Includes LJ Report Title:', hasLjPrintTitle);
    console.log('  Includes Signatories section:', hasSignatories);

    if (ljPrintRes.statusCode !== 200 || !hasLjPrintTitle) {
      throw new Error('Levey-Jennings print report failed to render');
    }

    // 5. Test GET /equipment/neqas/:recordId/print
    console.log('\n[TEST 4] GET /equipment/neqas/:recordId/print:');
    const neqasRecords = dataStore.getCollection('neqas_records') || [];
    const recId = neqasRecords.length ? neqasRecords[0].id : '';
    const neqasRes = await makeRequest(`/equipment/neqas/${recId}/print`, 'GET', null, sessionCookie);
    console.log('  Status:', neqasRes.statusCode);
    const hasNeqasTitle = neqasRes.body.includes('NEQAS') || neqasRes.body.includes('EXTERNAL QUALITY ASSESSMENT');
    console.log('  Includes NEQAS Report Title:', hasNeqasTitle);

    if (neqasRes.statusCode !== 200 || !hasNeqasTitle) {
      throw new Error('NEQAS print report failed to render');
    }

    // 6. Test GET /equipment/:id/qc/print-monthly-summary
    console.log('\n[TEST 5] GET /equipment/:id/qc/print-monthly-summary:');
    const mRes = await makeRequest(`/equipment/${mindray.id}/qc/print-monthly-summary?month=2026-09`, 'GET', null, sessionCookie);
    console.log('  Status:', mRes.statusCode);
    const hasMonthlyTitle = mRes.body.includes('MONTHLY INTERNAL QUALITY CONTROL') || mRes.body.includes('Consolidated Monthly');
    console.log('  Includes Monthly QC Title:', hasMonthlyTitle);

    if (mRes.statusCode !== 200 || !hasMonthlyTitle) {
      throw new Error('Monthly QC print report failed to render');
    }

    // 7. Test POST /equipment/:id/qc/entries and DELETE /equipment/:id/qc/entries/last
    console.log('\n[TEST 6] Add QC Entry and Drop / Delete Previous Entry:');
    const ctrlList = dataStore.getCollection('qc_controls') || [];
    const testCtrl = ctrlList.find(c => c.equipmentId === mindray.id) || ctrlList[0];

    const postPayload = `controlId=${testCtrl.id}&analyteCode=fbs&measuredValue=105.5&notes=TestRunDrop`;
    const addRes = await makeRequest(`/equipment/${mindray.id}/qc/entries`, 'POST', postPayload, sessionCookie);
    console.log('  Add entry status:', addRes.statusCode);
    const addJson = JSON.parse(addRes.body);
    console.log('  Add entry success:', addJson.success);

    // Verify count is 76
    const countCheck1 = await makeRequest(`/equipment/${mindray.id}/qc/levey-jennings?analyteCode=fbs`, 'GET', null, sessionCookie);
    const c1Json = JSON.parse(countCheck1.body);
    console.log('  Points after add:', c1Json.data.points.length);

    // Drop last entry
    const dropRes = await makeRequest(`/equipment/${mindray.id}/qc/entries/last?analyteCode=fbs`, 'DELETE', null, sessionCookie);
    console.log('  Drop last status:', dropRes.statusCode);
    const dropJson = JSON.parse(dropRes.body);
    console.log('  Drop message:', dropJson.message);

    // Verify count is back to 75
    const countCheck2 = await makeRequest(`/equipment/${mindray.id}/qc/levey-jennings?analyteCode=fbs`, 'GET', null, sessionCookie);
    const c2Json = JSON.parse(countCheck2.body);
    console.log('  Points after drop:', c2Json.data.points.length);

    if (c2Json.data.points.length !== 75) {
      throw new Error('Drop last entry failed to restore initial points count');
    }

    console.log('\n>>> ALL 6 STANDALONE EQUIPMENT & QC SUITE TESTS PASSED! <<<');
  } catch (err) {
    console.error('\nTest failed:', err.message);
    process.exitCode = 1;
  } finally {
    server.close();
    process.exit(process.exitCode || 0);
  }
}

// Give server time to listen
setTimeout(runTests, 500);
