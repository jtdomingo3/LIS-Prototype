# Changelog

All notable changes to the Gezyne Laboratory Information System (LIS) project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.6.0] - 2026-09-10

### Added
- **Clinical Consultation & Outpatient Doctor Check-up Module (`/consultations/:testId`)**:
  - Full outpatient clinical encounter documentation adhering to international SOAP (Subjective, Objective, Assessment, Plan) guidelines and DOH Philippine Package of Essential NCD Interventions (PhilPEN) Clinical Practice Guidelines (CPG).
  - **Subjective Assessment**: Chief complaint, History of Present Illness (HPI), Past Medical History (PMH), current medications, Review of Systems (ROS), and prominent allergy warning alerts / NKDA flag.
  - **DOH PhilPEN Lifestyle Risk Profiling**:
    - Interactive Family Medical History with selectable Non-Communicable Disease (NCD) pills (Hypertension, Type 2 Diabetes, Premature CAD/Heart Disease, Stroke, Cancer, Asthma/Allergies, Chronic Kidney Disease) that auto-populate kinship details into clinical notes.
    - Tobacco & smoking screening with automated pack-years formula `(sticksPerDay / 20) * yearsSmoked`.
    - Alcohol consumption assessment with binge drinking risk indicators.
  - **Objective Clinical Vitals & Real-Time BMI Engine**:
    - Multi-metric vitals tracking: Blood Pressure (Systolic/Diastolic), Heart/Pulse Rate, Respiratory Rate, Temperature (°C), Oxygen Saturation (SpO2 %), Blood Glucose (mg/dL), Pain Scale (0-10), and Waist Circumference (cm).
    - Real-time Asia-Pacific / DOH Philippines BMI classification with color-coded status badges: Underweight (< 18.5), Normal (18.5 – 22.9), Overweight / At Risk (23.0 – 24.9), Obese Class I (25.0 – 29.9), and Obese Class II (>= 30.0).
    - Multi-system Physical Examination (PE) checklist and documentation.
    - Integrated Patient Diagnostic History displaying previous laboratory and imaging test results with one-click direct report previews (`/reports/preview/:id`).
  - **Clinical Assessment & Diagnosis**: Searchable ICD-10 diagnostic directory, suspected etiology, differential diagnoses list, and clinical impressions.
  - **Plan & Treatment**: Multi-item prescription builder (generic/brand names, dosage, route, frequency, duration, sig instructions), diagnostic requisitions for laboratory and imaging with custom input option, lifestyle/non-pharmacologic advice, follow-up scheduler, and specialist referrals.
- **Clinical Document Printing Suite**:
  - **Patient Medical Chart** (`/consultations/:testId/print/chart`): Full encounter hard-copy printout with official facility letterhead, complete SOAP documentation, vitals grid, DOH PhilPEN risk assessment, prescriptions table, and physician signature block.
  - **Optimized Print Layout**: Top-level `@page { size: portrait; margin: 6mm 8mm; }` eliminating oversized paper margins across Letter and A4 sizes, paired with a borderless `.chart-sheet` print container matching the on-screen form proportions.
  - **Official Prescription Pad** (`/consultations/:testId/print/prescription`): Philippine standard Rx pad with attending physician's PRC License, PTR, and S2 credentials.
  - **Medical Certificate** (`/consultations/:testId/print/med-cert`): Formal fit-to-work / illness certificate with diagnosis, recommended rest periods, and physician designation.
  - **Laboratory Request Requisition** (`/consultations/:testId/print/lab-request`): Standard requisition sheet for laboratory and imaging orders.
  - **Standardized Official Clinic Header**: Strictly one-line clinic title (`Gezyne Clinical Laboratory & Medical Clinic`) featuring complete facility address (`0330 Vergel De Dios St., Poblacion, Plaridel, Bulacan (Near Municipal Basketball Court)`), official DOH License Number (`Lic. No. 03-435-15CL-20`), and contact hotlines (`Tel: 0917-649-0807 / 0960-390-0921 / (044) 795-5007`).
- **Physician Identity & Credential Auto-Capture**:
  - Automatic detection of logged-in doctor accounts (roles: Doctor, Physician, Internist, Cardiologist, etc.) pre-filling attending physician details, PRC license, and clinical designation.
  - Room name matching (e.g., "Doctor's Check-up - Dr. Lorenzo") mapping directly to doctor accounts without duplicate entries.
  - Real-time dropdown synchronization linking physician selection to verified license numbers and designations.
- **Encounter Status Integrity**:
  - Unified system-wide recognition of "Checked" status as completed encounters across dashboard metrics, census statistics, status badges, and table filters.
- **NEQAS External Quality Assessment (EQA) Report Signatories Hub**:
  - Added dedicated Report Signatories configuration panel to the NEQAS Hub section matching the Levey-Jennings Hub layout, enabling users to select the Testing Medical Technologist, QC Supervisor / Validator, Approving Pathologist, and optional 2nd Pathologist directly before printing.
  - Seamlessly serializes chosen signatories into printable NEQAS Result Certificates (`/equipment/neqas/:recordId/print`) across both Central Server and Standalone Electron clients.
  - Upgraded official NEQAS certificate print view to dynamically support 3 or 4 signatory columns (`.signatures-grid.grid-4`) with live drawer preview and auto-capture of PRC license numbers.

### Changed
- **Clinical Batch Worksheet & Diagnostic Report Separation**:
  - Implemented standardized `isDoctorVisitTest` helper isolating outpatient doctor check-up visits from laboratory batch worksheets (`/worksheet/download` and `/worksheet/preview`) and diagnostic report exports.
  - Laboratory worksheets strictly display diagnostic laboratory specimens (CBC, Urinalysis, Blood Chemistry, etc.), preventing doctor check-ups from cluttering laboratory technologist worklists.
- **Two-Way Offline Synchronization Parity**:
  - Complete two-way offline synchronization for consultations, medical chart records, prescription entries, and physician signatures between standalone desktop clients and central server.
  - Comprehensive sync discrepancy audit log verification.

### Fixed
- **Family Medical History Notes Sanitization**:
  - Fixed an issue where clicking Family Medical History items or rendering notes resulted in `[object Object]` text in textareas.
  - Added robust sanitization filters across client event handlers, autosave pipelines, route handlers, and database persistence layers.

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
