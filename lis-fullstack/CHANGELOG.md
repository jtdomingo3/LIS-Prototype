# Changelog — Gezyne LIS Server App (`lis-fullstack`)

All notable changes to the Gezyne Laboratory Information System (LIS) Server application will be documented in this file.

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
- **Package Version Bump**: Updated `lis-fullstack` to version `2.6.2`.

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
  - Subjective assessment with Chief complaint, HPI, PMH, current medications, ROS, and allergy warning alerts / NKDA flag.
  - Interactive Family Medical History with selectable Non-Communicable Disease (NCD) pills.
  - Tobacco smoking screening with pack-years formula and alcohol risk assessment.
  - Objective clinical vitals grid with real-time Asia-Pacific / DOH Philippines BMI classification.
  - Searchable ICD-10 diagnostic directory, differential diagnoses, and treatment plans.
  - Multi-item prescription builder and diagnostic requisitions.
- **Clinical Document Printing Suite**:
  - Patient Medical Chart (`/consultations/:testId/print/chart`) with official clinic letterhead.
  - Official Prescription Pad (`/consultations/:testId/print/prescription`) with PRC, PTR, and S2 credentials.
  - Medical Certificate (`/consultations/:testId/print/med-cert`) for fit-to-work / illness declarations.
  - Laboratory Request Requisition (`/consultations/:testId/print/lab-request`).
- **NEQAS External Quality Assessment (EQA) Report Signatories Hub**:
  - Report Signatories configuration panel in NEQAS Hub section.
  - Dynamic 3- or 4-column signature layout with PRC credential capture.

### Changed
- Clinical batch worksheet (`/worksheet/download` and `/worksheet/preview`) strictly isolates laboratory specimens from doctor consultations.
- Two-way offline synchronization parity for consultation records and doctor signatures.
