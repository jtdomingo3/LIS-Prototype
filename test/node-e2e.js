const http = require('http');
const { getTestCredentials } = require('./test-auth-config');

async function testFlow(port, isFullstack, credentials) {
  console.log(`\n=== Testing ${isFullstack ? 'Fullstack' : 'Standalone'} (Port ${port}) ===`);
  
  try {
    let sessionCookie = '';
    let csrfToken = '';

    // 1. GET /login to get cookie and CSRF
    const res1 = await new Promise((resolve) => {
      http.get(`http://127.0.0.1:${port}/login`, (res) => {
        let cookies = res.headers['set-cookie'];
        if (Array.isArray(cookies)) {
          sessionCookie = cookies[0].split(';')[0];
        }
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve({ status: res.statusCode, data }));
      });
    });

    if (isFullstack) {
      const match = res1.data.match(/name="_csrf" value="([^"]+)"/);
      if (match) {
        csrfToken = match[1];
        console.log(`[${port}] Obtained CSRF token.`);
      } else {
        console.log(`❌ [${port}] Could not find CSRF token on login page.`);
      }
    }

    // 2. POST /login
    const loginData = `email=${encodeURIComponent(credentials.email)}&password=${encodeURIComponent(credentials.password)}` + (isFullstack ? `&_csrf=${encodeURIComponent(csrfToken)}` : '');
    const res2 = await new Promise((resolve) => {
      const req = http.request(`http://127.0.0.1:${port}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(loginData),
          'Cookie': sessionCookie
        }
      }, (res) => {
        let cookies = res.headers['set-cookie'];
        if (Array.isArray(cookies)) {
          sessionCookie = cookies[0].split(';')[0];
        }
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve({ status: res.statusCode, location: res.headers.location }));
      });
      req.write(loginData);
      req.end();
    });

    if (res2.location === '/' || res2.location === undefined) {
      console.log(`❌ [${port}] Login failed. Status: ${res2.status}, Location: ${res2.location}`);
      return;
    } else {
      console.log(`✅ [${port}] Login successful! Redirected to: ${res2.location}`);
    }

    // 3. GET /patients
    const res3 = await new Promise((resolve) => {
      http.get(`http://127.0.0.1:${port}/patients`, {
        headers: { 'Cookie': sessionCookie }
      }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve({ status: res.statusCode, data }));
      });
    });

    if (res3.status === 200 && (res3.data.includes('Patient Management') || res3.data.includes('Total Patients'))) {
      console.log(`✅ [${port}] Patients page loaded.`);
    } else {
      console.log(`❌ [${port}] Patients page failed. Status: ${res3.status}`);
    }

    // 4. GET /tests
    const res4 = await new Promise((resolve) => {
      http.get(`http://127.0.0.1:${port}/tests`, {
        headers: { 'Cookie': sessionCookie }
      }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve({ status: res.statusCode, data }));
      });
    });

    if (res4.status === 200 && (res4.data.includes('All Diagnostic Tests') || res4.data.includes('Completed & Released'))) {
      console.log(`✅ [${port}] Tests page loaded.`);
    } else {
      console.log(`❌ [${port}] Tests page failed. Status: ${res4.status}`);
    }
    
    // 5. GET /reports
    const res5 = await new Promise((resolve) => {
      http.get(`http://127.0.0.1:${port}/reports`, {
        headers: { 'Cookie': sessionCookie }
      }, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve({ status: res.statusCode, data }));
      });
    });

    if ((res5.status === 200 && (res5.data.includes('Report') || res5.data.includes('Preview'))) || res5.status === 302) {
      console.log(`✅ [${port}] Reports page loaded (or redirected to preview).`);
    } else {
      console.log(`❌ [${port}] Reports page failed. Status: ${res5.status}`);
    }

  } catch (e) {
    console.log(`❌ [${port}] Test exception:`, e.message);
  }
}

(async () => {
  const credentials = getTestCredentials();
  await testFlow(3000, true, credentials);
  await testFlow(30099, false, credentials);
})();
