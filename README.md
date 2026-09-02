# Gezyne Laboratory Information System (LIS) v2.3.0

[![Version](https://img.shields.io/badge/version-2.3.0-emerald.svg?style=flat-square)](https://github.com/gezyne/lis-prototype)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg?style=flat-square&logo=node.js)](https://nodejs.org/)
[![Database](https://img.shields.io/badge/database-SQLite%20(WAL)-blue.svg?style=flat-square&logo=sqlite)](https://www.sqlite.org/)
[![Electron](https://img.shields.io/badge/desktop-Electron%20v28-47848F.svg?style=flat-square&logo=electron)](https://www.electronjs.org/)
[![License](https://img.shields.io/badge/license-MIT-amber.svg?style=flat-square)](LICENSE)

> **Gezyne Clinical Laboratory - Laboratory Information System (LIS) v2.3.0** is an enterprise-grade clinical diagnostic and laboratory management platform. It combines a central full-stack Node.js/Express server, a 100% offline-capable standalone desktop client with deterministic ID mapping, live patient queue kiosks, Bearer token authentication, and robust SQLite WAL backups.

---

## 🏗️ System Architecture & Repository Layout

```
.
├── README.md                  # Root documentation (v2.3.0)
├── ads.json                   # Kiosk announcement configuration
│
├── lis-fullstack/             # Central LIS Server & Electron Tray Launcher
│   ├── build/                 # Bundled installer resources & seed data
│   ├── dist/                  # Packaged standalone executable (via pkg)
│   ├── lib/                   # Database adapters (better-sqlite3/sql.js), tokens & PDF engine
│   ├── middleware/            # Bearer token auth, role gates & rate limiting
│   ├── models/                # Domain models (Patient, Test, User, Template)
│   ├── routes/                # Express MVC routes & RESTful endpoints
│   ├── scripts/               # Build, encryption & Windows service scripts
│   ├── tray/                  # Electron System Tray launcher & NSIS Windows installer
│   ├── views/                 # Responsive EJS views with auto-collapsing sidebars
│   └── server.js              # Central LIS Server entrypoint
│
├── lis-app-standalone/        # Local-First Standalone Desktop Client (Electron)
│   ├── lib/                   # Local Express engine, sync engine, network monitor & queue
│   ├── models/                # Local SQLite models with offline support
│   ├── renderer/              # Desktop modals, status banners & print preview
│   ├── views/                 # Full local UI with auto-hidden sidebars on small screens
│   └── main.js                # Electron main process & child window manager
│
├── lis-mobile/                # Mobile companion application (Cordova/Capacitor)
├── lis-angular/               # Alternative Angular single-page frontend
└── test/                      # Comprehensive integration, offline & sync test suites
```

---

## ✨ What's New in v2.3.0

- 🔐 **Cryptographic Bearer Token Auth**: HMAC-SHA256 Bearer tokens for secure workstation sync without exposing plaintext passwords or database credentials.
- 💾 **High-Performance SQLite Storage**: Granular parameterized row upserts and deletions with WAL journal mode (`lis-data.db`), eliminating full-table drops and concurrency locks.
- 🔄 **Two-Way Offline Sync & ID Mapping**: Standalone Electron app captures offline operations into an `OperationQueue` and replays them automatically upon server reconnection with deep ID translation.
- 🛡️ **Automated SQLite WAL Checkpointing & Backup**: Daily 3:00 PM auto-backup with active WAL checkpointing (`PRAGMA wal_checkpoint(TRUNCATE)`), binary `.db` snapshots, secondary `.json` archives, and rolling 30-day retention.
- 📱 **Intelligent Auto-Hiding Responsive Sidebar**: Automatic sidebar collapse into a flyout drawer for secondary windows, report previews, and screen widths `<= 1100px`.
- 🖨️ **Puppeteer Headless PDF Generation**: High-fidelity clinical report rendering with dynamic barcodes, multi-signatory digital signatures, and philhealth compliance.
- 🏥 **Animated Multi-Station Patient Queue Kiosk**: Real-time queue display (`/reception/assigned?kiosk=1`) optimized for TV displays and reception monitors.

---

## 🚀 Quick Start Guide

### Prerequisites
- **Node.js**: `v18.0.0` or higher
- **Operating System**: Windows 10/11, Windows Server (or macOS/Linux for server mode)

### 1. Running the Central Server (`lis-fullstack`)

```powershell
cd lis-fullstack
npm install
npm start
```
Access the web application at `http://localhost:3000` or via your LAN IP (`http://<server-ip>:3000`).

### 2. Running the Standalone Desktop Client (`lis-app-standalone`)

```powershell
cd lis-app-standalone
npm install
npm start
```
The desktop client starts an embedded local engine on `http://127.0.0.1:30099` with full offline capability.

---

## 📦 Packaging Windows Installers (v2.3.0)

### 1. Build Central Server Installer (`Gezyne LIS Server Setup 2.3.0.exe`)

```powershell
cd lis-fullstack
npm run build:exe
npm run prepare-dist-data

cd tray
npm install
npm run dist:win
```
*Output: `lis-fullstack/tray/dist/Gezyne LIS Server Setup 2.3.0.exe`*

### 2. Build Standalone Client Installer (`Gezyne LIS Client Setup 2.3.0.exe`)

```powershell
cd lis-app-standalone
npm install
npm run dist:win
```
*Output: `lis-app-standalone/dist/Gezyne LIS Client Setup 2.3.0.exe`*

---

## 🧪 Testing & Quality Assurance

Run the comprehensive test suites from the repository root:

```powershell
# Run all standalone offline CRUD, pipeline, and ID mapping tests
node test/run-all-offline-tests.js

# Run live two-way sync verification (requires central server on port 3000)
node test/standalone-live-sync.test.js
```

---

## 🛡️ Production Deployment & Process Safety

For continuous 24/7 server operation, automatic reboot recovery, and memory monitoring on Windows:

```powershell
npm install -g pm2
cd lis-fullstack
pm2 start ecosystem.config.js --env production
pm2 save
```

---

## 📌 License

Distributed under the **MIT License**. Developed for **Gezyne Clinical Laboratory**.
