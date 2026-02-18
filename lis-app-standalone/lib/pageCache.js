/**
 * PageCache — Stores rendered HTML pages on disk so they can be served
 *             offline by the local Express server.
 *
 * Each URL path is hashed and stored as {hash}.html inside `cacheDir`.
 * An index.json keeps the URL→filename mapping + metadata.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class PageCache {
  constructor(cacheDir) {
    this.cacheDir = cacheDir;
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
    this.indexFile = path.join(cacheDir, 'index.json');
    this.index = this._loadIndex();
  }

  /* ── private helpers ──────────────────────────────────────────── */
  _loadIndex() {
    try {
      if (fs.existsSync(this.indexFile))
        return JSON.parse(fs.readFileSync(this.indexFile, 'utf8'));
    } catch { /* corrupt index – start fresh */ }
    return {};
  }

  _saveIndex() {
    try {
      fs.writeFileSync(this.indexFile, JSON.stringify(this.index, null, 2));
    } catch (e) { console.error('[PageCache] save index error:', e); }
  }

  _hash(urlPath) {
    return crypto.createHash('md5').update(urlPath).digest('hex');
  }

  /* ── public API ───────────────────────────────────────────────── */

  /** Cache the full HTML returned by the server for `urlPath`. */
  store(urlPath, html) {
    try {
      if (!html || html.length < 200) return;   // skip error stubs

      const filename = this._hash(urlPath) + '.html';
      fs.writeFileSync(path.join(this.cacheDir, filename), html, 'utf8');
      this.index[urlPath] = {
        filename,
        cachedAt: new Date().toISOString(),
        size: html.length,
      };
      this._saveIndex();
    } catch (e) { console.error('[PageCache] store error:', e); }
  }

  /** Retrieve cached HTML for a URL path (or null). */
  get(urlPath) {
    try {
      let entry = this.index[urlPath];
      // fallback: try without query string
      if (!entry && urlPath.includes('?')) {
        entry = this.index[urlPath.split('?')[0]];
      }
      if (entry) {
        const filePath = path.join(this.cacheDir, entry.filename);
        if (fs.existsSync(filePath)) return fs.readFileSync(filePath, 'utf8');
      }
    } catch (e) { console.error('[PageCache] get error:', e); }
    return null;
  }

  has(urlPath) {
    return !!this.index[urlPath];
  }

  /** List all cached pages (for debugging / status). */
  list() {
    return Object.keys(this.index).map(p => ({ urlPath: p, ...this.index[p] }));
  }

  clear() {
    try {
      for (const entry of Object.values(this.index)) {
        const f = path.join(this.cacheDir, entry.filename);
        if (fs.existsSync(f)) fs.unlinkSync(f);
      }
      this.index = {};
      this._saveIndex();
    } catch (e) { console.error('[PageCache] clear error:', e); }
  }
}

module.exports = { PageCache };
