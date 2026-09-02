# Gezyne LIS Standalone Desktop Client v2.3.0

[![Version](https://img.shields.io/badge/version-2.3.0-emerald.svg?style=flat-square)](https://github.com/gezyne/lis-prototype)
[![Electron](https://img.shields.io/badge/Electron-v28-47848F.svg?style=flat-square&logo=electron)](https://www.electronjs.org/)
[![Database](https://img.shields.io/badge/database-SQLite%20(Local--First)-blue.svg?style=flat-square&logo=sqlite)](https://www.sqlite.org/)
[![Offline](https://img.shields.io/badge/offline-100%25%20capable-success.svg?style=flat-square)](https://github.com/gezyne/lis-prototype)

**Independent Desktop Workstation Client for Gezyne Clinical Laboratory LIS** featuring a Local-First SQLite Database, Multi-Station Reception Pipeline, and Automatic Two-Way Central Synchronization.

The standalone desktop application is a **100% independent, local-first workstation**. The UI is served entirely by an embedded local Express engine backed by a local SQLite database (`lis-data.db`).

- ⚡ **Local-First UI**: Instant responsiveness, zero lag, full offline functionality without server dependency.
- 💾 **SQLite Storage (`lis-data.db`)**: High-performance local storage for patients, multi-department tests, and reception queues.
- 🔄 **Auto-Sync Engine**: Background push of offline queued mutations and background pull of central database snapshots.
- 🔐 **Bearer Token Security**: Encrypted and token-authenticated server communication without storing plaintext user passwords.
- 📱 **Auto-Collapsing Sidebar**: Automatic sidebar hiding in child preview windows and displays `<= 1100px`.
- 🏥 **Reception Multi-Station Pipeline**: Offline progression across Payment, Extraction, Imaging (X-ray/Ultrasound/ECG/2D Echo), Doctor Consultation, and Results.
- 🪪 **Deterministic ID Mapping**: Automatic translation and rewriting of offline temporary IDs to server-assigned IDs across pending operations and local tables.

---

## 🚀 Quick Start

### Prerequisites
- **Node.js 18+** installed on the workstation
- Optional: Central LIS server (`lis-fullstack`) running on the network for synchronization

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

## 🏗️ Architecture & Data Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│                    Standalone Electron App (v2.3.0)                    │
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
                                       │ HTTP / HTTPS (Bearer Auth)
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

---

## 📦 Building the Standalone Installer (v2.3.0)

To build the standalone Windows installer package:

```powershell
# Build NSIS Windows installer (.exe)
npm run dist:win

# Build unpacked executable directory
npm run dist:dir
```

Output installers are generated in the `dist/` directory (`Gezyne LIS Client Setup 2.3.0.exe`).

---

## 💾 Local Data Storage

All local database files and queued operations are preserved in the user data folder:

```
%APPDATA%/lis-app-standalone/
├── lis-data.db                    # Local SQLite Database
├── data/
│   └── pending-operations.json    # Queued offline mutations
└── page-cache/                    # Cached HTML snapshots
```

---

## 📌 License

Distributed under the **MIT License**. Created for **Gezyne Clinical Laboratory**.
