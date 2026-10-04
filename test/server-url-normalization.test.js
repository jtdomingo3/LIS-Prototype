const assert = require('assert');
const { normalizeServerUrl } = require('../lis-app-standalone/lib/serverUrl');

describe('Standalone Server URL Normalization & Validation', function() {
  it('normalizes IP with port missing protocol to http://', function() {
    const res = normalizeServerUrl('192.168.1.209:3000');
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.url, 'http://192.168.1.209:3000');
  });

  it('removes trailing slashes from URLs', function() {
    const res = normalizeServerUrl('http://192.168.1.209:3000/');
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.url, 'http://192.168.1.209:3000');
  });

  it('handles HTTPS domain names with subpaths', function() {
    const res = normalizeServerUrl('https://lis.myclinic.ph/app///');
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.url, 'https://lis.myclinic.ph/app');
  });

  it('handles empty input cleanly for offline mode', function() {
    const res = normalizeServerUrl('');
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.url, '');

    const resWhitespace = normalizeServerUrl('   ');
    assert.strictEqual(resWhitespace.ok, true);
    assert.strictEqual(resWhitespace.url, '');
  });

  it('rejects unsupported protocols', function() {
    const res = normalizeServerUrl('ftp://192.168.1.209:21');
    assert.strictEqual(res.ok, false);
    assert.ok(res.error.includes('Only http:// and https:// URLs are supported'));
  });

  it('trims leading and trailing whitespace', function() {
    const res = normalizeServerUrl('   http://localhost:3000   ');
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.url, 'http://localhost:3000');
  });
});
