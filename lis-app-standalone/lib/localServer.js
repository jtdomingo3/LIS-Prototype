/**
 * LocalServer — A tiny Express server on localhost that serves cached pages
 *               and queues form submissions when the app is offline.
 *
 * When a user is offline:
 *   GET  /* → serve cached HTML for the requested path
 *   POST /* → queue the operation, redirect back with a success banner
 */
const express = require('express');
const path = require('path');

function createLocalServer(pageCache, operationQueue, config, dataStore) {
  const app = express();

  // Body parsers (same as the real server)
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());

  /* ────────────────────────────────────────────────────────────────
   * POST / PUT / DELETE — Queue the mutation and redirect back
   * ──────────────────────────────────────────────────────────────── */
  const handleMutation = (req, res) => {
    // NEVER intercept auth routes — redirect them to the real server
    if (req.path === '/login' || req.path === '/logout' || req.path === '/') {
      if (config.SERVER_URL) return res.redirect(config.SERVER_URL + req.originalUrl);
      // No server configured — respond with service unavailable so client stays local
      return res.status(503).send('Server not configured');
    }

    // Build the real server URL this operation should eventually hit
    const serverUrl = config.SERVER_URL ? `${config.SERVER_URL}${req.originalUrl}` : req.originalUrl;

    operationQueue.add({
      method: req.query._method || req.method,
      url: serverUrl,
      body: req.body || {},
      timestamp: new Date().toISOString(),
    });

    // Redirect back to the referring page (or home) with a notification flag
    const referer = req.get('Referer') || '/';
    let refPath = '/';
    try { refPath = new URL(referer).pathname; } catch { refPath = '/'; }

    res.redirect(`${refPath}?offline_queued=1`);
  };

  app.post('*', handleMutation);
  app.put('*', handleMutation);
  app.delete('*', handleMutation);

  /* ────────────────────────────────────────────────────────────────
   * GET — Serve cached pages
   * ──────────────────────────────────────────────────────────────── */
  // Lightweight API shim: serve JSON from the DataStore when available.
  // This enables the renderer to fetch lists and single records while
  // offline (the UI expects standard API endpoints like `/patients`).
  if (dataStore) {
    app.get('/export/data.json', (req, res) => {
      try {
        const out = {
          users: dataStore.getCollection('users') || [],
          patients: dataStore.getCollection('patients') || [],
          tests: dataStore.getCollection('tests') || [],
          templates: dataStore.getCollection('templates') || [],
          counters: dataStore.getCollection('counters') || {},
        };
        return res.json(out);
      } catch (e) { return res.status(500).send('datastore-error'); }
    });

    app.get('/patients', (req, res) => res.json(dataStore.getCollection('patients') || []));
    app.get('/patients/:id', (req, res) => {
      const id = req.params.id;
      const pt = (dataStore.getCollection('patients') || []).find(p => p.id === id || p.patientId === id);
      if (!pt) return res.status(404).send('not found');
      return res.json(pt);
    });

    app.get('/users', (req, res) => res.json(dataStore.getCollection('users') || []));
    app.get('/users/:id', (req, res) => {
      const u = (dataStore.getCollection('users') || []).find(x => x.id === req.params.id);
      if (!u) return res.status(404).send('not found');
      return res.json(u);
    });
  }

  app.get('*', (req, res) => {
    // Strip the offline_queued flag for cache lookup
    const lookupPath = req.path;
    let html = pageCache.get(lookupPath);

    if (!html) {
      // Fallback: try common variations (with/without trailing slash)
      html = pageCache.get(lookupPath.replace(/\/$/, ''))
          || pageCache.get(lookupPath + '/');
    }

    if (html) {
      // Rewrite static asset URLs to point to the real server so Electron's
      // HTTP cache can serve them (images, CSS, JS, fonts). Only rewrite
      // when a real server is configured; otherwise keep local paths.
      if (config.SERVER_URL) {
        html = html.replace(
          /(<(?:img|script|source|video|audio)[^>]*\s+src=["'])\/(?!\/)/gi,
          `$1${config.SERVER_URL}/`,
        );
        html = html.replace(
          /(<link[^>]*\s+href=["'])\/(?!\/)/gi,
          `$1${config.SERVER_URL}/`,
        );
      }

      // If the user just performed an offline action, inject a success banner
      if (req.query.offline_queued === '1') {
        const pendingCount = operationQueue.countPending();
        const banner = `
<div id="lis-offline-toast"
     style="position:fixed;top:0;left:0;right:0;padding:14px 20px;
            background:linear-gradient(90deg,#f59e0b,#d97706);color:#fff;
            text-align:center;z-index:999999;font-family:'Segoe UI',sans-serif;
            font-size:14px;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,.25);
            display:flex;align-items:center;justify-content:center;gap:8px;">
  <span style="font-size:18px;">&#9888;</span>
  Saved offline — will sync when connection is restored.
  <span style="background:rgba(255,255,255,.25);padding:2px 10px;border-radius:10px;font-size:12px;">
    ${pendingCount} pending
  </span>
  <button onclick="this.parentElement.remove()"
          style="margin-left:auto;background:none;border:none;color:#fff;
                 font-size:20px;cursor:pointer;line-height:1;">&times;</button>
</div>
<script>setTimeout(function(){var t=document.getElementById('lis-offline-toast');if(t)t.remove();},6000);</script>`;
        html = html.replace(/<body[^>]*>/i, (match) => match + banner);
      }

      res.type('html').send(html);
    } else {
      // No cache — show the offline fallback page
      res.sendFile(path.join(__dirname, '..', 'renderer', 'offline.html'));
    }
  });

  /* ────────────────────────────────────────────────────────────────
   * Start listening (only on loopback)
   * ──────────────────────────────────────────────────────────────── */
  const server = app.listen(config.LOCAL_PORT, '127.0.0.1', () => {
    console.log(`[LocalServer] offline cache server on http://127.0.0.1:${config.LOCAL_PORT}`);
  });

  // Graceful error handling (port in use, etc.)
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[LocalServer] port ${config.LOCAL_PORT} in use — retrying on ${config.LOCAL_PORT + 1}`);
      config.LOCAL_PORT++;
      server.listen(config.LOCAL_PORT, '127.0.0.1');
    } else {
      console.error('[LocalServer] error:', err);
    }
  });

  return server;
}

module.exports = { createLocalServer };
