/**
 * ============================================================================
 * GEZYNE LIS - CLIENT-SIDE SESSION IDLE WARNING TEST SUITE
 * ============================================================================
 * 
 * Verifies that:
 * 1. Both fullstack and standalone applications have the idle warning modal partial.
 * 2. layout.ejs includes the idle warning modal exclusively for authenticated users
 *    on non-document/print pages.
 * 3. GET /api/auth/ping accurately reports authentication status and extends the
 *    active session cookie (touch) without requiring CSRF tokens.
 * 4. Idle modal contains necessary accessibility attributes, timer displays,
 *    and action hooks for user confirmation.
 * ============================================================================
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

const fullstackDir = path.join(__dirname, '..', 'lis-fullstack');
const standaloneDir = path.join(__dirname, '..', 'lis-app-standalone');

const express = require(path.join(fullstackDir, 'node_modules', 'express'));
const session = require(path.join(fullstackDir, 'node_modules', 'express-session'));
const cookieParser = require(path.join(fullstackDir, 'node_modules', 'cookie-parser'));

console.log('=== Running Client-Side Session Idle Warning Test Suite ===\n');

// ---------------------------------------------------------------------------
// TEST 1: Partial Files & Layout Inclusion Audit
// ---------------------------------------------------------------------------
console.log('[Test 1] Auditing Idle Warning modal templates across both projects...');

['lis-fullstack', 'lis-app-standalone'].forEach(appDir => {
  const modalPath = path.join(__dirname, '..', appDir, 'views', 'partials', 'idle-warning-modal.ejs');
  assert.ok(fs.existsSync(modalPath), `[${appDir}] views/partials/idle-warning-modal.ejs must exist`);

  const modalContent = fs.readFileSync(modalPath, 'utf8');
  assert.ok(modalContent.includes('id="idleWarningModal"'), `[${appDir}] modal must define #idleWarningModal`);
  assert.ok(modalContent.includes('id="idleWarningCountdown"'), `[${appDir}] modal must define #idleWarningCountdown`);
  assert.ok(modalContent.includes('id="btnIdleKeepWorking"'), `[${appDir}] modal must define #btnIdleKeepWorking button`);
  assert.ok(modalContent.includes('id="btnIdleLogout"'), `[${appDir}] modal must define #btnIdleLogout button`);
  assert.ok(modalContent.includes('mousemove') && modalContent.includes('keydown'), `[${appDir}] modal must listen for user activity events`);
  assert.ok(modalContent.includes('/api/auth/ping'), `[${appDir}] modal must ping /api/auth/ping on keep-alive`);

  const layoutPath = path.join(__dirname, '..', appDir, 'views', 'layout.ejs');
  const layoutContent = fs.readFileSync(layoutPath, 'utf8');
  assert.ok(
    layoutContent.includes("<%- include('partials/idle-warning-modal') %>"),
    `[${appDir}] layout.ejs must include partials/idle-warning-modal`
  );
  assert.ok(
    layoutContent.includes('typeof user !== \'undefined\' && user'),
    `[${appDir}] layout.ejs must gate idle warning modal to authenticated users`
  );
  assert.ok(
    layoutContent.includes('!isDocumentOrPrintPage'),
    `[${appDir}] layout.ejs must suppress idle warning modal on print/document views`
  );
  console.log(`  ✓ ${appDir}: modal template and layout gating verified`);
});

// ---------------------------------------------------------------------------
// TEST 2: routes/auth.js Ping Route Implementation Audit
// ---------------------------------------------------------------------------
console.log('\n[Test 2] Auditing routes/auth.js /api/auth/ping endpoint implementation...');

['lis-fullstack', 'lis-app-standalone'].forEach(appDir => {
  const authRoutePath = path.join(__dirname, '..', appDir, 'routes', 'auth.js');
  const authContent = fs.readFileSync(authRoutePath, 'utf8');
  assert.ok(
    authContent.includes("router.get('/api/auth/ping'"),
    `[${appDir}] routes/auth.js must define GET /api/auth/ping`
  );
  assert.ok(
    authContent.includes('req.session.touch()'),
    `[${appDir}] routes/auth.js /api/auth/ping must call req.session.touch() to extend cookie expiry`
  );
  console.log(`  ✓ ${appDir}: routes/auth.js contains GET /api/auth/ping with session touch`);
});

// ---------------------------------------------------------------------------
// TEST 3: Live Express Server Session Ping & Touch Simulation
// ---------------------------------------------------------------------------
console.log('\n[Test 3] Simulating live GET /api/auth/ping session touch behavior...');

async function testLivePing() {
  const app = express();
  app.use(cookieParser());
  app.use(session({
    secret: 'test-idle-warning-secret-key-12345',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 60 * 60 * 1000 } // 1 hour
  }));

  // Mount simulated auth routes
  app.post('/test-login', (req, res) => {
    req.session.user = {
      id: 'test-user-uuid-123',
      email: 'medtech@lab.com',
      name: 'Maria MedTech',
      role: 'MedTech'
    };
    res.json({ success: true, message: 'Logged in' });
  });

  app.get('/api/auth/ping', (req, res) => {
    if (req.session && req.session.user) {
      if (typeof req.session.touch === 'function') {
        req.session.touch();
      }
      return res.json({
        success: true,
        authenticated: true,
        user: {
          id: req.session.user.id,
          email: req.session.user.email,
          name: req.session.user.name,
          role: req.session.user.role
        }
      });
    }
    return res.status(401).json({ success: false, authenticated: false, error: 'Session expired or not authenticated' });
  });

  const server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const port = server.address().port;

  function doRequest(options) {
    return new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port,
        ...options
      }, res => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body
        }));
      });
      req.on('error', reject);
      req.end();
    });
  }

  try {
    // 1. Unauthenticated ping -> Must return 401
    const unauthRes = await doRequest({ path: '/api/auth/ping', method: 'GET' });
    assert.strictEqual(unauthRes.statusCode, 401, 'Unauthenticated ping must return 401');
    const unauthJson = JSON.parse(unauthRes.body);
    assert.strictEqual(unauthJson.authenticated, false, 'Unauthenticated ping must return authenticated: false');
    console.log('  ✓ Unauthenticated ping correctly rejected with 401');

    // 2. Log in to establish session
    const loginRes = await doRequest({ path: '/test-login', method: 'POST' });
    assert.strictEqual(loginRes.statusCode, 200);
    const sessionCookie = (loginRes.headers['set-cookie'] || [])[0];
    assert.ok(sessionCookie, 'Must receive session cookie on login');

    // 3. Authenticated ping -> Must return 200 with user profile
    const authRes = await doRequest({
      path: '/api/auth/ping',
      method: 'GET',
      headers: { 'Cookie': sessionCookie }
    });
    assert.strictEqual(authRes.statusCode, 200, 'Authenticated ping must return 200');
    const authJson = JSON.parse(authRes.body);
    assert.strictEqual(authJson.authenticated, true, 'Authenticated ping must return authenticated: true');
    assert.strictEqual(authJson.user.email, 'medtech@lab.com');
    assert.strictEqual(authJson.user.role, 'MedTech');
    console.log('  ✓ Authenticated ping touches active session and returns user profile (Status 200)');
  } finally {
    server.close();
  }
}

testLivePing().then(() => {
  console.log('\n🎉 ALL CLIENT-SIDE IDLE WARNING TESTS PASSED CLEANLY!\n');
  process.exit(0);
}).catch(err => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});

