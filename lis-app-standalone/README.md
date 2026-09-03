# Gezyne LIS Standalone Desktop Client v2.4.0

[![Version](https://img.shields.io/badge/version-2.4.0-emerald.svg?style=flat-square)](https://github.com/gezyne/lis-prototype)
[![Electron](https://img.shields.io/badge/Electron-v28-47848F.svg?style=flat-square&logo=electron)](https://www.electronjs.org/)
[![Database](https://img.shields.io/badge/database-SQLite%20(Local--First)-blue.svg?style=flat-square&logo=sqlite)](https://www.sqlite.org/)
[![Offline](https://img.shields.io/badge/offline-100%25%20capable-success.svg?style=flat-square)](https://github.com/gezyne/lis-prototype)
[![License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE)

An enterprise-grade, **local-first standalone desktop workstation client** for Gezyne Clinical Laboratory LIS. Features an embedded Express engine, local SQLite database (`lis-data.db`), multi-station reception workflow, and automated background two-way synchronization with the central LIS server.

The standalone desktop application operates **100% autonomously without network connection**. When online connectivity is detected, queued offline operations are automatically replayed and reconciled with the central server using deterministic ID mapping.

---

## 📜 Version History & Release Notes

### **v2.4.0 (Enterprise Clinical Intelligence & Operations) — Current Release**
- 🤖 **Clinical & Operational AI Chatbot Assistant**:
  - In-app desktop assistant providing immediate access to laboratory Standard Operating Procedures (SOP), reference ranges, specimen requirements, and operational guidelines.
- 📦 **Reagent & Supply Inventory Tracking System**:
  - Full desktop inventory management for laboratory reagents, test cartridges, extraction kits, and consumables.
  - Expiry date monitoring, Lot/Batch tracking, low-stock alerts, and automated stock deductions per test.
- 🎨 **Modernized UI / UX Design**:
  - Polished desktop layout with rich analytical cards, status badges, responsive modals, and subtle micro-animations.
  - Floating auto-expanding patient autocomplete search overlay in report preview screens.
  - Persistent fullscreen mode across page transitions (`F11`).
- 📊 **Clinical Batch Worksheet & Registry Retrieval Overhaul**:
  - **Standardized Batch Diagnostic Worksheet**:
    - Renamed approving pathologist / doctor column to **`APPROVED BY`** and **`APPROVED BY LICENSE`**.
    - Corrected **`REQUESTED BY`** to display the attending physician from patient registration (`patient.physician`).
    - Added patient **`Age`** and **`Sex`** directly after **`Last Name`**.
    - Removed redundant `SIGNATORY` column and filtered out raw signature images and coordinate metadata (`signatures.*.filename`, `placement.x`, `placement.y`).
    - Clean exports to Excel Spreadsheet (`.xlsx`), `.xls`, and `.csv`.
  - **Patient Demographics Registry Export**:
    - Replaced `Created By` with date-specific **`Tests Requested`** for census and audit tracking.
    - Added **`Sex`** column directly after **`Age`** in both live preview and exported spreadsheets.
- 🛡️ **Reception Multi-Station Sequence Protection**:
  - Prevents patients with late-added tests from being routed back to stations they have already completed.
  - PhilHealth membership verification and zero-charge routing with confirmation security prompts.
- 🖨️ **Hardware Thermal Printing & Stream Sync**:
  - Dedicated thermal barcode printer integration (ESC/POS) with environment variable fallback (`PRINTER_NAME`) and diagnostic testing tools.
  - Granular SSE sync control with configurable page allowlist and rate limiters.

---

### **v2.0.0 – v2.3.0 (Local-First Architecture & Two-Way Sync)**
- **Embedded SQLite Core (`lis-data.db`)**: High-performance local-first storage using `sql.js` / SQLite.
- **Two-Way Synchronization Engine**: Background push of queued offline mutations and periodic pull of central server snapshots.
- **Deterministic ID Mapping**: Automatic translation of offline temporary IDs (`temp-*`) to central server IDs across pending queues and local SQLite tables.
- **Bearer Token Authentication**: Secure HMAC-SHA256 authenticated server communication without plaintext credential exposure.
- **Multi-Station Reception Pipeline**: Autonomous offline progression across Payment, Extraction, Imaging, Consultation, and Results.
- **Auto-Collapsing Sidebar**: Context-aware sidebar layout for compact workstation displays (`<= 1100px`) and child preview windows.

---

### **v1.0.0 (Foundational Baseline Release)**
- **Basic Offline Patient Intake**: Local patient demographic entry, MRN generation, and basic search.
- **Core Diagnostic Test Entry**: Offline recording of Hematology, Routine Urinalysis, Routine Fecalysis, and Blood Chemistry results.
- **PDF Report Generation**: Standard diagnostic result rendering with A4 paper print formatting.
- **Role-Based Workstation Access**: Basic session login for MedTechs and Receptionists.
- **Local File Storage**: Initial JSON-based local data storage.

---

## 🚀 Quick Start

### Prerequisites
- **Node.js 18+** installed on the workstation
- Optional: Central LIS server (`lis-fullstack`) accessible on the local network for central synchronization

### Installation & Execution

```powershell
cd lis-app-standalone
npm install

# Start the desktop application
npm start
```

For development mode with Electron DevTools enabled:
```powershell
npm run dev
```

### Workstation Configuration

Edit `lib/config.js` or configure via the in-app Desktop Settings modal:

```javascript
module.exports = {
  SERVER_URL: 'http://192.168.1.100:3000', // Central LIS Server URL
  LOCAL_PORT: 30099,                       // Embedded local Express loopback port
  SYNC_INTERVAL: 15000,                    // Background sync interval (ms)
  MAX_SYNC_RETRIES: 3
};
```

---

## 🏗️ Architecture & Synchronization Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│               Standalone Desktop Client Workstation (v2.4.0)           │
│                                                                        │
│   ┌───────────────────┐               ┌────────────────────────────┐   │
│   │   BrowserWindow   │◄─────────────►│    Local Express Engine    │   │
│   │ (127.0.0.1:30099) │   Loopback    │    (Full MVC & Controllers)│   │
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
│   │   • Pull: /export/data.json ──► Reconcile into local SQLite    │   │
│   │   • Push: Replay queued mutations with deterministic ID map    │   │
│   └──────────────────────────────────┬─────────────────────────────┘   │
└──────────────────────────────────────┼─────────────────────────────────┘
                                       │ HTTP / HTTPS (HMAC-SHA256 Bearer)
                                       ▼
                     ┌──────────────────────────────────┐
                     │     Central LIS Server           │
                     │    http://<server-ip>:3000       │
                     └──────────────────────────────────┘
```

---

## 🧪 Automated Testing Suite

All automated tests are centralized in the root [`test/`](../test) directory.

```powershell
# Run all offline workstation tests (Server Offline)
node test/run-all-offline-tests.js

# Run live server synchronization tests (Server Online)
node test/standalone-live-sync.test.js

# Run system settings & SSE hardware diagnostic tests
node test/settings-system.test.js
```

---

## 📦 Building the Windows Installer (v2.4.0)

To compile the production Windows desktop installer package:

```powershell
# Compile NSIS Windows Setup (.exe)
npm run dist:win

# Compile unpacked executable directory for testing
npm run dist:dir
```

Installer Artifact: `lis-app-standalone/dist/Gezyne LIS Client Setup 2.4.0.exe`

---

## 💾 Local Storage Directory

All local databases, offline queues, and cached assets are persisted under the user profile:

```
%APPDATA%/lis-app-standalone/
├── lis-data.db                    # High-performance local SQLite database
├── data/
│   └── pending-operations.json    # Queued offline mutations awaiting sync
└── page-cache/                    # Cached HTML views
```

---

## 📌 License

Distributed under the **MIT License**. Engineered for **Gezyne Clinical Laboratory**.
