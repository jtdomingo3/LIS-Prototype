# Start Gezyne LIS on Windows

This document explains how to build and run the Windows launcher that opens a console, starts the LIS server in production, and opens the default browser when the server is ready.

Recommended approach (current repo behavior):

- Native PowerShell launcher (recommended): compile `scripts/start-lis.ps1` into `dist/start-lis.exe` using `ps2exe`. The launcher now prefers running under `pm2` (if installed) and forces `NODE_ENV=production`. After starting the process the launcher runs `pm2 save` and opens `pm2 monit` so you can see real-time status.
- Packaged Node binary (optional): use `pkg` to bundle Node + app into `dist/laboratory-information-system.exe`. This is supported but may require distributing large native assets (Chromium, native `sharp` libs) alongside the EXE.

Files of interest

- `scripts/start-lis.ps1`: PowerShell launcher. Changes in this repo:
	- Sets `NODE_ENV=production` and `PORT` before starting.
	- Prefers `pm2 start ecosystem.config.js --env production` (falls back to `pm2 start server.js` or `npm start`).
	- Calls `pm2 save` and runs `pm2 monit` so the console shows PM2's interactive monitor.
- `ecosystem.config.js`: PM2 config shipped in the repo — used when starting with PM2.
- `scripts/launcher.js` and `scripts/build-launcher.js`: helpers for producing a small pkg-based launcher.
- `scripts/create-shortcut.ps1`: creates a Desktop shortcut that points to `dist/start-lis.exe` (preferred) or `dist/laboratory-information-system.exe`.

Prerequisites

- Node.js and npm installed.
- (Optional but recommended) PM2 installed globally: `npm install -g pm2`.
- (Optional) To run PM2 as a Windows service so it auto-starts on reboot, use `pm2-windows-service` or NSSM.
- To compile the PowerShell launcher to an EXE: `ps2exe` (Install with `Install-Module -Name ps2exe -Scope CurrentUser`).

Installing PM2 (recommended)

If you don't already have PM2 installed globally, install it and verify with these commands:

```powershell
npm install -g pm2
pm2 -v
```

Quick PM2 start example (once in project root):

```powershell
cd "C:\Users\Jeff\repo\LIS Prototype\lis-fullstack"
pm2 start ecosystem.config.js --env production
pm2 save
pm2 status
```

Install PM2 as a Windows service (optional)

To run PM2 itself as a Windows service so saved processes are resurrected on reboot, install the helper:

```powershell
npm i -g pm2-windows-service
pm2-service-install -n PM2
# Follow the pm2-windows-service documentation to configure the service
```

Build the native PowerShell launcher

1. Open PowerShell in the project root.

2. (If you need `ps2exe`) install it in the current user scope:

```powershell
Install-PackageProvider -Name NuGet -MinimumVersion 2.8.5.201 -Force -Scope CurrentUser
Install-Module -Name ps2exe -Scope CurrentUser -Force
```

3. Create `dist` and compile the launcher (this uses `scripts/start-lis.ps1` which now prefers PM2 and forces production mode):

```powershell
New-Item -ItemType Directory -Path .\dist -Force
Invoke-ps2exe .\scripts\start-lis.ps1 .\dist\start-lis.exe -icon .\dist\gezyne-logo.ico
```

Build the packaged Node EXE (optional)

1. Install dependencies and build using `pkg` (this creates `dist/laboratory-information-system.exe`):

```powershell
npm install
npm run build:exe
npm run build:exe:icon   # embeds icon into produced exe
npm run build:launcher   # builds a separate launcher.exe that spawns the server exe
```

Notes about `pkg` and native assets

- `pkg` cannot embed some large/native directories (Chromium for `puppeteer`, compiled `sharp` libs, PhantomJS, etc.). The build output warns about these — if your app uses Puppeteer or Sharp, you must ship their native assets alongside the EXE or configure your app to use a system-installed browser.

Running the launcher

- If PM2 is installed globally the launcher will start the app with PM2 and present the PM2 monitor:

```powershell
cd "C:\Users\Jeff\repo\LIS Prototype\lis-fullstack\dist"
.\start-lis.exe
```

Then check status with:

```powershell
pm2 status
pm2 logs lis-app
```

- If PM2 is not installed the launcher falls back to `npm start` and still forces `NODE_ENV=production`.

Auto-start considerations

- To have PM2 resurrect processes on reboot on Windows, install and configure `pm2-windows-service` or use NSSM/a Scheduled Task that runs `pm2 resurrect` at startup. Example (pm2-windows-service):

```powershell
npm i -g pm2-windows-service
pm2-service-install -n PM2
# Follow package docs to configure the service and allow it to launch saved processes
```

Troubleshooting

- If the launcher window closes immediately, run the script directly in PowerShell to see errors:

```powershell
cd ..\
.\scripts\start-lis.ps1 -NoNewWindow
```

- Verify `NODE_ENV` is `production` in logs or by visiting the app UI; check `pm2 status` to confirm the app is running under PM2.

If you want, I can:

- Install and configure PM2 globally and set up `pm2-windows-service` so the app auto-starts on boot.
- Update the `scripts/start-lis.ps1` launcher to always call `pm2 start --update-env` so env changes are applied to an existing process.

Choose which you'd prefer and I'll implement it.
