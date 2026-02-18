# Gezyne LIS Server — Installer Build Guide

This document explains how to produce a Windows NSIS installer for **Gezyne LIS Server** (tray + server EXE). It covers prerequisites, build steps, packaging details (icons, data seed), NSIS custom pages (license, install-scope), and common troubleshooting.

## Overview

We package two parts:
- Server: a single packaged EXE (created via `pkg`) and its runtime assets under `../dist`.
- Tray: an Electron tray app that launches/controls the server, built and packaged with `electron-builder` (NSIS target).

The tray's `electron-builder` config must include server `../dist` as `extraResources` and the `build` folder (icon, TERMS) so the installed app has the same runtime layout as the dev copy.

## Prerequisites

- Node.js (14+ recommended for `pkg` compatibility; follow `pkg` docs for supported versions)
- npm
- Python & Windows-build-tools are not required for pure JS builds, but required for native modules if you build them
- `pkg` installed (global or via package script)
- `electron-builder` in `tray` devDependencies
- `makensis` (included with electron-builder NSIS runtime on CI; locally ensure you have NSIS available if needed)

## Key files in repo
- `lis-fullstack/scripts/make-dist-data.js` — generates `build/installer-resources/data-users.json` (admin-only) and `data.json`.
- `lis-fullstack/seed.js` — seeder used by server (should be configured to respect installer-provided data when present).
- `lis-fullstack/tray/scripts/generate-icon.js` — builds `build/icon.ico` from a PNG source.
- `lis-fullstack/tray/package.json` — electron-builder configuration: ensure `extraResources` includes server `../dist` and `build` folder and `nsis.license` points at `build/TERMS.txt`.
- `lis-fullstack/tray/build/installer.nsh` — NSIS include fragment for custom install pages (scope, elevation, additional file copies).

## Build steps (recommended sequence)

1. Build the server EXE (pkg)

```powershell
cd "c:\Users\Jeff\repo\LIS Prototype\lis-fullstack"
# Example: this script should produce ../dist (server exe + runtime folders)
npm run build:exe
```

Notes: `pkg` often warns about native module directories (puppeteer, sharp). Those directories must be shipped next to the EXE (include them in `../dist`) or excluded/handled per your app's runtime needs.

2. Generate installer data (admin-only user)

```powershell
node scripts/make-dist-data.js
# or via package.json script:
npm run prepare-dist-data
```
This creates `build/installer-resources/data-users.json` with admin credentials and an empty `data.json`.

3. Generate icon for tray

```powershell
cd lis-fullstack/tray
npm run generate-icon
```
This writes `tray/build/icon.ico` (and other build assets). Confirm the file exists:

```powershell
Get-ChildItem .\build\icon.ico
```

4. Confirm `tray/package.json` electron-builder config

- `build.extraResources` must include:
  - `from: "../dist"` -> `to: "server"` (so installed resources/server contains server EXE)
  - `from: "../build/installer-resources"` -> `to: "installer-resources"`
  - `from: "build"` -> `to: "build"` (copy the whole build folder containing `icon.ico`, `TERMS.txt`, `installer.nsh`)
- `build.asarUnpack` include `build/icon.ico` (optional, but safe) to ensure a filesystem path exists at runtime.
- `build.win.icon` should point at `build/icon.ico` so the EXE is embedded with the icon.

Example snippet (in `tray/package.json`):

```json
"build": {
  "appId": "com.gezyne.lis-server",
  "productName": "Gezyne LIS Server",
  "directories": { "buildResources": "build", "output": "dist" },
  "files": ["**/*", "!dist/**", "!node_modules/.cache/**"],
  "extraResources": [
    { "from": "../dist", "to": "server", "filter": ["**/*"] },
    { "from": "../build/installer-resources", "to": "installer-resources", "filter": ["**/*"] },
    { "from": "build", "to": "build", "filter": ["**/*"] },
    { "from": "../ecosystem.config.js", "to": ".", "filter": ["ecosystem.config.js"] }
  ],
  "asarUnpack": ["build/icon.ico"],
  "win": { "target": ["nsis"], "icon": "build/icon.ico" },
  "nsis": { "license": "build/TERMS.txt", "oneClick": false, "perMachine": true, "allowElevation": true, "include": "build/installer.nsh" }
}
```

5. Build the tray installer

```powershell
cd lis-fullstack/tray
npm run dist:win
# (this runs generate-icon then electron-builder --win nsis in the current setup)
```

Watch the build logs. electron-builder creates an intermediate `dist/win-unpacked` and then the NSIS installer `dist/Gezyne LIS Server Setup <ver>.exe`.

## Verify installed layout (before and after install)

- Before running installer: inspect `dist\win-unpacked\resources\build` to confirm `icon.ico` and other build files are present.

```powershell
Get-ChildItem .\dist\win-unpacked\resources\build -Recurse
```

- After running installer, verify resources in installed path:
  - All-users: `C:\Program Files\Gezyne LIS Server\resources\build\icon.ico`
  - Per-user: `%LOCALAPPDATA%\Programs\Gezyne LIS Server\resources\build\icon.ico`

If `icon.ico` is missing in the installed resources, electron-builder's `extraResources` did not copy it; check the `files`/`extraResources` paths and that `tray/build/icon.ico` existed at build time.

If you prefer hard-guarantee at install time, add an NSIS copy in `build/installer.nsh` (see snippet below).

## NSIS: ensure icon copied at install time (optional hard-copy)

Add this to `tray/build/installer.nsh` (use safe NSIS constructs — nsDialogs etc. already in the project):

```nsis
Section "CopyBuildAssets"
  SetOutPath "$INSTDIR\resources\build"
  IfFileExists "$EXEDIR\resources\build\*" 0 +2
  CopyFiles /SILENT "$EXEDIR\resources\build\*" "$INSTDIR\resources\build\"
SectionEnd
```

This copies the builder's `resources/build` folder into the installed app's `resources/build` if electron-builder didn't already place `icon.ico` there.

## Installer pages: License & Install Scope

- `nsis.license` (set to `build/TERMS.txt`) shows a Terms & Conditions page automatically.
- Custom install scope (per-user vs per-machine) and elevation logic belong in `build/installer.nsh`. Ensure your script uses nsDialogs and re-launches the installer elevated for an all-users install when needed. Existing `installer.nsh` in this repo already contains that flow; confirm it is included via `nsis.include`.

## Runtime UI icon handling

- Electron's `nativeImage.createFromPath()` can load `.ico` files but web `<img>` elements do not always render `.ico` well across Electron versions. Use the following approach in `tray/main.js` and renderer code:
  - At runtime, `findAppIcon()` should try `process.resourcesPath + '/build/icon.ico'`, `process.resourcesPath + '/icon.ico'`, `__dirname + '/../build/icon.ico'`, and the exe path (`process.execPath`) as a last resort.
  - Expose a `ipcMain.handle('get-app-icon')` that returns a `nativeImage.toDataURL()` so the renderer sets `<img src="data:...">` and avoids `.ico` rendering issues.

## PM2 / Logs

- The tray app uses `pm2 jlist` to locate `pm_out_log_path` and `pm_err_log_path` for `lis-app` processes. Ensure PM2 is running under the same user context as the tray app (or that tray has permission to read PM2 logs). If logs are missing in install, check `%USERPROFILE%\.pm2\logs` and `ecosystem.config.js` settings.

## Common issues & fixes

- Missing `icon.ico` in installed resources
  - Confirm `tray/build/icon.ico` existed before running `npm run dist:win`.
  - Use `extraResources` to copy the `build` folder (``{ from: "build", to: "build", filter: ["**/*"] }``).
  - Optionally add NSIS section to copy files during install.

- NSIS makensis errors
  - Use nsDialogs constructs — avoid runtime `${If}` macros unsupported by the embedded makensis. Test `makensis` locally to debug syntax issues.

- pkg warnings about native modules
  - `pkg` cannot embed large native-subtree directories (e.g., puppeteer/.local-chromium). Ship those directories next to the EXE in `../dist` or exclude their functionality.

- In-app header icon broken
  - Web `<img>` doesn't reliably read `.ico`. Use `ipcMain.handle('get-app-icon')` to provide a PNG data URL (via `nativeImage.toPNG()`/`toDataURL()`) and set it in renderer.

- Logs not showing in installed environment
  - PM2 may run as a different user or have different `PM2_HOME`. Use `pm2 jlist` and tail `pm_out_log_path`/`pm_err_log_path`. Also check project-local `logs/` folder.

## Signing and distribution

- Code-signing installers and EXEs is recommended for Windows trust. Integrate `win.signingHashAlgorithms` / certificate configuration into CI or your local `electron-builder` environment. See electron-builder docs for `sign` on Windows.

## Quick verification checklist

- [ ] `lis-fullstack/dist` contains server EXE and needed runtime folders.
- [ ] `lis-fullstack/tray/build/icon.ico` exists.
- [ ] `lis-fullstack/tray/build/TERMS.txt` exists.
- [ ] `npm run dist:win` produces `dist\win-unpacked\resources\build\icon.ico`
- [ ] Install produced EXE and confirm installed path contains `resources\build\icon.ico`
- [ ] Tray app shows correct tray icon and in-window header icon.
- [ ] PM2 logs are visible in tray UI.

## Useful commands

```powershell
# Build server exe (project-specific)
cd lis-fullstack
npm run build:exe

# Prepare installer data
node scripts/make-dist-data.js

# Build tray installer
cd lis-fullstack/tray
npm run generate-icon
npm run dist:win

# Inspect unpacked build
Get-ChildItem .\dist\win-unpacked\resources\build -Recurse

# After install: inspect installed resources
Get-ChildItem "C:\Program Files\Gezyne LIS Server\resources\build" -Recurse
Get-ChildItem "$env:LOCALAPPDATA\Programs\Gezyne LIS Server\resources\build" -Recurse
```

## Troubleshooting steps (if installer missing `icon.ico`)

1. Confirm `tray/build/icon.ico` exists before running `dist:win`.
2. Run `npm run dist:win` and watch logs for `extraResources` copy messages.
3. Inspect `dist/win-unpacked/resources/build` — if `icon.ico` missing, electron-builder didn't include it; re-check `extraResources.from` paths (they are relative to `tray` package working directory at build time).
4. As a last resort, add an NSIS copy section (`installer.nsh`) to copy `$EXEDIR\resources\build\icon.ico` to `$INSTDIR\resources\build\icon.ico` on install.

---

If you want, I can now:
- Run a local build and verify `dist/win-unpacked\resources\build\icon.ico` exists, or
- Add the NSIS install-time copy snippet to `tray/build/installer.nsh` so the installer guarantees `icon.ico` is present after installation.

Which action should I take next?