# Gezyne LIS Standalone Desktop Client v2.6.0

[![Version](https://img.shields.io/badge/version-2.6.0-emerald.svg?style=flat-square)](https://github.com/gezyne/lis-prototype)
[![Electron](https://img.shields.io/badge/Electron-v28-47848F.svg?style=flat-square&logo=electron)](https://www.electronjs.org/)
[![Database](https://img.shields.io/badge/database-SQLite%20(Local--First)-blue.svg?style=flat-square&logo=sqlite)](https://www.sqlite.org/)
[![Offline](https://img.shields.io/badge/offline-100%25%20capable-success.svg?style=flat-square)](https://github.com/gezyne/lis-prototype)
[![License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE)

An enterprise-grade, **local-first standalone desktop workstation client** for Gezyne Clinical Laboratory LIS. Features an embedded Express engine, local SQLite database (`lis-data.db`), multi-station reception workflow, outpatient clinical consultation module, and automated background two-way synchronization with the central LIS server.

The standalone desktop application operates **100% autonomously without network connection**. When online connectivity is detected, queued offline operations are automatically replayed and reconciled with the central server using deterministic ID mapping.

---

## 📜 Version History & Release Notes

### **v2.6.0 (Clinical Consultation Module, DOH PhilPEN Risk Assessment, Clinical Document Printing & Worksheet Isolation) — Current Release**
- 🩺 **Clinical Consultation & Outpatient Doctor Check-up Module (`/consultations/:testId`)**:
  - Full outpatient clinical encounter documentation adhering to international SOAP (Subjective, Objective, Assessment, Plan) guidelines and DOH Philippine Package of Essential NCD Interventions (PhilPEN) Clinical Practice Guidelines (CPG).
  - **Subjective & DOH PhilPEN Profiling**: Chief complaint, HPI, PMH, current medications, review of systems (ROS), allergy warnings (with NKDA flag), interactive Familial NCD checklist with clickable pills (Hypertension, T2DM, CAD, Stroke, Cancer, Asthma/Allergies, CKD) auto-populating structured kinship notes, tobacco pack-years calculator, and alcohol screening.
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

## 📦 Building the Windows Installer (v2.6.0)

To compile the production Windows desktop installer package:

```powershell
# Compile NSIS Windows Setup (.exe)
npm run dist:win

# Compile unpacked executable directory for testing
npm run dist:dir
```

Installer Artifact: `lis-app-standalone/dist/Gezyne LIS Setup 2.6.0.exe`

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
