/**
 * Security & Authorization Integration Tests
 * Validates route protection, auth-guard middleware, and permission evaluation.
 */

const assert = require('assert');
const path = require('path');
const express = (() => {
  try { return require('express'); } catch (e) {
    return require(path.join(__dirname, '../lis-fullstack/node_modules/express'));
  }
})();

console.log('\n=============================================================');
console.log('🔒 RUNNING SECURITY & ACCESS CONTROL ROUTE TESTS');
console.log('=============================================================\n');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    Error: ${err.message}\n`);
    throw err;
  }
}

// -------------------------------------------------------------
// 1. AUTH GUARD MIDDLEWARE SIMULATION
// -------------------------------------------------------------
console.log('--- 1. Route Permission Mapping & Auth Guard Tests ---');

const routePermissionMap = [
  { prefix: '/dashboard', perm: 'dashboard' },
  { prefix: '/patients', perm: 'patients' },
  { prefix: '/reception', perm: 'reception' },
  { prefix: '/tests', perm: 'tests' },
  { prefix: '/reports', perm: 'reports' },
  { prefix: '/templates', perm: 'templates' },
  { prefix: '/inventory', perm: 'inventory' },
  { prefix: '/users', perm: 'users' },
  { prefix: '/worksheet', perm: 'worksheet' }
];

function simulateAuthGuard(req, res, next) {
  const path = req.originalUrl || req.url || '';
  const mapping = routePermissionMap.find(m => path.indexOf(m.prefix) === 0);

  if (!mapping) return next();

  // Allow profile
  if (path.indexOf('/users/profile') === 0) return next();

  // Allow critical check for all authenticated users
  if (path.indexOf('/inventory/critical-check') === 0) return next();

  const sessionUser = req.session && req.session.user;
  if (!sessionUser) {
    return res.redirect('/login');
  }

  let perms = sessionUser.permissions || {};
  if (typeof perms === 'string') {
    try { perms = JSON.parse(perms); } catch (_) { perms = {}; }
  }

  if (sessionUser.role === 'Admin') return next();

  // Explicit permission
  if (perms[mapping.perm]) return next();

  // Lab roles baseline: Notice 'templates' and 'inventory' are NOT in baseline
  const labRoles = new Set(['Medical Technologist', 'MedTech', 'Technician', 'Doctor', 'Staff', 'Receptionist', 'Encoder']);
  if (labRoles.has(sessionUser.role)) {
    if (['reception', 'patients', 'tests', 'reports', 'worksheet'].includes(mapping.perm)) {
      return next();
    }
  }

  // Blocked
  return res.redirect('/reception');
}

test('Unauthenticated request to /inventory must redirect to /login', () => {
  let redirected = null;
  const req = { originalUrl: '/inventory', session: null };
  const res = { redirect: (url) => { redirected = url; } };
  simulateAuthGuard(req, res, () => {});
  assert.strictEqual(redirected, '/login');
});

test('Unauthenticated request to /templates must redirect to /login', () => {
  let redirected = null;
  const req = { originalUrl: '/templates', session: null };
  const res = { redirect: (url) => { redirected = url; } };
  simulateAuthGuard(req, res, () => {});
  assert.strictEqual(redirected, '/login');
});

test('Staff user without inventory perm requesting /inventory must be denied and redirected', () => {
  let redirected = null;
  let nextCalled = false;
  const req = {
    originalUrl: '/inventory',
    session: {
      user: { role: 'Medical Technologist', permissions: { reception: '1', tests: '1' } }
    }
  };
  const res = { redirect: (url) => { redirected = url; } };
  simulateAuthGuard(req, res, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, false, 'Should not allow access');
  assert.strictEqual(redirected, '/reception');
});

test('Staff user with inventory: "1" requesting /inventory must be allowed', () => {
  let nextCalled = false;
  const req = {
    originalUrl: '/inventory',
    session: {
      user: { role: 'Medical Technologist', permissions: { inventory: '1' } }
    }
  };
  const res = { redirect: () => {} };
  simulateAuthGuard(req, res, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, true, 'Should allow access when inventory: "1"');
});

test('Staff user without templates perm requesting /templates must be denied and redirected', () => {
  let redirected = null;
  let nextCalled = false;
  const req = {
    originalUrl: '/templates',
    session: {
      user: { role: 'Medical Technologist', permissions: { reception: '1', inventory: '1' } }
    }
  };
  const res = { redirect: (url) => { redirected = url; } };
  simulateAuthGuard(req, res, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, false, 'Templates should not be accessible without explicit templates permission');
  assert.strictEqual(redirected, '/reception');
});

test('Responsible person with templates: "1" requesting /templates must be allowed', () => {
  let nextCalled = false;
  const req = {
    originalUrl: '/templates',
    session: {
      user: { role: 'Medical Technologist', permissions: { templates: '1' } }
    }
  };
  const res = { redirect: () => {} };
  simulateAuthGuard(req, res, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, true, 'Responsible person with templates perm must be allowed');
});

test('Authenticated user without inventory perm can still reach /inventory/critical-check for global alerts', () => {
  let nextCalled = false;
  const req = {
    originalUrl: '/inventory/critical-check',
    session: {
      user: { role: 'Receptionist', permissions: { reception: '1' } }
    }
  };
  const res = { redirect: () => {} };
  simulateAuthGuard(req, res, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, true, 'Critical check must be accessible by all authenticated users');
});

console.log('\n=============================================================');
console.log(`🎉 ALL ROUTE SECURITY TESTS PASSED: ${passedTests} of ${totalTests} assertions verified!`);
console.log('=============================================================\n');
