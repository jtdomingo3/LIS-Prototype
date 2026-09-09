# Changelog

All notable changes to the Gezyne Laboratory Information System (LIS) project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.5.0] - 2026-09-09

### Added
- **Equipment & Quality Control (QC) Module**:
  - Full-lifecycle instrumentation registry supporting Clinical Chemistry, Hematology, Electrolyte, Urinalysis analyzers, and Radiology/X-Ray equipment (with DOH/FDA CDRRHR specifications).
  - High-precision Levey-Jennings (LJ) statistical charting engine with Westgard Multi-Rule Evaluation (1:2s, 1:3s, 2:2s, R:4s, 4:1s, 10:x), automated Z-score computations, and violation alerts.
  - Multi-level control lots (Level 1 Normal & Level 2 High) with pre-populated multi-analyte standard panels (e.g., 21 clinical chemistry analytes).
  - Interactive date filtering (Month-to-Date, custom date ranges) dynamically recalculating observed mean, standard deviation, coefficient of variation (%CV), and total error (TEobs).
  - Multi-signatory stamping options supporting MedTech, Reviewing Senior MedTech, and Pathologist credentials.
  - Granular QC run management with "Drop Previous Run" feature for rapid clerical error rectification.
- **NEQAS & Dynamic NRL Registration**:
  - Full integration with East Avenue Medical Center (EAMC) National Reference Laboratory for Environmental and Occupational Health, Toxicology and Micronutrient Assay (NRL-EOHTMA) for accredited Drug Testing PT surveys (Cannabinoids/THC & Methamphetamine/MET).
  - Dynamic National Reference Laboratory (NRL) management: register, view, and manage custom reference institutions (EAMC, LCP, NKTI, RITM, PHC) with persistent storage across central and offline workstations.
  - DOH-compliant printable NEQAS Quality Assurance Assessment Certificates with automatic Standard Deviation Index (SDI) categorization and mandatory Corrective Action Form generation for out-of-tolerance surveys (|SDI| >= 3.0).
  - Consolidated multi-analyte Monthly QC Summary inspection reports ready for DOH regulatory licensing audits.
- **Expanded Role-Based Access Control (RBAC)**:
  - Added dedicated **Equipment & QC Module Permission** (`equipment`) across User Management (`new.ejs`, `edit.ejs`, `show.ejs`).
  - Seamless delegation to laboratory Process Owners, Chief Medical Technologists, and Quality Managers without requiring full Administrator access.
  - Automated home-route redirection routing designated equipment process owners directly to `/equipment`.
- **Two-Way Standalone Offline Synchronization for Quality Data**:
  - Real-time and queued offline synchronization for Equipment maintenance logs, QC entries, and NEQAS proficiency records.
  - Deterministic ID mapping and conflict-free data merge between standalone desktop workstations and central server.

### Security
- **Credential Sanitization & Environment Hardening**:
  - Complete elimination of default/legacy test passwords (`password123`) across the entire repository codebase, documentation, seeders, and views.
  - Untracked `.env` files from version control and strengthened `.gitignore` with universal recursive patterns (`*.env`, `**/.env`).
  - Strict SQL injection prevention using pre-compiled parameterized queries, type validation, and defensive data access layers.
  - 100% compliance score achieved across automated OWASP Top 10, NIST SP 800-63B, and CIS benchmark security audit checks on both Server and Standalone targets.

---

## [2.4.0] - 2026-09-07

### Added
- **Clinical & Operational AI Chatbot Assistant**:
  - In-app intelligent assistant embedded in the navigation bar.
  - Guides clinical staff, medtechs, and receptionists on laboratory Standard Operating Procedures (SOP), specimen collection criteria, diagnostic test parameters, reference ranges, and system operational guidance.
  - Real-time diagnostic assistance and clinical inquiry handling.
- **Reagent & Supply Inventory Tracking System**:
  - Full-featured inventory management module for laboratory reagents, test cartridges, specimen tubes, and clinical consumables.
  - Batch number, Lot number, and Expiry Date tracking with automated low-stock and near-expiry alerts.
  - Complete stock audit trail: Stock-In, Stock-Out, automatic per-test usage deduction, and waste disposal logs.
- **Modernized UI / UX & Visual Design System**:
  - Polished desktop and server interface with high-density metrics cards, status badges, and subtle micro-animations.
  - Interactive custom confirmation modals replacing default browser alerts.
  - Floating auto-expanding patient autocomplete search overlay in report previews.
  - Persistent fullscreen mode across page transitions (`F11`).
- **Clinical Batch Worksheet & Registry Retrieval Overhaul**:
  - **Standardized Batch Diagnostic Worksheet**:
    - Renamed approving pathologist / doctor column to `APPROVED BY` and `APPROVED BY LICENSE`.
    - Corrected `REQUESTED BY` to pull the actual attending physician from patient registration (`patient.physician`).
    - Added patient `Age` and `Sex` directly after `Last Name`.
    - Stripped redundant `SIGNATORY` column and filtered out raw signature images and coordinate metadata (`signatures.*.filename`, `placement.x`, `placement.y`).
    - Multi-format exports to Excel Spreadsheet (`.xlsx`), `.xls`, and `.csv`.
  - **Patient Demographics Registry Export**:
    - Replaced generic `Created By` with date-specific `Tests Requested` for census and audit tracking.
    - Added `Sex` column directly after `Age` in both live preview and exported spreadsheets.
- **Reception Sequence Protection & PhilHealth Safeguards**:
  - Multi-station sequence protection: prevents patients with late-added tests from being looped back to stations they have already completed.
  - PhilHealth membership verification and zero-charge routing with security confirmation prompts.
- **Hardware Thermal Printing & Stream Sync**:
  - Dedicated thermal barcode printer integration (ESC/POS) with environment variable fallback (`PRINTER_NAME`) and diagnostic testing tools.
  - Granular SSE sync control with configurable page allowlist and rate limiters.

---

## [2.0.0] - 2026-08-15

### Added
- **High-Performance SQLite Core (`lis-data.db`)**:
  - Replaced flat JSON files with WAL-enabled SQLite (`better-sqlite3` on server, `sql.js` fallback) for sub-millisecond ACID operations.
- **Two-Way Offline Synchronization Engine**:
  - Background push of queued offline mutations and periodic pull of central server snapshots.
- **Deterministic ID Mapping**:
  - Automatic translation of offline temporary IDs (`temp-*`) to central server IDs across pending queues and local SQLite tables.
- **Cryptographic Bearer Token Auth**:
  - HMAC-SHA256 Bearer tokens for secure workstation sync without exposing plaintext passwords.
- **Multi-Station Reception Pipeline**:
  - Structured patient routing across `Payment Area` -> `Extraction Area` -> `In Progress` -> `Releasing of Result` -> `Released`.
- **Real-Time Patient Queue & Calling Kiosk**:
  - Server-Sent Events (SSE) broadcast engine with text-to-speech (TTS) audio chime and queue display kiosk (`/reception/assigned?kiosk=1`).
- **Automated Disaster Recovery**:
  - Scheduled 3:00 PM SQLite database backups with active WAL checkpointing (`backup_db_${ts}.db` and JSON mirrors) with 30-day retention.
- **Auto-Collapsing Sidebar**:
  - Context-aware sidebar layout for compact workstation displays (`<= 1100px`) and child preview windows.

---

## [1.0.0] - 2026-06-01

### Added
- **Core Patient Registration**: Patient demographic intake, Medical Record Number (MRN) generation, contact records, and basic search.
- **Multi-Department Test Entry**: Basic result recording for Hematology, Routine Urinalysis, Routine Fecalysis, Blood Chemistry, and Serology.
- **PDF Report Generation**: Standard diagnostic result rendering with A4 paper print formatting.
- **Role-Based Access Control (RBAC)**: Basic user authentication (Admin, MedTech, Receptionist) with session security.
- **Initial File Storage**: JSON file-based database architecture.
