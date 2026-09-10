# Gezyne LIS Server (Full-Stack) v2.6.0

[![Version](https://img.shields.io/badge/version-2.6.0-emerald.svg?style=flat-square)](https://github.com/gezyne/lis-prototype)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg?style=flat-square&logo=node.js)](https://nodejs.org/)
[![Database](https://img.shields.io/badge/database-SQLite%20(WAL%20Enabled)-blue.svg?style=flat-square&logo=sqlite)](https://www.sqlite.org/)
[![Security](https://img.shields.io/badge/security-HMAC--SHA256%20%7C%20bcrypt-purple.svg?style=flat-square)](https://github.com/gezyne/lis-prototype)
[![License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE)

An enterprise-grade, full-stack Laboratory Information System (LIS) server built with Node.js, Express, and high-performance SQLite engine (`lis-data.db`). Engineered for high-throughput diagnostic laboratories, outpatient clinical consultations, multi-station patient processing, real-time telemetry, and synchronized desktop workstations.

---

## 📜 Version History & Release Notes

### **v2.6.0 (Clinical Consultation Module, DOH PhilPEN Risk Assessment, Clinical Document Printing & Worksheet Isolation) — Current Release**
- 🩺 **Clinical Consultation & Outpatient Doctor Check-up Module (`/consultations/:testId`)**:
  - Outpatient SOAP documentation (Subjective, Objective, Assessment, Plan) with PhilHealth / DOH PhilPEN Clinical Practice Guidelines (CPG) integration.
  - **Subjective & DOH PhilPEN Profiling**: Chief complaint, HPI, PMH, current medications, review of systems (ROS), allergy warnings (NKDA flag), interactive Familial NCD checklist with clickable pills (Hypertension, T2DM, CAD, Stroke, Cancer, Asthma/Allergies, CKD) auto-populating structured kinship notes, tobacco pack-years calculator, and alcohol screening.
  - **Objective Clinical Vitals & Real-Time BMI Engine**: Vital signs grid (BP, HR, RR, Temp, SpO2, Blood Glucose, Pain Scale, Waist) with real-time Asia-Pacific / DOH Philippines BMI calculation and color-coded status badges, physical exam breakdown, and integrated patient diagnostic history with one-click report previews.
  - **Assessment & Plan**: Searchable ICD-10 diagnostic directory, differential diagnoses, multi-item Rx prescription builder, laboratory and imaging diagnostic requisitions with custom test ordering, lifestyle advice, and follow-up scheduling.
- 🖨️ **Clinical Document Printing Suite**:
  - **Patient Medical Chart** (`/consultations/:testId/print/chart`): Full encounter hard-copy printout with official facility letterhead, complete SOAP documentation, vitals grid, DOH PhilPEN risk assessment, prescriptions table, and physician signature block.
  - **Optimized Print Layout**: Top-level `@page { size: portrait; margin: 6mm 8mm; }` eliminating oversized paper margins across Letter and A4 sizes, paired with a borderless `.chart-sheet` print container matching the on-screen form view proportions.
  - **Official Prescription Pad** (`/consultations/:testId/print/prescription`): Philippine standard Rx pad with attending physician's PRC License, PTR, and S2 credentials.
  - **Medical Certificate** (`/consultations/:testId/print/med-cert`): Formal fit-to-work / illness certificate with diagnosis, recommended rest periods, and physician designation.
  - **Laboratory Request Requisition** (`/consultations/:testId/print/lab-request`): Standard requisition sheet for laboratory and imaging orders.
  - **Standardized Official Clinic Header**: Strictly one-line clinic title (`Gezyne Clinical Laboratory & Medical Clinic`) featuring complete facility address (`0330 Vergel De Dios St., Poblacion, Plaridel, Bulacan (Near Municipal Basketball Court)`), official DOH License Number (`Lic. No. 03-435-15CL-20`), and contact hotlines (`Tel: 0917-649-0807 / 0960-390-0921 / (044) 795-5007`).
- 👨‍⚕️ **Physician Auto-Capture & Status Lifecycle**:
  - Automatic identity capture for logged-in physician accounts, auto-populating PRC license, PTR, and professional designation (e.g., "Internist").
  - Clinic room name matching without duplicate accounts, and real-time dropdown synchronization linking physician selection to credentials.
  - Universal recognition of "Checked" status as completed encounters across all dashboards, census reports, badges, and filters.
- 🔬 **Clinical Batch Worksheet & Diagnostic Report Separation**:
  - Standardized `isDoctorVisitTest` helper isolating outpatient doctor check-up visits from laboratory batch worksheets (`/worksheet/download` and `/worksheet/preview`) and diagnostic report exports.
  - Laboratory worksheets strictly display diagnostic laboratory specimens (CBC, Urinalysis, Blood Chemistry, etc.), keeping MedTech worklists focused.
- 🔄 **Two-Way Offline Synchronization Parity**:
  - Seamless two-way synchronization for consultations, medical chart records, prescription entries, and physician signatures between standalone desktop clients and central server.

---

### **v2.5.0 (Quality Assurance, NEQAS EAMC PT Surveys, Equipment QC & Security Hardening)**
- 🔬 **Equipment Management & Levey-Jennings Quality Control (QC)**:
  - Full-lifecycle instrumentation registry supporting Clinical Chemistry, Hematology, Electrolyte, Urinalysis analyzers, and Radiology/X-Ray equipment (with DOH/FDA CDRRHR specifications).
  - High-precision Levey-Jennings (LJ) statistical charting engine with Westgard Multi-Rule Evaluation (1:2s, 1:3s, 2:2s, R:4s, 4:1s, 10:x), automated Z-score computations, and violation alerts.
  - Multi-level control lots (Level 1 Normal & Level 2 High) with pre-populated multi-analyte standard panels (e.g. 21 clinical chemistry analytes).
  - Interactive date filtering (Month-to-Date, custom date ranges) dynamically recalculating observed mean, standard deviation, coefficient of variation (%CV), and total error (TEobs).
  - Multi-signatory stamping options supporting MedTech, Reviewing Senior MedTech, and Pathologist credentials.
  - Granular QC run management with "Drop Previous Run" feature for rapid clerical error rectification.
- 🏛️ **National External Quality Assessment Scheme (NEQAS) & Dynamic NRL Registration**:
  - Full integration with East Avenue Medical Center (EAMC) National Reference Laboratory for Environmental and Occupational Health, Toxicology and Micronutrient Assay (NRL-EOHTMA) for accredited Drug Testing PT surveys (Cannabinoids/THC & Methamphetamine/MET).
  - Dynamic National Reference Laboratory (NRL) management: register, view, and manage custom reference institutions (EAMC, LCP, NKTI, RITM, PHC) with persistent storage across central and offline workstations.
  - DOH-compliant printable NEQAS Quality Assurance Assessment Certificates with automatic Standard Deviation Index (SDI) categorization and mandatory Corrective Action Form generation for out-of-tolerance surveys (|SDI| >= 3.0).
  - Consolidated multi-analyte Monthly QC Summary inspection reports ready for DOH regulatory licensing audits.
- 👥 **Expanded Role-Based Access Control (RBAC) & Process Owner Delegation**:
  - Added dedicated **Equipment & QC Module Permission** (`equipment`) across User Management (`new.ejs`, `edit.ejs`, `show.ejs`).
  - Seamless delegation to laboratory Process Owners, Chief Medical Technologists, and Quality Managers without requiring full Administrator access.
  - Automated home-route redirection routing designated equipment process owners directly to `/equipment`.
- 🛡️ **Enterprise Security Hardening & Credential Sanitization**:
  - Complete elimination of default/legacy test passwords (`password123`) across the entire repository codebase, documentation, seeders, and views.
  - Untracked `.env` files from version control and strengthened `.gitignore` with universal recursive patterns (`*.env`, `**/.env`).
  - Strict SQL injection prevention using pre-compiled parameterized queries, type validation, and defensive data access layers.
  - 100% compliance score achieved across automated OWASP Top 10, NIST SP 800-63B, and CIS benchmark security audit checks on both Server and Standalone targets.
- 🔄 **Two-Way Standalone Offline Synchronization**:
  - Real-time and queued offline synchronization for Equipment maintenance logs, QC entries, and NEQAS proficiency records.
  - Deterministic ID mapping and conflict-free data merge between standalone desktop workstations and central server.

---

### **v2.4.0 (Enterprise Clinical Intelligence & Operations)**
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

## 📦 Building the Windows Installer (v2.6.0)

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

Installer Artifact: `lis-fullstack/tray/dist/Gezyne LIS Server Setup 2.6.0.exe`

---

## 📌 License

Distributed under the **MIT License**. Engineered for **Gezyne Clinical Laboratory**.
