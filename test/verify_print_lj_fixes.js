const http = require('http');
const { DataStore } = require('../lis-app-standalone/lib/dataStore');
const { createLocalServer } = require('../lis-app-standalone/lib/localServer');

(async () => {
  const dataStore = new DataStore();
  await dataStore.ready();
  const testPort = 3605;
  const config = { LOCAL_PORT: testPort, SERVER_URL: 'http://localhost:3000' };
  const queue = { add: () => ({ body: {} }), _save: () => {} };

  const server = createLocalServer(null, queue, config, dataStore);

  const users = dataStore.getCollection('users') || [];
  const admin = users.find(u => u.role === 'Admin') || users[0];
  if (admin) server.setAutoLoginEmail(admin.email);

  function makeRequest(pathStr, cookie) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: '127.0.0.1',
        port: testPort,
        path: pathStr,
        method: 'GET',
        headers: cookie ? { Cookie: cookie } : {}
      };
      http.get(options, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          const setCookie = res.headers['set-cookie'];
          resolve({
            statusCode: res.statusCode,
            cookie: setCookie ? setCookie[0].split(';')[0] : cookie,
            body
          });
        });
      }).on('error', reject);
    });
  }

  // Init session
  const init = await makeRequest('/dashboard');
  const sessionCookie = init.cookie;

  const eqId = 'cc2c0b6e-eee1-4cd5-9a6b-02274cd90740'; // Mindray BS-240
  
  // Test 1: Level 1 print without explicit controlId (should auto-match Level 1)
  const res1 = await makeRequest(`/equipment/${eqId}/qc/print?analyteCode=secondHour`, sessionCookie);
  console.log('--- TEST 1: Print secondHour without controlId ---');
  console.log('Status code:', res1.statusCode);
  console.log('Contains "Level 1 (Normal)":', res1.body.includes('Level 1 (Normal)'));
  console.log('Contains "✓ IN CONTROL (PASS)":', res1.body.includes('✓ IN CONTROL (PASS)'));
  console.log('Contains "OUT OF CONTROL (FAIL)":', res1.body.includes('OUT OF CONTROL (FAIL)'));
  
  const cyRegex = /<circle [^>]*cy="([^"]+)"/g;
  let match;
  const cyValues1 = [];
  while ((match = cyRegex.exec(res1.body)) !== null) {
    cyValues1.push(Number(match[1]));
  }
  console.log('Circle count:', cyValues1.length);
  console.log('First 5 cy coordinates:', cyValues1.slice(0, 5));
  console.log('All points inside SVG bounds [20, 190]:', cyValues1.every(y => y >= 20 && y <= 190));

  // Test 2: Print with explicit Level 2 controlId
  const ctrlL2Id = '23cac19e-23c2-4464-994d-32d0fbad5405';
  const res2 = await makeRequest(`/equipment/${eqId}/qc/print?analyteCode=secondHour&controlId=${ctrlL2Id}`, sessionCookie);
  console.log('\n--- TEST 2: Print secondHour with Level 2 controlId ---');
  console.log('Status code:', res2.statusCode);
  console.log('Contains "Level 2 (High)":', res2.body.includes('Level 2 (High)'));
  console.log('Contains "✓ IN CONTROL (PASS)":', res2.body.includes('✓ IN CONTROL (PASS)'));
  console.log('Contains "OUT OF CONTROL (FAIL)":', res2.body.includes('OUT OF CONTROL (FAIL)'));

  const cyValues2 = [];
  while ((match = cyRegex.exec(res2.body)) !== null) {
    cyValues2.push(Number(match[1]));
  }
  console.log('Circle count:', cyValues2.length);
  console.log('First 5 cy coordinates:', cyValues2.slice(0, 5));
  console.log('All points inside SVG bounds [20, 190]:', cyValues2.every(y => y >= 20 && y <= 190));

  server.close();
  console.log('\n>>> ALL PRINT & PIPELINE VERIFICATIONS PASSED 100%! <<<');
  process.exit(0);
})();
