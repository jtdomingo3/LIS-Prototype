# Building the Windows Installer (NSIS) for Gezyne LIS — Standalone

This document describes how to build a Windows installer (.exe) for the
`lis-app-standalone` Electron app using `electron-builder` (NSIS), how to
produce a valid app icon, and common troubleshooting steps.

Follow these steps on a Windows machine (or use a Windows CI runner).

---

## Prerequisites

- Node.js 18+ and npm installed.
- Git (optional).
- Recommended: Build on a Windows machine or use a Windows CI runner.

On Windows you may also need one of the following if you see symlink extraction
errors while electron-builder downloads tools:

- Run PowerShell as Administrator when building, or
- Enable *Developer Mode* (Settings → Update & Security → For developers)

---

## Files added to this repo to help building

- `package.json` (build scripts + `build` config for electron-builder)
- `build/generate-icon.js` — generates `build/icon.ico` from a source PNG
- `build/README.md` — notes about the icon file

If you need to update packaging options, edit the `build` section in
`lis-app-standalone/package.json`.

---

## Step-by-step (local)

1. Open PowerShell and change to the standalone app folder:

```powershell
cd "C:\Users\Jeff\repo\LIS Prototype\lis-app-standalone"
```

2. Install dependencies (dev and production):

```powershell
npm install
```

3. Provide a source PNG for the icon. Place a PNG (preferably 256×256)
   at one of these paths (the generator will pick the first it finds):

- `assets/gezyne-logo.png`
- `assets/icon_256x256.png`
- `build/icon_256x256.png`

4. Generate a valid Windows `.ico` (this script uses `sharp` + `png-to-ico`):

```powershell
npm run generate-icon
# should print: Wrote build/icon.ico
```

The script resizes the PNG into multiple sizes (16,32,48,64,128,256) and
packs them into `build/icon.ico` which is compatible with rcedit and NSIS.

5. Build the NSIS installer (Windows):

```powershell
npm run dist:win
```

When successful, installer artifacts are written into `dist/`. Example:

- `dist/Gezyne LIS Setup 1.0.0.exe`
- `dist/win-unpacked/` (unpacked runtime)

Run the generated `Gezyne LIS Setup ...exe` locally to test installation
and shortcut creation.

---

## Troubleshooting

- Error: "Cannot create symbolic link : A required privilege is not held by the client"
  - Solution: enable Developer Mode or run PowerShell as Administrator; the
    extraction of electron-builder tool binaries can require symlink privilege.

- Error: `Reserved header is not 0 or image type is not icon` or
  `Error while loading icon ... invalid icon file size`
  - Cause: `build/icon.ico` is malformed or missing required sizes.
  - Solution: run `npm run generate-icon` to regenerate the icon from a 256×256
    PNG. Ensure `build/icon.ico` exists and is a valid multi-size icon.

- Error: `makensis.exe process failed` or NSIS macro errors
  - Ensure the NSIS toolchain in electron-builder cache is extracted. If AV
    software blocks `makensis.exe`, temporarily disable it or build on CI.

- If electron-builder downloads fail due to corrupted cache, clear the cache:

```powershell
rd /s /q "%LOCALAPPDATA%\electron-builder\Cache"
```
Then re-run the build.

---

## Code Signing (recommended)

To avoid SmartScreen warnings and to sign your executable/installer, obtain a
Windows code signing certificate (PFX). Provide its path and password to
`electron-builder` via environment variables before running the build:

```powershell
setx CSC_LINK "C:\path\to\certificate.p12"
setx CSC_KEY_PASSWORD "your-pfx-password"
```

On CI you should store these as protected secrets and set them in the runner's
environment for the build step.

---

## Optional: Preconfigure `settings.json` at install time

If you want the installer to write a default `settings.json` into the
Electron `userData` folder at installation time (for example, to prepopulate
`serverUrl`), you can add a small NSIS include to create the file. This is
advanced — if you want this I can provide a ready NSIS fragment and show how
to reference it from `package.json`'s `nsis.include` or `nsis.script`.

---

## CI (recommended)

For reproducible builds, use GitHub Actions with a Windows runner. Basic steps
in the workflow:

1. Checkout
2. Install Node (`actions/setup-node`)
3. `npm ci`
4. `npm run generate-icon`
5. `npm run dist:win`
6. Upload artifacts (`dist/`) to the workflow run

I can add a ready GitHub Actions YAML workflow that produces the NSIS installer
and uploads the artifact if you'd like.

---

## Final notes

- Always test the produced `.exe` on a clean VM to validate installer behavior
  (desktop shortcut creation, Start Menu entries, per-user vs per-machine).
- For production distribution, strongly consider signing the installer.

If you want, I will add:

- a ready-to-use GitHub Actions workflow to build the Windows installer, and/or
- a sample NSIS include to write a default `settings.json` at install time.

Pick one and I'll implement it.
