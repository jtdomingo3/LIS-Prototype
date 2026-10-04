/**
 * serverUrl.js — Centralized normalization and validation for remote LIS server URLs.
 */

function normalizeServerUrl(input) {
  if (!input || !String(input).trim()) {
    return { ok: true, url: '' };
  }

  let raw = String(input).trim();
  // Check if a protocol scheme is present
  const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//i.test(raw);
  if (hasScheme) {
    if (!/^https?:\/\//i.test(raw)) {
      return { ok: false, url: '', error: 'Only http:// and https:// URLs are supported.' };
    }
  } else {
    if (raw.startsWith('//')) {
      raw = 'http:' + raw;
    } else {
      raw = 'http://' + raw;
    }
  }

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, url: '', error: 'Only http:// and https:// URLs are supported.' };
    }
    if (!parsed.hostname) {
      return { ok: false, url: '', error: 'Server URL must contain a valid hostname or IP address.' };
    }
    // Clean up origin and pathname (remove trailing slashes)
    const pathname = (parsed.pathname === '/' || !parsed.pathname) ? '' : parsed.pathname.replace(/\/+$/, '');
    const normalized = `${parsed.protocol}//${parsed.host}${pathname}`;
    return { ok: true, url: normalized };
  } catch (err) {
    return { ok: false, url: '', error: `Invalid server URL: ${err.message}` };
  }
}

module.exports = {
  normalizeServerUrl
};
