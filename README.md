# Gezyne Laboratory Information System (LIS) v2.0.0

> **Gezyne Clinical Laboratory - Laboratory Information System (LIS) v2.0.0** – A comprehensive clinical diagnostic and laboratory management platform featuring a full-stack Node.js/Express server, real-time patient queue displays (kiosk), PM2 process safety management, and Electron installer packaging for Windows.

---

## 📁 Repository Layout

```
.
├── README.md               # (this file)
├── ads.json                # Kiosk ad configuration used by the Queue Display
├── lis-fullstack/          # Full-stack Express server, EJS views, PDF reports & Tray app
│   ├── build/              # Bundled installer resources & seed templates
│   ├── dist/               # Packaged standalone executable (via pkg)
│   ├── scripts/            # Build, seed, encryption & setup scripts
│   ├── tray/               # Electron Tray launcher & NSIS Installer (v2.0.0)
│   └── server.js           # Core LIS Server entrypoint
├── lis-app-standalone/     # Standalone Electron desktop client with offline cache
├── lis-mobile/             # Mobile wrapper (Cordova/Capacitor) for Android/iOS
└── test/                   # Integration, offline sync & diagnostic test scripts
```

---

## 📦 Building the Windows Installer (v2.0.0)

To create a single-file executable Windows NSIS installer (`Gezyne LIS Server Setup 2.0.0.exe`):

### 1. Build Server Executable & Prepare Seed Data
```powershell
cd "lis-fullstack"
npm install

# Build compiled server binary (output -> dist/laboratory-information-system.exe)
npm run build:exe

# Prepare initial admin seed & installer resources
npm run prepare-dist-data
```

### 2. Build Electron Tray & NSIS Installer
```powershell
cd tray
npm install

# Build installer (output -> tray/dist/Gezyne LIS Server Setup 2.0.0.exe)
npm run dist:win
```

Your completed installer will be output to:
`lis-fullstack/tray/dist/Gezyne LIS Server Setup 2.0.0.exe`

---

## 🛡️ PM2 Process Management & Safety

For production server safety, automatic crash recovery, and memory monitoring:

```powershell
# 1. Install PM2 globally on Windows
npm install -g pm2

# 2. (Optional) Configure automatic start on Windows boot
npm install -g pm2-windows-startup
pm2-startup install
```

When active, the Electron Tray app automatically detects PM2 and manages the LIS server via `ecosystem.config.js` (`lis-app`).

---

## 🚀 Development & Local Server Setup

```powershell
cd "lis-fullstack"
npm install
npm start            # Starts server on http://localhost:3000
```

Once running, access the LIS in your browser at `http://localhost:3000` or on your network IP (`http://<your-ip>:3000`).

---

## ✨ Key Features in v2.0.0

- 🏥 **Vibrant Patient Queue Kiosk**: Animated queue display (`/reception/assigned?kiosk=1`) optimized for TV displays and reception monitors.
- 🔐 **Modern Split-View Login**: Bounded login interface displaying Gezyne Clinical Laboratory address, contact info, and Facebook page details.
- 🔔 **Formatted SSE Notifications**: Real-time event notifications with clean icons for queue assignments, stashing, and test completions.
- 📋 **Comprehensive Test Modules**: Hematology, Blood Chemistry, Urinalysis, Fecalysis, Serology, Thyroid Panel, PT/APTT, X-Ray, ECG, and Ultrasound.
- 📁 **Centralized Data Storage**: Automatic data persistence to `C:\ProgramData\GezyneLIS` for multi-user Windows compatibility.

---

## 📌 License

Licensed under the **MIT License**. Created for Gezyne Clinical Laboratory.

