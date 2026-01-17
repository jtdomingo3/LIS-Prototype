# Start Gezyne LIS on Windows

This document explains how to build a reliable Windows launcher that opens a console, starts the LIS server, and opens the default browser when the server is ready.

Two recommended approaches:

- Native PowerShell launcher (recommended): converts the existing `scripts/start-lis.ps1` into a small native `start-lis.exe` using `ps2exe`. The produced EXE opens a PowerShell window, runs the server start logic (including opening the browser) and keeps the console open for logs. This is the approach used in this repo.
- Packaged Node binary (optional): use `pkg` to bundle the Node runtime and your app into a single EXE. This can work but often requires extra `pkg.assets` entries and special handling for Puppeteer/Chromium; it is more fragile.

Files of interest

- `scripts/start-lis.ps1`: PowerShell script that starts the server (opens console, runs `npm start`, polls the server, and opens the browser).
- `scripts/launcher.js` and `scripts/build-launcher.js`: helper scripts added to produce a small pkg-based launcher if desired.
- `scripts/create-shortcut.ps1`: creates a Desktop shortcut that points to either `dist/start-lis.exe` (preferred) or `dist/laboratory-information-system.exe`.

Build the native PowerShell launcher (no admin required)

1. Ensure you are running in PowerShell (can be non-admin) inside the project root.

2. Install NuGet provider and `ps2exe` into the current user scope (answer prompts with Y/A if requested):

```powershell
Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Force -Scope CurrentUser
Install-Module -Name ps2exe -Scope CurrentUser -Force
```

3. Create the `dist` folder and build the native launcher EXE (note the `.exe` extension):

```powershell
New-Item -ItemType Directory -Path .\dist -Force
Invoke-ps2exe .\scripts\start-lis.ps1 .\dist\start-lis.exe -icon .\dist\gezyne-logo.ico
```

4. Test the launcher by double-clicking `dist\start-lis.exe` (or run it from PowerShell). It should open a PowerShell window, start the server, and open your browser when ready.

Create Desktop shortcut (automatic)

Run the shortcut helper from the project root (this script prefers `dist\start-lis.exe`):

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\create-shortcut.ps1
```

Rebuilding the full packaged server EXE (optional)

If you still want a single bundled Node EXE for the whole app, use the `pkg` setup in `package.json`. Example:

```powershell
npm install
npm run build:exe:icon
```

Notes and caveats

- `ps2exe` produces a native exe from the PowerShell script and is the simplest, most reliable way to deliver a clickable launcher that starts the server.
- `pkg` can create a single Node EXE but often requires distributing large native assets (Chromium for Puppeteer) alongside the exe. If you use Puppeteer, either configure it to use a system-installed browser or distribute Chromium separately.
- The launcher approach expects the Node project files to be present (so `npm start` will run). If you prefer a fully self-contained server exe, the `pkg` approach is available but may need extra troubleshooting.

If you want, I can add a single `npm run build:launcher` command that automates the `ps2exe` step locally (note `ps2exe` must be installed in the current user or system scope first). If you'd like that, tell me and I'll add it.
