# Changelog — Gezyne LIS Standalone App (`lis-app-standalone`)

All notable changes to the Gezyne Laboratory Information System (LIS) Standalone Desktop Client application will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [3.1.0] - 2026-11-09

### Security Hardening & AWS Inspector Compliance
- **Zero Leaked Test Credentials**:
  - Eliminated all hardcoded test accounts (`admin@lab.com`) and plain-text passwords from standalone test suites and offline sync fixtures.
  - Implemented dynamic secret loader (`test/test-auth-config.js` via `getTestCredentials()`), resolving credentials from gitignored `.env` with synthetic fallback (`test-admin@local.test`).
  - Decoupled server admin email to dynamic `ADMIN_EMAIL` environment variable in standalone `syncEngine.js`.
  - Upgraded test authentication from plaintext password submissions to cryptographically verified JWT Bearer tokens.
- **SQLite Database & Runtime Secret Isolation**:
  - Untracked SQLite runtime WAL/SHM artifacts (`lis-data.db-wal`, `lis-data.db-shm`) and local secret files from Git tracking.
  - Hardened global `.gitignore` to prevent local workstation database buffers or encryption keyfiles from accidental repository commits.
- **AWS Inspector & OWASP Top 10 Remediation**:
  - Validated 100/100 automated security audit score across standalone workstation (`tools/security-audit/run-security-audit.js`).
  - Enforced strict TLS verification (CWE-295), dynamic CSPRNG keys (CWE-798), DOM XSS resilience (CWE-79), and dependency CVE overrides.

### Added
- **Pre-Build Test Gate & Post-Build Freshness Verification**:
  - Compulsory test execution prior to Windows setup compilation: all 22 system test suites must pass 100%, otherwise compilation is aborted immediately.
  - Automated post-build verification validating installer `.exe` creation time, binary sanity (>50MB), embedded Git commit SHA matching active repository HEAD, and zero secret leaks.
  - Builder / Publisher identity standardized to **`Gezyne-Jamir Software Tech`**.
- **KaTeX Mathematical Formula Rendering**:
  - Full LaTeX formula parsing with KaTeX integration, display equations (`$$...$$`), and single-dollar currency isolation.

### Changed
- **System-Wide Version Milestone Bump**: Updated standalone desktop client to **Version 3.1.0**.

---

## [3.0.0] - 2026-10-22

### Added
- **Automated Chemistry Calculation Engine & Calculation Parity**:
  - Full automatic calculation across 21 analytes including Albumin/Globulin (A/G) Ratio, eGFR CKD-EPI (2021 race-free equation), VLDL, LDL Friedewald, Non-HDL Cholesterol, Coronary Risk Index, Osmolality, Anion Gap, and Bilirubin Fractions.
  - Zero `NaN` and zero arithmetic error safeguards across both input events and server-side worksheet processing.
- **Enterprise-Grade UI/UX Modernization & Design Token System**:
  - Consistent corporate client branding palette across all 143 standalone desktop EJS views, modals, cards, badges, and sidebars.
  - FontAwesome 5 SVG icon parity for PhilHealth Konsulta (`fas fa-file-invoice-dollar`), Health Card / HMO (`fas fa-id-card-alt`), Reception Walk-in Desk (`fas fa-user-plus`), and Ultrasound Suites.
- **GezyneBot AI Knowledge Base v3.0.0**:
  - Upgraded knowledge base synchronization covering all 16 official user manual chapters, clinical reference panic values, and Philippine statutory updates.

### Changed
- **Version Milestone Bump**: Updated standalone desktop client to **Version 3.0.0**.

