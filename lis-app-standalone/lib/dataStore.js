const fs = require('fs');
const path = require('path');
const os = require('os');

class DataStore {
  constructor(baseDir) {
    // default to Documents/LIS/app-sync (hyphen) for clarity; accept existing app_sync too
    const homedir = (os.homedir ? os.homedir() : process.env.USERPROFILE || '');
    const preferred = path.join(homedir, 'Documents', 'LIS', 'app-sync');
    const alt = path.join(homedir, 'Documents', 'LIS', 'app_sync');
    if (!baseDir) {
      if (fs.existsSync(preferred)) baseDir = preferred;
      else if (fs.existsSync(alt)) baseDir = alt;
      else baseDir = preferred;
    }
    this.baseDir = baseDir;
    this.filePath = path.join(this.baseDir, 'data.json');
    try { if (!fs.existsSync(this.baseDir)) fs.mkdirSync(this.baseDir, { recursive: true }); } catch (e) {}
    // ensure alternate path also exists for compatibility
    try { if (!fs.existsSync(alt)) fs.mkdirSync(alt, { recursive: true }); } catch (e) {}
    this._data = this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) return JSON.parse(fs.readFileSync(this.filePath, 'utf8') || '{}');
    } catch (e) { console.error('[DataStore] load error:', e && e.message); }
    return { __meta: { lastFullSync: null }, users: [], patients: [], tests: [], templates: [], counters: {} };
  }

  _save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this._data, null, 2), 'utf8');
    } catch (e) { console.error('[DataStore] save error:', e && e.message); }
  }

  getAll() { return this._data; }

  getCollection(name) { return Array.isArray(this._data[name]) ? this._data[name] : []; }

  setCollection(name, items) { this._data[name] = Array.isArray(items) ? items : []; this._save(); }

  mergeCollection(name, items, idKey = 'id') {
    if (!Array.isArray(items)) return;
    const dest = this.getCollection(name).slice();
    const map = new Map(dest.map(i => [String(i[idKey]), i]));
    for (const it of items) {
      if (!it || !it[idKey]) continue;
      map.set(String(it[idKey]), it);
    }
    const merged = Array.from(map.values());
    this._data[name] = merged;
    this._save();
  }

  setMeta(key, val) { if (!this._data.__meta) this._data.__meta = {}; this._data.__meta[key] = val; this._save(); }
  getMeta(key) { return this._data.__meta ? this._data.__meta[key] : undefined; }
  info() {
    try {
      const exists = fs.existsSync(this.filePath);
      const stat = exists ? fs.statSync(this.filePath) : null;
      return { baseDir: this.baseDir, filePath: this.filePath, exists, size: stat ? stat.size : 0, lastFullSync: this.getMeta('lastFullSync') };
    } catch (e) {
      return { baseDir: this.baseDir, filePath: this.filePath, exists: false, size: 0, error: e && e.message };
    }
  }
}

module.exports = { DataStore };
