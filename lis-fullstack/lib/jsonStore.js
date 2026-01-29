const fs = require('fs');
const path = require('path');
const lockfile = require('proper-lockfile');
const crypto = require('crypto');

class JSONStore {
  constructor(opts = {}) {
    this.dataDir = opts.dataDir || path.join(__dirname, '..');
    this.usersFile = path.join(this.dataDir, opts.usersFile || 'data-users.json');
    this.labFile = path.join(this.dataDir, opts.labFile || 'data-lab.json');
    this.backupDir = path.join(this.dataDir, opts.backupDir || 'backups');
    this.debounceMs = typeof opts.debounceMs === 'number' ? opts.debounceMs : 200;
    this._pending = new Map();
    this._timers = new Map();
    this.encryptionKey = process.env.DATA_ENCRYPTION_KEY || opts.encryptionKey || null;

    if (!fs.existsSync(this.backupDir)) {
      try { fs.mkdirSync(this.backupDir); } catch (e) {}
    }

    // migrate from single data.json if present and new files missing
    const legacy = path.join(this.dataDir, 'data.json');
    if (fs.existsSync(legacy)) {
      try {
        const raw = fs.readFileSync(legacy, 'utf8');
        const parsed = JSON.parse(raw);
        if (!fs.existsSync(this.usersFile) && parsed.users) {
          fs.writeFileSync(this.usersFile, JSON.stringify(parsed.users, null, 2));
        }
        if (!fs.existsSync(this.labFile)) {
          const lab = {
            patients: parsed.patients || [],
            tests: parsed.tests || [],
            templates: parsed.templates || [],
            counters: parsed.counters || {}
          };
          fs.writeFileSync(this.labFile, JSON.stringify(lab, null, 2));
        }
      } catch (e) {
        // ignore migration errors
      }
    }
  }

  _isEncrypted() {
    return !!this.encryptionKey;
  }

  _encryptBuffer(buf) {
    const key = Buffer.from(this.encryptionKey, 'base64');
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(buf), cipher.final()]);
    const tag = cipher.getAuthTag();
    const wrapper = {
      v: 1,
      alg: 'aes-256-gcm',
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      data: encrypted.toString('base64')
    };
    return Buffer.from(JSON.stringify(wrapper), 'utf8');
  }

  _decryptBuffer(buf) {
    const wrapper = JSON.parse(buf.toString('utf8'));
    if (!wrapper || !wrapper.data) throw new Error('Invalid encrypted payload');
    const key = Buffer.from(this.encryptionKey, 'base64');
    const iv = Buffer.from(wrapper.iv, 'base64');
    const tag = Buffer.from(wrapper.tag, 'base64');
    const data = Buffer.from(wrapper.data, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted;
  }

  _readRaw(filePath) {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath);
    if (this._isEncrypted()) {
      try {
        const dec = this._decryptBuffer(raw);
        return dec.toString('utf8');
      } catch (e) {
        // fail fast
        throw e;
      }
    }
    return raw.toString('utf8');
  }

  _writeAtomic(filePath, contentBuffer) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
    // backup existing file
    if (fs.existsSync(filePath)) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const base = path.basename(filePath);
      const bkp = path.join(this.backupDir, `${base}.${stamp}.bak`);
      try { fs.copyFileSync(filePath, bkp); } catch (e) {}
    }
    fs.writeFileSync(tmp, contentBuffer);
    fs.renameSync(tmp, filePath);
  }

  async _withLock(filePath, fn) {
    const opts = { retries: { retries: 5, factor: 1.5, minTimeout: 50, maxTimeout: 500 } };
    let release;
    try {
      release = await lockfile.lock(filePath, opts);
    } catch (e) {
      // try to create parent dir then lock
      try { fs.writeFileSync(filePath, ''); release = await lockfile.lock(filePath, opts); } catch (e2) {}
    }
    try {
      return await fn();
    } finally {
      try { if (release) await release(); } catch (e) {}
    }
  }

  _scheduleWrite(key, filePath, obj) {
    this._pending.set(key, { filePath, obj });
    if (this._timers.has(key)) return;
    const t = setTimeout(() => {
      this._timers.delete(key);
      const pending = this._pending.get(key);
      this._pending.delete(key);
      this._doWrite(pending.filePath, pending.obj).catch((e) => console.error('jsonStore write failed', e));
    }, this.debounceMs);
    this._timers.set(key, t);
  }

  async _doWrite(filePath, obj) {
    const txt = JSON.stringify(obj, null, 2);
    const buf = Buffer.from(txt, 'utf8');
    const outBuf = this._isEncrypted() ? this._encryptBuffer(buf) : buf;
    // ensure file exists for locking
    if (!fs.existsSync(filePath)) {
      try { fs.writeFileSync(filePath, outBuf); return; } catch (e) {}
    }
    await this._withLock(filePath, async () => {
      this._writeAtomic(filePath, outBuf);
    });
  }

  async _doRead(filePath, defaultValue) {
    if (!fs.existsSync(filePath)) return defaultValue;
    return this._withLock(filePath, async () => {
      const raw = this._readRaw(filePath);
      try {
        return JSON.parse(raw);
      } catch (e) {
        return defaultValue;
      }
    });
  }

  // Public API
  async getUsers() {
    return (await this._doRead(this.usersFile, [])) || [];
  }

  saveUsers(users) {
    this._scheduleWrite('users', this.usersFile, users || []);
  }

  async getLab() {
    return (await this._doRead(this.labFile, { patients: [], tests: [], templates: [], counters: {} })) || { patients: [], tests: [], templates: [], counters: {} };
  }

  saveLab(labObj) {
    const safe = Object.assign({ patients: [], tests: [], templates: [], counters: {} }, labObj || {});
    this._scheduleWrite('lab', this.labFile, safe);
  }

  // Convenience to mimic previous API
  async getPatients() { const lab = await this.getLab(); return lab.patients || []; }
  savePatients(patients) { return this.saveLab(Object.assign({}, { patients })); }
  async getTests() { const lab = await this.getLab(); return lab.tests || []; }
  saveTests(tests) { return this.saveLab(Object.assign({}, { tests })); }
  async getTemplates() { const lab = await this.getLab(); return lab.templates || []; }
  saveTemplates(templates) { return this.saveLab(Object.assign({}, { templates })); }
  async getCounters() { const lab = await this.getLab(); return lab.counters || {}; }
  saveCounters(counters) { return this.saveLab(Object.assign({}, { counters })); }

  // Force flush pending writes synchronously
  async flushAll() {
    const pending = Array.from(this._pending.entries());
    for (const [key, { filePath, obj }] of pending) {
      if (this._timers.has(key)) {
        clearTimeout(this._timers.get(key));
        this._timers.delete(key);
      }
      this._pending.delete(key);
      await this._doWrite(filePath, obj);
    }
  }
}

module.exports = JSONStore;
