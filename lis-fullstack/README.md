# Gezyne LIS Server (Full-Stack) v2.3.0

[![Version](https://img.shields.io/badge/version-2.3.0-emerald.svg?style=flat-square)](https://github.com/gezyne/lis-prototype)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg?style=flat-square&logo=node.js)](https://nodejs.org/)
[![Database](https://img.shields.io/badge/database-SQLite%20(better--sqlite3%20%2F%20sql.js)-blue.svg?style=flat-square&logo=sqlite)](https://www.sqlite.org/)

A full-stack clinical Laboratory Information System server built with Node.js, Express, and high-performance SQLite storage (`lis-data.db`).

---

## 🌟 Features in v2.3.0

- 🔐 **Authentication & Bearer Token API**: Role-based access control with bcrypt password hashing and HMAC-SHA256 Bearer tokens for client synchronization.
- 👥 **Patient Records Management**: Full CRUD operations, PhilHealth data, automated code generation, and payment histories.
- 🧪 **Multi-Department Test Workflows**: Hematology, Blood Chemistry, Urinalysis, Fecalysis, Serology, Thyroid, PT/APTT, Ultrasound, ECG, X-Ray, and 2D Echo.
- 🏥 **Real-Time Patient Queue & Kiosk**: Live Server-Sent Events (SSE) queue broadcast with audio-visual notifications.
- 📄 **Puppeteer PDF Engine**: High-resolution clinical diagnostic reports with dynamic barcodes and digital signatures.
- 🛡️ **Automated SQLite WAL Backup**: Scheduled 3:00 PM backups with active WAL checkpointing (`backup_db_${ts}.db` and `backup_${ts}.json`) with 30-day retention.
- 📱 **Adaptive UI**: EJS layout featuring auto-collapsing sidebars for small displays, child preview windows, and responsive widths.

---

## 🚀 Quick Start

### Installation

```bash
cd lis-fullstack
npm install
```

### Starting the Server

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

Default access URL: `http://localhost:3000` (or network LAN IP).

---

## 📁 Directory Structure

```
lis-fullstack/
├── lib/               # SQLite database adapter, token helper, PDF generator & logger
├── middleware/        # Authentication, authorization, and rate limiting middleware
├── models/            # Data models: Patient, Test, User, Template
├── public/            # Static client assets (CSS, JS, images, audio)
├── routes/            # Express routes (auth, reception, patients, tests, reports, users, settings)
├── scripts/           # Windows service installers, data seeders & icon generators
├── tray/              # Electron System Tray launcher and NSIS Windows installer
├── views/             # Responsive EJS views and report templates
└── server.js          # Main Express application entrypoint
```

---

## 🔒 Security & Middleware

- **Password Protection**: Salted bcrypt hashing (12 rounds) on all stored user accounts.
- **Bearer Tokens**: Native HMAC-SHA256 tokens (`POST /api/auth/token`) with constant-time verification.
- **Security Headers**: `helmet` configured for local inline resources and cross-origin embedding.
- **Rate Limiting**: `express-rate-limit` active on authentication routes.
- **Safe Endpoints**: Protected management restore routes and authorized data export streams.

---

## 📦 Building the Windows Installer (v2.3.0)

```powershell
# 1. Compile server binary and prepare seed resources
npm run build:exe
npm run prepare-dist-data

# 2. Package Tray Launcher & NSIS Installer
cd tray
npm install
npm run dist:win
```

Output: `lis-fullstack/tray/dist/Gezyne LIS Server Setup 2.3.0.exe`

---

## 📌 License

Licensed under the **MIT License**. Created for **Gezyne Clinical Laboratory**.
