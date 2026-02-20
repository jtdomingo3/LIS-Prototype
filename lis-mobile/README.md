# LIS Mobile (Cordova) — rebuilt scaffold

This is a fresh offline-capable Cordova scaffold for the LIS app. It contains a lightweight local `DataStore` + `OperationQueue` and a small UI to exercise offline → sync flows.

Quick start:
1. Install Cordova CLI (if needed): `npm i -g cordova`
2. Install Android SDK / Platform Tools (or use a device)
3. From this folder:
   ```sh
   npm run cordova-add-android
   npm run cordova-build-android
   npm run cordova-run-android
   ```

Notes:
- Default SERVER_URL in the POC is `http://10.0.2.2:3000` (Android emulator → host machine).
- This scaffold **does not** modify `lis-app-standalone`; it's a separate project for mobile porting.

Next recommended steps:
- Verify remote-wrapper UX by opening the remote server in the emulator/device.
- Port renderer pages and adapt `DataStore`/`OperationQueue` to match `lis-app-standalone` behaviour.
