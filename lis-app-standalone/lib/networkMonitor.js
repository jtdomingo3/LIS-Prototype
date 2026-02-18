/**
 * NetworkMonitor — Pings the LIS server to detect online/offline status.
 *
 * Emits:
 *   'status-change'  (online: boolean)   – only when status flips
 *   'check'          (online: boolean)   – every ping
 */
const EventEmitter = require('events');
const http = require('http');

class NetworkMonitor extends EventEmitter {
  constructor(serverUrl, interval = 5000) {
    super();
    this.serverUrl = serverUrl;
    this.interval = interval;
    this.timer = null;
    this._wasOnline = null;         // null = unknown
  }

  /* ── single probe ─────────────────────────────────────────────── */
  check() {
    return new Promise((resolve) => {
      try {
        const url = new URL(this.serverUrl);
        const req = http.request(
          {
            hostname: url.hostname,
            port: url.port || 80,
            path: '/',
            method: 'HEAD',
            timeout: 3000,
          },
          () => resolve(true),
        );
        req.on('error', () => resolve(false));
        req.on('timeout', () => { req.destroy(); resolve(false); });
        req.end();
      } catch {
        resolve(false);
      }
    });
  }

  /** One-shot check that also updates internal state */
  async checkOnce() {
    const online = await this.check();
    if (this._wasOnline !== online) {
      this._wasOnline = online;
      this.emit('status-change', online);
    }
    return online;
  }

  /* ── start polling ────────────────────────────────────────────── */
  start() {
    // immediate check
    this.checkOnce();
    this.timer = setInterval(() => this.checkOnce(), this.interval);
  }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  get isOnline() { return this._wasOnline === true; }
}

module.exports = { NetworkMonitor };
