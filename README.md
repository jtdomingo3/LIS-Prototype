# Gezyne Laboratory Information System (LIS) v2.4.0

[![Version](https://img.shields.io/badge/version-2.4.0-emerald.svg?style=flat-square)](https://github.com/gezyne/lis-prototype)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg?style=flat-square&logo=node.js)](https://nodejs.org/)
[![Database](https://img.shields.io/badge/database-SQLite%20(WAL%20Enabled)-blue.svg?style=flat-square&logo=sqlite)](https://www.sqlite.org/)
[![Electron](https://img.shields.io/badge/desktop-Electron%20v28-47848F.svg?style=flat-square&logo=electron)](https://www.electronjs.org/)
[![Offline](https://img.shields.io/badge/offline-100%25%20Capable-success.svg?style=flat-square)](https://github.com/gezyne/lis-prototype)
[![License](https://img.shields.io/badge/license-MIT-amber.svg?style=flat-square)](LICENSE)

> **Gezyne Clinical Laboratory - Laboratory Information System (LIS) v2.4.0** is an enterprise-grade clinical diagnostic and laboratory management platform. It pairs a centralized full-stack Node.js/Express server with 100% offline-capable standalone desktop workstations, multi-station patient processing pipelines, real-time telemetry, AI clinical assistant, reagent inventory tracking, and robust SQLite WAL backups.

---

## 🏗️ System Architecture & Repository Layout

```
.
├── README.md                  # Central system documentation (v2.4.0)
├── ads.json                   # Kiosk announcement configuration
│
├── lis-fullstack/             # Central LIS Server & Electron Tray Launcher (v2.4.0)
│   ├── build/                 # Bundled installer resources & seed data
│   ├── dist/                  # Packaged standalone executable (via pkg)
│   ├── lib/                   # SQLite database adapter (better-sqlite3), tokens, PDF engine
│   ├── middleware/            # Bearer token auth, role gates & rate limiting
│   ├── models/                # Domain models (Patient, Test, User, Template, Inventory)
│   ├── routes/                # Express MVC routes & RESTful endpoints
│   ├── scripts/               # Build, encryption & Windows service scripts
│   ├── tray/                  # Electron System Tray launcher & NSIS Windows installer
│   ├── views/                 # Responsive EJS views, layouts & print templates
│   └── server.js              # Central LIS Server entrypoint
│
├── lis-app-standalone/        # Local-First Standalone Desktop Client (Electron) (v2.4.0)
│   ├── lib/                   # Local Express engine, sync engine, network monitor & queue
│   ├── models/                # Local SQLite models with offline support
│   ├── renderer/              # Desktop modals, status banners & print preview
│   ├── views/                 # Full local UI with auto-hidden sidebars on small screens
│   └── main.js                # Electron main process & child window manager
│
├── lis-mobile/                # Mobile companion application (Cordova/Capacitor)
├── lis-angular/               # Alternative Angular single-page frontend
└── test/                      # Comprehensive integration, offline, inventory & sync test suites
```

---

## 📜 Version History & Release Notes

### **v2.4.0 (Enterprise Clinical Intelligence & Operations) — Current Release**
- 🤖 **Clinical & Operational AI Chatbot Assistant**:
  - In-app intelligent assistant embedded in the navigation bar.
  - Guides clinical staff, medtechs, and receptionists on laboratory Standard Operating Procedures (SOP), specimen collection criteria, diagnostic test parameters, reference ranges, and system operational guidance.
  - Real-time diagnostic assistance and clinical inquiry handling.
- 📦 **Reagent & Supply Inventory Tracking System**:
  - Full-featured inventory management module for laboratory reagents, test cartridges, specimen tubes, and clinical consumables.
  - Batch number, Lot number, and Expiry Date tracking with automated low-stock and near-expiry alerts.
  - Complete stock audit trail: Stock-In, Stock-Out, automatic per-test usage deduction, and waste disposal logs.
- 🎨 **Modernized UI / UX & Visual Design System**:
  - Polished desktop and server interface with high-density metrics cards, status badges, and subtle micro-animations.
  - Interactive custom confirmation modals replacing default browser alerts.
  - Floating auto-expanding patient autocomplete search overlay in report previews.
  - Persistent fullscreen mode across page transitions (`F11`).
- 📊 **Clinical Batch Worksheet & Registry Retrieval Overhaul**:
  - **Standardized Batch Diagnostic Worksheet**:
    - Renamed approving pathologist / doctor column to **`APPROVED BY`** and **`APPROVED BY LICENSE`**.
    - Corrected **`REQUESTED BY`** to pull the actual attending physician from patient registration (`patient.physician`).
    - Added patient **`Age`** and **`Sex`** directly after **`Last Name`**.
    - Stripped redundant `SIGNATORY` column and filtered out raw signature images and coordinate metadata (`signatures.*.filename`, `placement.x`, `placement.y`).
    - Multi-format exports to Excel Spreadsheet (`.xlsx`), `.xls`, and `.csv`.
  - **Patient Demographics Registry Export**:
    - Replaced generic `Created By` with date-specific **`Tests Requested`** for census and audit tracking.
    - Added **`Sex`** column directly after **`Age`** in both live preview and exported spreadsheets.
- 🛡️ **Reception Sequence Protection & PhilHealth Safeguards**:
  - Multi-station sequence protection: prevents patients with late-added tests from being looped back to stations they have already completed.
  - PhilHealth membership verification and zero-charge routing with security confirmation prompts.
- 🖨️ **Hardware Thermal Printing & Stream Sync**:
  - Dedicated thermal barcode printer integration (ESC/POS) with environment variable fallback (`PRINTER_NAME`) and diagnostic testing tools.
  - Granular SSE sync control with configurable page allowlist and rate limiters.

---

### **v2.0.0 – v2.3.0 (Architecture Modernization & Multi-Station Evolution)**
- **High-Performance SQLite Core (`lis-data.db`)**: Replaced flat JSON files with WAL-enabled SQLite (`better-sqlite3` on server, `sql.js` fallback) for sub-millisecond ACID operations.
- **Two-Way Offline Synchronization Engine**: Background push of queued offline mutations and periodic pull of central server snapshots.
- **Deterministic ID Mapping**: Automatic translation of offline temporary IDs (`temp-*`) to central server IDs across pending queues and local SQLite tables.
- **Cryptographic Bearer Token Auth**: HMAC-SHA256 Bearer tokens for secure workstation sync without exposing plaintext passwords.
- **Multi-Station Reception Pipeline**: Structured patient routing across `Payment Area` ➔ `Extraction Area` ➔ `In Progress` ➔ `Releasing of Result` ➔ `Released`.
- **Real-Time Patient Queue & Calling Kiosk**: Server-Sent Events (SSE) broadcast engine with text-to-speech (TTS) audio chime and queue display kiosk (`/reception/assigned?kiosk=1`).
- **Automated Disaster Recovery**: Scheduled 3:00 PM SQLite database backups with active WAL checkpointing (`backup_db_${ts}.db` and JSON mirrors) with 30-day retention.
- **Auto-Collapsing Sidebar**: Context-aware sidebar layout for compact workstation displays (`<= 1100px`) and child preview windows.

---

### **v1.0.0 (Foundational Baseline Release)**
- **Core Patient Registration**: Patient demographic intake, Medical Record Number (MRN) generation, contact records, and basic search.
- **Multi-Department Test Entry**: Basic result recording for Hematology, Routine Urinalysis, Routine Fecalysis, Blood Chemistry, and Serology.
- **PDF Report Generation**: Standard diagnostic result rendering with A4 paper print formatting.
- **Role-Based Access Control (RBAC)**: Basic user authentication (Admin, MedTech, Receptionist) with session security.
- **Initial File Storage**: JSON file-based database architecture.

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
The desktop client runs an embedded local engine on `http://127.0.0.1:30099` with full offline capability.

---

## 📦 Packaging Windows Installers (v2.4.0)

### 1. Build Central Server Installer (`Gezyne LIS Server Setup 2.4.0.exe`)

```powershell
cd lis-fullstack
npm run build:exe
npm run prepare-dist-data

cd tray
npm install
npm run dist:win
```
*Output: `lis-fullstack/tray/dist/Gezyne LIS Server Setup 2.4.0.exe`*

### 2. Build Standalone Client Installer (`Gezyne LIS Client Setup 2.4.0.exe`)

```powershell
cd lis-app-standalone
npm install
npm run dist:win
```
*Output: `lis-app-standalone/dist/Gezyne LIS Client Setup 2.4.0.exe`*

---

## 🧪 Testing & Quality Assurance

All automated test suites are compiled in the root [`test/`](test) directory:

```powershell
# Run all standalone offline CRUD, pipeline, and ID mapping tests
node test/run-all-offline-tests.js

# Run live two-way sync verification (requires central server on port 3000)
node test/standalone-live-sync.test.js

# Run reagent and supply inventory test suite
node test/run-all-inventory-tests.js

# Run hardware settings, thermal printing, and SSE telemetry tests
node test/settings-system.test.js
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
