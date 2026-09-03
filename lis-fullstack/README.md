# Gezyne LIS Server (Full-Stack) v2.4.0

[![Version](https://img.shields.io/badge/version-2.4.0-emerald.svg?style=flat-square)](https://github.com/gezyne/lis-prototype)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg?style=flat-square&logo=node.js)](https://nodejs.org/)
[![Database](https://img.shields.io/badge/database-SQLite%20(WAL%20Enabled)-blue.svg?style=flat-square&logo=sqlite)](https://www.sqlite.org/)
[![Security](https://img.shields.io/badge/security-HMAC--SHA256%20%7C%20bcrypt-purple.svg?style=flat-square)](https://github.com/gezyne/lis-prototype)
[![License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE)

An enterprise-grade, full-stack Laboratory Information System (LIS) server built with Node.js, Express, and high-performance SQLite engine (`lis-data.db`). Engineered for high-throughput diagnostic laboratories, multi-station patient processing, real-time telemetry, and synchronized desktop workstations.

---

## 📜 Version History & Release Notes

### **v2.4.0 (Enterprise Clinical Intelligence & Operations) — Current Release**
- 🤖 **Clinical & Operational AI Chatbot Assistant**:
  - Integrated intelligent assistant directly accessible to staff via top navigation.
  - Formulated to assist medical technologists, nurses, and encoders with laboratory Standard Operating Procedures (SOP), specimen collection criteria, diagnostic test parameters, reference ranges, and system operational guidance.
- 📦 **Reagent & Supply Inventory Tracking System**:
  - Full-featured inventory management module for clinical reagents, cartridges, specimen collection tubes, and medical consumables.
  - Supports Batch/Lot number indexing, Expiration Date monitoring, automated low-stock warnings, and near-expiry status flags.
  - Complete transaction audit trail: Stock-In, Stock-Out, automatic deduction per completed test, and disposal logging.
- 🎨 **Modernized User Interface & Interaction Design**:
  - Redesigned visual hierarchy with sleek card components, glassmorphism accents, high-contrast badges, and micro-animations.
  - Interactive custom confirmation modals replacing standard browser alert dialogues.
  - Floating auto-expanding patient autocomplete search overlay in report previews for instantaneous record lookup.
  - Persistent fullscreen mode across page transitions with keyboard toggle shortcut (`F11`).
- 📊 **Clinical Batch Worksheet & Registry Retrieval Overhaul**:
  - **Standardized Batch Diagnostic Worksheet**:
    - Renamed Pathologist / Laboratory Doctor column to **`APPROVED BY`** and **`APPROVED BY LICENSE`**.
    - Corrected **`REQUESTED BY`** to strictly capture the assigned attending physician entered in patient registration (`patient.physician`).
    - Added patient **`Age`** and **`Sex`** directly after **`Last Name`**.
    - Stripped redundant `SIGNATORY` column and filtered out raw signature image paths and coordinate metadata (`signatures.*.filename`, `placement.x`, `placement.y`), yielding clean clinical parameter tables.
    - Full multi-format export to Excel Spreadsheet (`.xlsx`), legacy `.xls`, and `.csv`.
  - **Patient Demographics Registry Export**:
    - Replaced generic `Created By` column with date-specific **`Tests Requested`** reflecting exact diagnostic orders for the chosen date range.
    - Added **`Sex`** column directly after **`Age`** in both live preview and exported spreadsheets.
- 🛡️ **Reception Sequence Protection & PhilHealth Safeguards**:
  - Multi-station sequence protection: prevents patients with late-added tests from being incorrectly routed back to stations they have already completed or are currently undergoing.
  - PhilHealth membership verification and zero-charge routing with security confirmation prompts.
- 🖨️ **Hardware Thermal Printing & Granular SSE Stream Control**:
  - Dedicated thermal barcode printer integration (ESC/POS) with environment variable fallback (`PRINTER_NAME`) and diagnostic test utilities.
  - Administrative SSE control settings with customizable page allowlisting, auto-refresh toggles, and heartbeat rate throttling.

---

### **v2.0.0 – v2.3.0 (Architecture Modernization & Multi-Station Evolution)**
- **High-Performance SQLite Core (`lis-data.db`)**: Replaced flat JSON storage with WAL-enabled SQLite (`better-sqlite3` on server, `sql.js` fallback) for sub-millisecond ACID queries.
- **Multi-Station Reception Pipeline**: Structured patient routing across `Payment Area` ➔ `Extraction Area` ➔ `In Progress` ➔ `Releasing of Result` ➔ `Released`.
- **Real-Time Patient Queue & Calling Kiosk**: Server-Sent Events (SSE) broadcast engine with text-to-speech (TTS) audio chime and queue display kiosk (`/reception/kiosk`).
- **Digital Signatory Stamping**: Secure dual-signatory stamping (Performing Medical Technologist & Approving Pathologist) with dynamic 2D/1D barcodes.
- **Automated Disaster Recovery**: Scheduled 3:00 PM SQLite database backups with active WAL checkpointing (`backup_db_${ts}.db` and JSON mirrors) with 30-day automated pruning.
- **Standalone Electron Workstation Synchronization**: Two-way synchronization engine supporting remote desktop clients with deterministic ID mapping.

---

### **v1.0.0 (Foundational Baseline Release)**
- **Core Patient Registration**: Patient demographic intake, Medical Record Number (MRN) generation, contact records, and basic search.
- **Multi-Department Test Entry**: Basic result input for Hematology, Routine Urinalysis, Routine Fecalysis, Blood Chemistry, and Serology.
- **PDF Report Generation**: Standard diagnostic report rendering with A4 paper print formatting.
- **Role-Based Access Control (RBAC)**: Basic user authentication (Admin, MedTech, Receptionist) with session security.
- **Initial File Storage**: JSON file-based database architecture.

---

## 🚀 Quick Start

### Prerequisites
- **Node.js 18+** (LTS recommended)
- **Windows / Linux / macOS**

### Installation

```bash
cd lis-fullstack
npm install
```

### Running the Server

```bash
# Development mode with auto-reload (nodemon)
npm run dev

# Production mode
npm start
```

Default access URL: `http://localhost:3000` (or local network IP e.g., `http://192.168.x.x:3000`).

---

## 📁 System Architecture

```
lis-fullstack/
├── lib/               # Database adapters, token utilities, PDF generator, logger
│   ├── sqliteDb.js    # Central SQLite engine (better-sqlite3 / WAL mode)
│   ├── dataPath.js    # Multi-environment path resolution
│   ├── tokenHelper.js # HMAC-SHA256 bearer token cryptographic engine
│   └── reportLogger.js# Standardized audit and diagnostic logger
├── middleware/        # Auth verification, RBAC permissions, and rate limiters
├── models/            # Domain models: Patient, Test, User, Template, Inventory
├── public/            # Static assets: stylesheets, client scripts, icons, audio
├── routes/            # Express controllers
│   ├── auth.js        # Authentication & token issuing
│   ├── reception.js   # Multi-station queue & kiosk management
│   ├── patients.js    # Patient registry & master files
│   ├── tests.js       # Diagnostic entry & result validation
│   ├── reports.js     # Worksheets, registry exports & PDF generation
│   ├── inventory.js   # Reagent and supply inventory management
│   ├── chatbot.js     # Clinical & operational AI assistant
│   └── settings.js    # Hardware printer & SSE telemetry configuration
├── scripts/           # Windows service registration, build tools & data seeders
├── tray/              # Electron System Tray launcher & NSIS installer
├── views/             # Responsive EJS views, layouts, and print templates
└── server.js          # Main Express server initialization
```

---

## 🔒 Security & Compliance

- **Password Hashing**: Salted bcrypt hashing (12 rounds) on all credentials.
- **Bearer Token Authentication**: Native HMAC-SHA256 tokens (`POST /api/auth/token`) with constant-time verification.
- **HTTP Security Headers**: `helmet` configured for local inline resources and cross-origin embedding.
- **Rate Limiting**: `express-rate-limit` active on all authentication endpoints.
- **Data Integrity**: WAL checkpointing and automatic daily SQLite backups with SHA-256 validation.

---

## 📦 Building the Windows Installer (v2.4.0)

To compile the standalone Windows server distribution with background service launcher and system tray controller:

```powershell
# 1. Compile server binary and package distribution resources
npm run build:exe
npm run prepare-dist-data

# 2. Package Tray Launcher & NSIS Installer
cd tray
npm install
npm run dist:win
```

Installer Artifact: `lis-fullstack/tray/dist/Gezyne LIS Server Setup 2.4.0.exe`

---

## 📌 License

Distributed under the **MIT License**. Engineered for **Gezyne Clinical Laboratory**.
