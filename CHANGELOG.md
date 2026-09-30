# Changelog

All notable changes to the Gezyne Laboratory Information System (LIS) project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.6.2] - 2026-09-26

### Added
- **Human Resources (HR) & Philippine Payroll Management Module (`/hr`)**:
  - **Employee Master Directory (`/hr/employees`)**:
    - Centralized management of clinic staff profiles: Employee Code, full legal name (with automatic stripping of medical degrees/credentials like "MD, FPSP" for clean legal records while preserving clinical credentials on profiles), department, position/role, employment status (Active, Resigned, AWOL, Terminated with separation dates and reasons).
    - Separation tracking with separation date, reason, and automated archival.
    - System Account segregation (`isSystemAccount`) preventing non-human IT/reception logins from cluttering employee lists and payroll computations.
    - Flexible pay structures: Daily Duty (for clinic/lab staff with daily rates and 5-day week caps) vs Fixed Monthly (for pathologists/doctors) vs Commission Only (exempt consulting physicians).
    - Statutory ID management: TIN, SSS, PhilHealth PIN, and Pag-IBIG (HDMF) Mid number.
    - Recurring allowances: Rice subsidy, transport, meal, and custom allowances with audit notes.
  - **Employee Self-Service / Personal Portal (`/hr/my`)**:
    - Dedicated portal for authenticated employees to log and review DTR attendance, submit leave applications, track approval statuses, and view/print confidential payslips and annual BIR 2316 tax summaries.
  - **Daily Time Record (DTR) & Attendance Engine (`/hr/my/dtr`, `/hr/employees/:id/dtr`)**:
    - Daily biometric and manual attendance logging (Morning In/Out, Afternoon In/Out).
    - Real-time computation of regular hours, undertime/tardiness, overtime hours, night differential, and holiday premiums (Regular vs Special Non-Working).
  - **Leave Management & Approval Workflow (`/hr/leaves`)**:
    - Leave applications supporting Vacation Leave (VL), Sick Leave (SL), Maternity, Paternity, Solo Parent, Bereavement, Emergency, and Leave Without Pay (LWOP).
    - Automatic leave balance credit checking and validation.
    - Multi-stage approval workflow (Pending -> Approved / Rejected) with administrator remarks.
    - Official Printable Leave Application Slip (`/hr/print/leave/:id`) with employee signature and approving supervisor sign-offs.
  - **Philippine Statutory Contributions & Tax Engine (`lib/philippineContributions.js`)**:
    - 2025/2026 SSS contribution schedule calculating Employee Share (EE), Employer Share (ER), and mandatory provident fund (WISP/MPF) contributions across monthly salary credit brackets.
    - PhilHealth 5.0% contribution rate with equal 50-50 split between employee and employer subject to statutory salary floor and ceiling.
    - Pag-IBIG (HDMF) contribution calculation with statutory salary ceilings.
    - BIR TRAIN Law graduated withholding tax calculation (semi-monthly and monthly brackets) with non-taxable minimum wage exemptions and de minimis benefit exclusions.
  - **Semi-Monthly & Monthly Payroll Processing (`/hr/payroll`, `/hr/payroll/compute`, `lib/payrollComputer.js`)**:
    - Batch computation for active staff: Gross pay, overtime/holiday adjustments, itemized statutory deductions (SSS, PhilHealth, Pag-IBIG, Withholding Tax), salary loans, cash advances, and net take-home pay.
    - Payroll status workflow: Draft -> Approved -> Paid.
    - Excel Payroll Register export (`/hr/export/payroll?month=YYYY-MM`) for banking and accounting.
  - **Official HR Printable Documents Suite**:
    - Confidential Employee Payslip (`/hr/print/payslip/:id`) with earnings, contributions, and net pay breakdown.
    - Certificate of Employment (COE) (`/hr/print/coe/:id`) in formal legal Philippine format, signed by Laboratory Owner / Medical Director.
    - Certificate of Exit Clearance (`/hr/print/clearance/:id`) with multi-department sign-offs.
    - BIR Form 2316 Tax Summary report (`/hr/print/tax-summary/:id/:year`).

- **Costing & Financial Profitability (P&L) Module (`/costing`)**:
  - **Cost-Per-Test Analysis Engine (`/costing/cost-per-test`, `models/CostPerTest.js`)**:
    - Direct itemized unit cost breakdown: Reagent cost, calibrators/controls, consumable supplies (tubes, needles, tips, slides), direct MedTech labor, and equipment depreciation/overhead.
    - Real-time gross margin %, markup %, and suggested retail price (SRP) calculations.
    - Direct reagent inventory mapping for automated price adjustment tracking.
  - **Operating Expenses Tracker (`/costing/expenses`, `models/Expense.js`)**:
    - Clinic expenditure tracking across standardized categories: Reagents, Staff Salaries, Rent, Utilities, Equipment Maintenance, Regulatory & Licensing (DOH, FDA, BIR, NEQAS), Biohazard Waste Disposal, and Miscellaneous.
    - Support for recurring expenses, invoice attachments, and payment methods.
  - **Revenue & Profitability Analytics (`/costing`, `/costing/revenue`, `/costing/monthly`)**:
    - Patient diagnostic revenue tracking by payment channel (Cash, GCash, Bank Transfer, HMO/Corporate).
    - Executive dashboard: Total Revenue, COGS, OPEX, Gross Profit, Operating Income, and Net Profit Margin %.
    - Accounting-style Monthly Income Statement (`/costing/monthly/:month`) with division-by-zero protection.
  - **Supplier Model Configuration**:
    - Reagent vendor quotes, packaging sizes, volume discounts, and unit conversion management.

- **2D Echocardiography Dual-Form & Letter Print Engine**:
  - **Dual-Sheet Architecture (`/reports/results/echocardiography-2d`, `?sheet=all|info|reading`)**:
    - Sheet 1 (Info Sheet): M-mode / 2-D measurements, 3-column chamber/aorta matrix, and 9-column Doppler matrix.
    - Sheet 2 (Reading Sheet): Clinical interpretation, Color flow and Spectral Doppler findings, conclusion, and cardiologist signature.
    - Independent or combined 1-page Letter portrait printing with `page-break-inside: avoid`.
  - **Doppler Measurement 9-Subcolumn Grid Alignment**:
    - Standardized valve columns (Mitral, Aortic, Tricuspid, Pulmonic) with Left = Value, Right = Reference.
    - Pulmonic Vein diastolic, systolic, and sys/dias ratios cleanly positioned alongside PASP by TRJ, Total PASP, and PAT (`≥`).
    - Mitral Max Velocity: Streamlined data entry with default `E:` and `A:` prefix labels; automatic output formatting as `E: 0.8/3.0` & `A: 0.6/1.7`.
  - **Balanced Patient Header Layout**:
    - Rebalanced 6-column proportions (18%, 27%, 9%, 16%, 10%, 20%), preventing contact number wrapping or clipping without excessive dead space.

- **GezyneBot Clinical AI Knowledge Base v2.6.2**:
  - Expanded knowledge base across `lis-fullstack`, `lis-app-standalone`, and `lis-fullstack/tray` with comprehensive HR, payroll, statutory contributions, cost-per-test unit economics, and 2D Echocardiography guidance.
  - Added HR and Costing interactive feature cards and quick query exploration in the chatbot UI.

### Changed
- **Package Version Bump**: Updated all applications (`lis-fullstack`, `lis-app-standalone`, `lis-fullstack/tray`) to version `2.6.2`.
- **Standalone Workstation Parity**: Ported HR and Costing models, routes, lib utilities, views, and navigation into `lis-app-standalone` for complete parity with `lis-fullstack`.

---

## [2.6.1] - 2026-09-16

### Added
- **Non-Admin Documents Storage Directory (`~/Documents/LIS/data`)**:
  - Relocated default database location from `C:\ProgramData\GezyneLIS` to `~/Documents/LIS/data` (`C:\Users\<User>\Documents\LIS\data`), eliminating database loss and temp file wiping on production PCs lacking administrative permissions.
  - Automatic non-destructive migration (`migrateLegacyFiles`) of existing `lis-data.db`, `.env`, `data.json`, and `data-users.json` from `ProgramData` and user profile directories.
  - Aligned data directory with existing `~/Documents/LIS/backup`, `~/Documents/LIS/reports`, and `~/Documents/LIS/logs`.
- **Default Admin Account Auto-Seeding**:
  - Automatic seeding of default administrator account (`admin@lab.com` / `admin123`) into SQLite on startup whenever the `users` table is empty, preventing lockout after fresh installs or resets.
  - Zero plaintext passwords in code or disk; uses cost-factor 12 Bcrypt hash (`$2a$12$...`).
- **WebAssembly SQLite (`sql.js`) Persistence Hardening**:
  - Unreferenced 30-second periodic auto-flush safety net guaranteeing in-memory transactions reach disk.
  - Direct write fallback when Windows file locks prevent atomic `.tmp` rename.
  - Process exit listeners for `SIGTERM`, `SIGINT`, `beforeExit`, and `exit`.
- **Server Settings & Maintenance Recovery Suite (Electron Tray)**:
  - Overhauled all 4 recovery and maintenance buttons in the Electron Server Tray modal:
    1. **Restore Default Users**: Restores `admin@lab.com` / `admin123` with role `Admin`.
    2. **Reset Data Database**: Safely clears patient, test, and template records to an initial state while preserving user accounts and configuration.
    3. **Upload data.json**: Imports patient, test, and template backups directly into active SQLite database.
    4. **Upload data-users.json**: Imports user accounts and passwords directly into active SQLite database with universal support for raw arrays `[...]`, `{ users: [...] }`, and `{ data: [...] }`.
  - Decoupled architecture using live localhost endpoint (`POST /api/internal/maintenance/execute`) and filesystem trigger flags (`.restore-admin`, `.reset-database`, `.import-data`, `.import-users`), resolving Electron C++ native module ABI mismatches.

### Changed
- **Server & Settings Configuration**:
  - Centralized `.env` and `DATA_DIR` resolution in `routes/settings.js`, `lib/gezyneBotService.js`, and `tray/lib/gezyneBotService.js`.
  - Added startup diagnostic banner verifying `DATA_DIR`, `SQLITE_FILE`, engine, and disk writability.

### Security
- **Localhost-Only Maintenance API Protection**:
  - Restricted `POST /api/internal/maintenance/execute` strictly to local loopback socket connections (`127.0.0.1`, `::1`, `::ffff:127.0.0.1`), rejecting external LAN access with HTTP `403 Forbidden`.
  - Sanitized error responses preventing leakage of directory structures or internal stack traces.
  - Passed 100% compliance across automated OWASP Top 10, NIST SP 800-63B, and CIS benchmarks with 0 critical, high, medium, or low findings.

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
