# lis-app-standalone

**Standalone desktop client for Gezyne Clinical Laboratory LIS** with offline support.

This Electron-based app connects to your LIS server (`http://192.168.31.86:3000`) and provides the **exact same UI** — but if the network goes down, it keeps working:

- ✅ View recently visited pages (cached locally)
- ✅ Encode patient data (queued for sync)
- ✅ Enter test results (queued for sync)
- ✅ Print previously viewed reports (from cache)
- ✅ Automatic sync when connection is restored

---

## Quick Start

### Prerequisites
- **Node.js 18+** installed on the workstation
- The LIS server (`lis-fullstack`) running on the network

### Install & Run

```powershell
cd lis-app-standalone
npm install
npm start
```

The desktop app will launch and connect to `http://192.168.31.86:3000`.

### Change Server Address

Edit `lib/config.js` and update `SERVER_URL`:

```js
module.exports = {
  SERVER_URL: 'http://YOUR_SERVER_IP:3000',
  // ...
};
```

---

## How It Works

### Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Electron App                       │
│                                                     │
│   ┌──────────────┐    ┌───────────────────────┐     │
│   │ BrowserWindow │───>│  LIS Server (remote)  │     │
│   │  (Same UI)   │    │  192.168.31.86:3000   │     │
│   └──────┬───────┘    └───────────────────────┘     │
│          │                                          │
│          │  When offline:                           │
│          │                                          │
│   ┌──────▼───────┐    ┌───────────────────────┐     │
│   │ Request      │───>│  Local Cache Server    │     │
│   │ Interceptor  │    │  127.0.0.1:30099      │     │
│   └──────────────┘    └───────┬───────────────┘     │
│                               │                     │
│   ┌────────────────┐   ┌──────▼─────────┐           │
│   │ Network Monitor│   │ Page Cache     │           │
│   │ (ping / 5sec) │   │ (HTML on disk) │           │
│   └────────────────┘   └────────────────┘           │
│                                                     │
│   ┌────────────────┐   ┌────────────────┐           │
│   │ Operation Queue│   │ Sync Engine    │           │
│   │ (JSON on disk) │──>│ (auto-replay)  │           │
│   └────────────────┘   └────────────────┘           │
└─────────────────────────────────────────────────────┘
```

### Online Mode
1. The BrowserWindow loads pages directly from the LIS server
2. Every page you visit is **cached locally** (HTML snapshot)
3. A green status bar at the bottom shows "Connected to Server"

### Offline Mode (automatic)
1. Network monitor detects the server is unreachable
2. Status bar turns **red** → "Offline Mode"
3. **Page navigation** → cached pages are served from the local server
4. **Form submissions** (create patient, enter results, etc.) are **intercepted and queued** to a local JSON file
5. A yellow banner shows "Saved offline — will sync when connection is restored"

### Sync (automatic)
1. Network monitor detects the server is back
2. Status bar shows syncing activity
3. Queued operations (patient creation, result entry, etc.) are **replayed to the server** in the exact order they were performed
4. Session cookies from the BrowserWindow are used for authentication
5. Page refreshes to show the latest data from the server

---

## Status Bar

The injected status bar at the bottom of every page shows:

| State | Indicator | Actions |
|-------|-----------|---------|
| **Online** | 🟢 Green bar — "Connected to Server" | — |
| **Online + pending** | 🟢 Green bar + "X pending sync" | **Sync Now** button |
| **Offline** | 🔴 Red bar — "Offline Mode" | Data entry is queued |

---

## File Structure

```
lis-app-standalone/
├── main.js                # Electron main process
├── preload.js             # Context bridge (renderer ↔ main)
├── package.json           # Dependencies & build config
├── lib/
│   ├── config.js          # Server URL, ports, intervals
│   ├── networkMonitor.js  # Ping-based connectivity checker
│   ├── pageCache.js       # HTML page cache (disk-backed)
│   ├── operationQueue.js  # Pending mutations queue (JSON)
│   ├── syncEngine.js      # Replays queue using Electron net
│   └── localServer.js     # Express server for offline pages
├── renderer/
│   ├── offline.html       # Fallback when no cache is available
│   ├── inject.css         # Status bar styles
│   └── inject.js          # Status bar + event handlers
└── README.md
```

---

## Building an Installer

```powershell
# Build Windows installer (.exe)
npm run build:win

# Output goes to dist/
```

The installer is created using `electron-builder`. You can customize the app icon by placing `icon.ico` in the `assets/` folder.

---

## Tips for Best Offline Experience

1. **Visit all important pages while online first** — the app caches each page as you navigate. Walk through: Dashboard → Patients → Tests → Reports
2. **Login once** — session cookies are stored persistently, so the app remembers your login across restarts
3. **Results entry offline** — enter results and they'll be queued. When back online, the results are submitted to the server
4. **Print from cache** — previously viewed report pages can be printed offline via Ctrl+P

---

## Limitations (v1)

- **Multi-step operations**: Creating a patient offline and immediately creating a test for that patient may not work perfectly (the patient doesn't exist on the server yet until sync)
- **File uploads**: Signatures and image uploads while offline are not supported — use these features when online
- **Real-time features**: SSE notifications (reception kiosk) don't work offline
- **Static assets**: Some CSS/images may not render perfectly offline if they weren't cached by the browser

---

## Data Storage Location

All local data is stored in Electron's user data directory:

```
%APPDATA%/lis-app-standalone/
├── page-cache/          # Cached HTML pages
│   ├── index.json       # URL → filename mapping
│   └── *.html           # Cached page files
└── data/
    └── pending-operations.json  # Queued offline operations
```
