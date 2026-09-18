# Gezyne Laboratory Information System (LIS) v2.6.0

[![Version](https://img.shields.io/badge/version-2.6.0-emerald.svg?style=flat-square)](https://github.com/gezyne/lis-prototype)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg?style=flat-square&logo=node.js)](https://nodejs.org/)
[![Database](https://img.shields.io/badge/database-SQLite%20(WAL%20Enabled)-blue.svg?style=flat-square&logo=sqlite)](https://www.sqlite.org/)
[![Electron](https://img.shields.io/badge/desktop-Electron%20v28-47848F.svg?style=flat-square&logo=electron)](https://www.electronjs.org/)
[![Offline](https://img.shields.io/badge/offline-100%25%20Capable-success.svg?style=flat-square)](https://github.com/gezyne/lis-prototype)
[![License](https://img.shields.io/badge/license-MIT-amber.svg?style=flat-square)](LICENSE)

> **Gezyne Clinical Laboratory - Laboratory Information System (LIS) v2.6.0** is an enterprise-grade clinical diagnostic and laboratory management platform. It pairs a centralized full-stack Node.js/Express server with 100% offline-capable standalone desktop workstations, multi-station patient processing pipelines, real-time telemetry, AI clinical assistant, outpatient clinical consultation management, reagent inventory tracking, Levey-Jennings QC & NEQAS proficiency testing, and robust SQLite WAL backups.

---

## 🏗️ System Architecture & Repository Layout

```
.
├── README.md                  # Central system documentation (v2.6.0)
├── ads.json                   # Kiosk announcement configuration
│
├── lis-fullstack/             # Central LIS Server & Electron Tray Launcher (v2.6.0)
│   ├── build/                 # Bundled installer resources & seed data
│   ├── dist/                  # Packaged standalone executable (via pkg)
│   ├── lib/                   # SQLite database adapter (better-sqlite3), tokens, PDF engine
│   ├── middleware/            # Bearer token auth, role gates & rate limiting
│   ├── models/                # Domain models (Patient, Test, User, Template, Inventory, Consultation)
│   ├── routes/                # Express MVC routes & RESTful endpoints
│   ├── scripts/               # Build, encryption & Windows service scripts
│   ├── tray/                  # Electron System Tray launcher & NSIS Windows installer
│   ├── views/                 # Responsive EJS views, layouts & print templates
│   └── server.js              # Central LIS Server entrypoint
│
├── lis-app-standalone/        # Local-First Standalone Desktop Client (Electron) (v2.6.0)
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

### **v2.6.0 (Clinical Consultation Module, DOH PhilPEN Risk Assessment, Clinical Document Printing & Worksheet Isolation) — Current Release**
- 🩺 **Clinical Consultation & Outpatient Doctor Check-up Module (`/consultations/:testId`)**:
  - Full outpatient encounter management adhering to SOAP (Subjective, Objective, Assessment, Plan) guidelines and Philippine DOH PhilPEN CPG.
  - **Subjective**: Chief Complaint (CC), History of Present Illness (HPI), Past Medical History (PMH), Current Medications, Review of Systems (ROS), and prominent allergy warning alerts (with NKDA flag).
  - **DOH PhilPEN Lifestyle Risk Profiling**:
    - Interactive Familial NCD checklist with clickable disease pills (Hypertension, Type 2 Diabetes, Premature CAD, Stroke, Cancer, Asthma/Allergies, CKD) auto-populating structured kinship notes into clinical records.
    - Smoking / Tobacco screening with automated pack-years formula `(sticksPerDay / 20) * yearsSmoked`.
    - Alcohol consumption screening with binge drinking hazard alerts.
  - **Objective Clinical Vitals & Real-Time BMI Engine**:
    - Complete vitals grid: BP (Systolic/Diastolic), Heart/Pulse Rate, Respiratory Rate, Temperature (°C), SpO2 (%), Blood Glucose (mg/dL), Pain Scale (0-10), and Waist Circumference (cm).
    - Real-time client & server calculation of BMI under Philippine DOH / Asia-Pacific (PhilPEN & FNRI) guidelines with dynamic color-coded badges: Underweight (< 18.5), Normal (18.5 – 22.9), Overweight / At Risk (23.0 – 24.9), Obese Class I (25.0 – 29.9), and Obese Class II (>= 30.0).
    - Multi-system Physical Examination (PE) checklist.
    - Integrated Patient Diagnostic History displaying previous laboratory and imaging test results with one-click direct report previewing (`/reports/preview/:id`).
  - **Assessment & Plan**: Searchable ICD-10 diagnostic directory, differential diagnoses, multi-item Rx prescription builder (brand/generic, dose, route, frequency, duration, sig), laboratory and imaging requisitions with custom test ordering, lifestyle advice, follow-up scheduling, and specialist referrals.
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
- 🔄 **Two-Way Offline Workstation Parity**:
  - 100% offline consultation recording, prescription drafting, and chart completion on standalone workstations with automatic two-way background sync and discrepancy auditing.

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

## 📦 Packaging Windows Installers (v2.6.0)

### 1. Build Central Server Installer (`Gezyne LIS Server Setup 2.6.0.exe`)

```powershell
cd lis-fullstack
npm run build:exe
npm run prepare-dist-data

cd tray
npm install
npm run dist:win
```
*Output: `lis-fullstack/tray/dist/Gezyne LIS Server Setup 2.6.0.exe`*

### 2. Build Standalone Client Installer (`Gezyne LIS Setup 2.6.0.exe`)

```powershell
cd lis-app-standalone
npm install
npm run dist:win
```
*Output: `lis-app-standalone/dist/Gezyne LIS Setup 2.6.0.exe`*

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
