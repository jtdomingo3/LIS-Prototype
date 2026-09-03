/**
 * Unit Test: Test Assignment Navigation & ReturnTo Resolution
 * Verifies that assigning tests from Patient list/profile redirects back to Patient,
 * while assigning from Test & Results redirects back to Tests.
 */

const assert = require('assert');

console.log('\n=============================================================');
console.log('🧪 RUNNING UNIT TESTS: Test Assignment Navigation & Redirects');
console.log('=============================================================\n');

function resolveReturnTo(body, query, referer, patientId, host = 'localhost:3000') {
  let returnTo = (body && body.returnTo) || (query && query.returnTo);
  if (!returnTo && referer) {
    try {
      const refUrl = new URL(referer);
      if (refUrl.pathname !== '/tests/new') {
        returnTo = refUrl.pathname + (refUrl.search || '');
      }
    } catch (e) {}
  }

  // Fallback if not specified
  if (!returnTo || returnTo === '/tests/new' || returnTo.startsWith('/tests/new')) {
    returnTo = patientId ? `/patients/${patientId}` : '/tests';
  }

  try {
    if (/^https?:\/\//i.test(returnTo)) {
      const u = new URL(returnTo);
      if (u.host === host && u.pathname !== '/tests/new') {
        returnTo = u.pathname + (u.search || '');
      } else {
        returnTo = patientId ? `/patients/${patientId}` : '/tests';
      }
    } else if (!returnTo.startsWith('/')) {
      try {
        const u = new URL(returnTo, `http://${host}`);
        if (u.pathname !== '/tests/new') {
          returnTo = u.pathname + (u.search || '');
        } else {
          returnTo = patientId ? `/patients/${patientId}` : '/tests';
        }
      } catch (e) {
        returnTo = patientId ? `/patients/${patientId}` : '/tests';
      }
    }
  } catch (e) {
    returnTo = patientId ? `/patients/${patientId}` : '/tests';
  }

  if (returnTo === '/tests/new' || returnTo.startsWith('/tests/new')) {
    returnTo = patientId ? `/patients/${patientId}` : '/tests';
  }

  return returnTo;
}

let total = 0;
let passed = 0;
function test(name, fn) {
  total++;
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${name}: ${e.message}`);
    throw e;
  }
}

test('Assigning test from /patients list should return to /patients', () => {
  const result = resolveReturnTo({ returnTo: '/patients' }, {}, 'http://localhost:3000/patients', 'p-1');
  assert.strictEqual(result, '/patients');
});

test('Assigning test from Patient profile /patients/:id should return to /patients/:id', () => {
  const result = resolveReturnTo({ returnTo: '/patients/p-99' }, {}, 'http://localhost:3000/patients/p-99', 'p-99');
  assert.strictEqual(result, '/patients/p-99');
});

test('Creating test from /tests should return to /tests', () => {
  const result = resolveReturnTo({ returnTo: '/tests' }, {}, 'http://localhost:3000/tests', null);
  assert.strictEqual(result, '/tests');
});

test('When returnTo is missing but patient was assigned, it safely returns to /patients/:id', () => {
  const result = resolveReturnTo({}, {}, 'http://localhost:3000/tests/new?patient=p-42', 'p-42');
  assert.strictEqual(result, '/patients/p-42');
});

test('When returnTo is missing and no patient was specified, it falls back to /tests', () => {
  const result = resolveReturnTo({}, {}, 'http://localhost:3000/tests/new', null);
  assert.strictEqual(result, '/tests');
});

test('Prevent loopback: if returnTo points to /tests/new, return to patient profile or tests', () => {
  const resultWithPatient = resolveReturnTo({ returnTo: '/tests/new' }, {}, null, 'p-100');
  assert.strictEqual(resultWithPatient, '/patients/p-100');

  const resultWithoutPatient = resolveReturnTo({ returnTo: '/tests/new' }, {}, null, null);
  assert.strictEqual(resultWithoutPatient, '/tests');
});

console.log('\n=============================================================');
console.log(`🎉 ALL NAVIGATION TESTS PASSED: ${passed} of ${total} assertions verified!`);
console.log('=============================================================\n');
