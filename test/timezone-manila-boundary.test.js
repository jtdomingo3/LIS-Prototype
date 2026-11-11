const assert = require('assert');
const { toManilaDateString, getTodayManilaString, isSameManilaDay } = require('../lis-fullstack/lib/dateHelper');

console.log('--- Running Timezone Manila Boundary Tests ---');

// Test 1: Morning hour in Manila (7:30 AM on Nov 11) is Nov 10 23:30 UTC
const morningUtc = '2026-11-10T23:30:00.000Z';
const morningDateStr = toManilaDateString(morningUtc);
console.log('Morning UTC 23:30 -> Manila Date:', morningDateStr);
assert.strictEqual(morningDateStr, '2026-11-11', 'Morning shift timestamp must resolve to Nov 11 in Manila');

// Test 2: Standard raw toISOString().slice(0, 10) fails this check (proves the root cause)
const rawUtcDate = new Date(morningUtc).toISOString().slice(0, 10);
assert.strictEqual(rawUtcDate, '2026-11-10', 'Raw UTC date would incorrectly be Nov 10');
assert.notStrictEqual(rawUtcDate, morningDateStr, 'Demonstrates that raw UTC caused morning patients to disappear');

// Test 3: Late night hour in Manila (11:30 PM on Nov 11) is Nov 11 15:30 UTC
const nightUtc = '2026-11-11T15:30:00.000Z';
const nightDateStr = toManilaDateString(nightUtc);
console.log('Night UTC 15:30 -> Manila Date:', nightDateStr);
assert.strictEqual(nightDateStr, '2026-11-11', 'Late night timestamp must resolve to Nov 11 in Manila');

// Test 4: Same day comparison
assert.ok(isSameManilaDay(morningUtc, nightUtc), 'Morning and night on same Manila date must evaluate as same day');

// Test 5: Across midnight comparison
const nextDayMorningUtc = '2026-11-11T23:30:00.000Z'; // Nov 12 7:30 AM
assert.ok(!isSameManilaDay(morningUtc, nextDayMorningUtc), 'Different Manila days must not match');

console.log('All Timezone Manila Boundary Tests Passed!\n');

