# lis-app-standalone

**Independent Desktop Workstation Client for Gezyne Clinical Laboratory LIS** with Local-First SQLite Database and Automatic Two-Way Central Synchronization.

The standalone desktop application is a **100% independent, local-first workstation**. The UI is served entirely by an embedded local Express engine backed by a local SQLite database (`lis-data.db`).

- ⚡ **Local-First UI**: Instant responsiveness, zero lag, full offline functionality without server dependency.
- 💾 **SQLite Storage (`lis-data.db`)**: High-performance local storage for patients, multi-department tests, and reception queues.
- 🔄 **Auto-Sync Engine**: Background push of offline queued mutations and background pull of central database snapshots.
- 🏥 **Reception Multi-Station Pipeline**: Offline progression across Payment, Extraction, Imaging (X-ray/Ultrasound/ECG/2D Echo), Doctor Consultation, and Results.
- 🪪 **Deterministic ID Mapping**: Automatic translation and rewriting of offline temporary IDs to server-assigned IDs across pending operations and local tables.

---

## Quick Start

### Prerequisites
- **Node.js 18+** installed on the workstation
- Optional: Central LIS server (`lis-fullstack`) running on the network for sync

### Install & Run

```powershell
cd lis-app-standalone
npm install
npm start
```

For development with Electron DevTools enabled:
```powershell
npm run dev
```

### Configuration

Edit `lib/config.js` or configure in the desktop settings modal:

```js
module.exports = {
  SERVER_URL: 'http://127.0.0.1:3000', // Central LIS Server URL
  LOCAL_PORT: 30099,                   // Embedded local server port
  SYNC_INTERVAL: 15000,                // Background sync poll interval (ms)
  MAX_SYNC_RETRIES: 3
};
```

---

## Architecture & Data Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Standalone Electron App                         │
│                                                                        │
│   ┌───────────────────┐               ┌────────────────────────────┐   │
│   │   BrowserWindow   │◄─────────────►│    Local Express Engine    │   │
│   │ (127.0.0.1:30099) │   Loopback    │    (Full MVC & Routes)     │   │
│   └───────────────────┘   Navigation  └──────────────┬─────────────┘   │
│                                                      │                 │
│                                       ┌──────────────▼─────────────┐   │
│                                       │     SQLite Database        │   │
│                                       │       lis-data.db          │   │
│                                       └──────────────┬─────────────┘   │
│                                                      │                 │
│   ┌───────────────────┐               ┌──────────────▼─────────────┐   │
│   │  Network Monitor  │               │      Operation Queue       │   │
│   │ (Ping / 5 seconds)│               │  (pending-operations.json) │   │
│   └─────────┬─────────┘               └──────────────┬─────────────┘   │
│             │                                        │                 │
│             │ When Online                            │                 │
│   ┌─────────▼────────────────────────────────────────▼─────────────┐   │
│   │                       Sync Engine                              │   │
│   │   • Pull: /export/data.json ──► Merge into local SQLite        │   │
│   │   • Push: Replay queued mutations with ID mapping              │   │
│   └──────────────────────────────────┬─────────────────────────────┘   │
└──────────────────────────────────────┼─────────────────────────────────┘
                                       │ HTTP / HTTPS
                                       ▼
                     ┌──────────────────────────────────┐
                     │     Central LIS Server           │
                     │    http://<server-ip>:3000       │
                     └──────────────────────────────────┘
```

---

## 🧪 Testing Suite Guide

All automated tests are compiled in the root [`test/`](../test) directory. These suites cover offline functionality, reception pipelines, embedded HTTP routes, deterministic ID mapping, and live server synchronization.

### 1. Running Offline Tests (Server Offline)

Run the full offline test suite from the repository root:

```bash
node test/run-all-offline-tests.js
```

Or run directly inside `lis-app-standalone`:

```bash
npm test
```

#### Individual Offline Suites:

| Suite | File Path | What It Tests |
| :--- | :--- | :--- |
| **Suite 1: CRUD** | [`test/standalone-offline-crud.test.js`](../test/standalone-offline-crud.test.js) | SQLite DataStore initialization, auto-counter sequences (`P001`, `T001`), Patient & Test models offline CRUD. |
| **Suite 2: Pipeline** | [`test/standalone-offline-pipeline.test.js`](../test/standalone-offline-pipeline.test.js) | Reception multi-station pipeline offline (`Payment Area` ➔ `Extraction Area` / `X-ray` / `Doctor` ➔ `Completed`). |
| **Suite 3: HTTP Routes** | [`test/standalone-offline-routes.test.js`](../test/standalone-offline-routes.test.js) | Embedded Express endpoints (`GET /patients`, `POST /patients`, `POST /tests`, `GET /dashboard`) and operation queuing. |
| **Suite 4: ID Mapping** | [`test/standalone-offline-id-mapping.test.js`](../test/standalone-offline-id-mapping.test.js) | Deep replacement of temporary offline IDs across chained queued mutations and SQLite DataStore collections. |

---

### 2. Running Live Server Synchronization Tests (Server Online)

Ensure the central LIS server is running on `http://127.0.0.1:3000`, then execute:

```bash
node test/standalone-live-sync.test.js
```

#### What the Live Sync Test Verifies:
1. **Connectivity Check**: `NetworkMonitor` detects server status.
2. **Database Pull (`fullSync`)**: Downloads central snapshot into local SQLite (`lis-data.db`).
3. **Offline Mutation Capture**: Creates patients, multi-department tests, and station advancements into `OperationQueue`.
4. **Queue Replay (`processQueue`)**: Replays mutations sequentially to the live server with automatic authentication.
5. **Round-Trip Verification**: Pulls a fresh snapshot from the server and verifies that the new records exist on the central database.

---

## Development Workflow for New Features

When developing or modifying features in the standalone client:

1. **Verify Offline First**:
   Always run `node test/run-all-offline-tests.js` to ensure changes operate 100% offline without crashing or throwing unhandled database errors.
2. **Check Queue Interception**:
   Ensure new mutations in `routes/*.js` emit an operation via `req.app.locals.operationQueue.add({...})` with clean payloads.
3. **Verify ID Resolution**:
   If introducing new child entities, ensure `replaceTempId` in [`lib/operationQueue.js`](lib/operationQueue.js) maps foreign keys appropriately.
4. **Verify Live Sync**:
   Start the central server and run `node test/standalone-live-sync.test.js` to confirm two-way synchronization.

---

## Building an Installer

To build the standalone Windows installer package:

```powershell
# Build NSIS Windows installer (.exe)
npm run dist:win

# Build unpacked executable directory
npm run dist:dir
```

Output installers are generated in the `dist/` directory.

---

## Data Storage Directory

All local data is stored in the user data directory:

```
%APPDATA%/lis-app-standalone/
├── lis-data.db                    # Local SQLite Database
├── data/
│   └── pending-operations.json    # Queued offline mutations
└── page-cache/                    # Cached HTML snapshots
```
