# Changelog — Gezyne LIS Server App (`lis-fullstack`)

All notable changes to the Gezyne Laboratory Information System (LIS) Server application will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
