/**
 * lis-app-standalone — Configuration
 *
 * Edit SERVER_URL to point to your LIS server's address.
 * LOCAL_PORT is used for the offline cache server (runs on localhost).
 */
module.exports = {
  // ── Remote LIS server
  // NOTE: No default is provided here; the standalone app requires an
  // explicit `serverUrl` to be configured by the user via Settings.
  // The app will not attempt to auto-connect when this value is empty.
  SERVER_URL: '',

  // ── Local offline server ───────────────────────────────────────────
  LOCAL_PORT: 30099,

  // ── Network monitor ────────────────────────────────────────────────
  // How often (ms) to ping the server to detect online/offline
  PING_INTERVAL: 5000,

  // ── Sync ───────────────────────────────────────────────────────────
  // Maximum retry attempts for each queued operation
  MAX_SYNC_RETRIES: 3,
};
