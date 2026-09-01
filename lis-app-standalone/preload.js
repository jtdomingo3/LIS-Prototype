/**
 * preload.js — Context bridge between the Electron main process and the
 *              renderer (web page). Exposes `window.lisApp` with safe
 *              IPC wrappers the injected status-bar and UI components use.
 */
const { contextBridge, ipcRenderer } = require('electron');

try {
  console.log('[preload] preload.js running (contextBridge will expose APIs)');
  try { globalThis.__preloadLoaded = true; } catch (e) { /* ignore */ }
} catch (e) { /* ignore */ }

contextBridge.exposeInMainWorld('lisApp', {
  /* ── queries ─────────────────────────────────────────────────── */
  getStatus:        ()      => ipcRenderer.invoke('get-status'),
  getQueue:         ()      => ipcRenderer.invoke('get-queue'),
  getDataStoreInfo: ()      => ipcRenderer.invoke('datastore-info'),

  /* ── actions ─────────────────────────────────────────────────── */
  queueOperation:   (op)    => ipcRenderer.invoke('queue-operation', op),
  forceSync:        ()      => ipcRenderer.invoke('force-sync'),
  retryConnection:  ()      => ipcRenderer.invoke('retry-connection'),
  clearCache:       ()      => ipcRenderer.invoke('clear-cache'),
  goOnline:         ()      => ipcRenderer.invoke('go-online'),
  printPreview:     (url)   => ipcRenderer.invoke('print-preview', { url }),

  /* ── settings & database management ─────────────────────────── */
  getSettings:      ()      => ipcRenderer.invoke('get-settings'),
  setSettings:      (s)     => ipcRenderer.invoke('set-settings', s),
  openSettings:     ()      => ipcRenderer.invoke('open-settings'),
  fullSync:         ()      => ipcRenderer.invoke('full-sync'),
  saveCredentials:  (email, password) => ipcRenderer.invoke('save-credentials', { email, password }),
  discardLocalChanges: ()   => ipcRenderer.invoke('discard-local-changes'),
  dropOfflineData:     ()   => ipcRenderer.invoke('drop-offline-data'),
  performBackup:       ()   => ipcRenderer.invoke('perform-backup'),
  deleteQueueItem:     (id) => ipcRenderer.invoke('delete-queue-item', id),
  clearQueue:          ()   => ipcRenderer.invoke('clear-queue'),

  /* ── security & app lock ─────────────────────────────────────── */
  getSecuritySettings: ()                 => ipcRenderer.invoke('get-security-settings'),
  changePin:           (curr, newP)       => ipcRenderer.invoke('change-pin', { currentPin: curr, newPin: newP }),
  setLockTimeout:      (timeoutMinutes)   => ipcRenderer.invoke('set-lock-timeout', { timeoutMinutes }),
  lockApp:             ()                 => ipcRenderer.invoke('lock-app'),
  unlockApp:           (pin)              => ipcRenderer.invoke('unlock-app', { pin }),
  reportActivity:      ()                 => ipcRenderer.invoke('report-activity'),

  /* ── event listeners ─────────────────────────────────────────── */
  onNetworkStatus: (callback) => {
    ipcRenderer.on('network-status', (_event, data) => callback(data));
  },
  onSyncComplete: (callback) => {
    ipcRenderer.on('sync-complete', (_event, data) => callback(data));
  },
  onFullSyncProgress: (callback) => {
    ipcRenderer.on('full-sync-progress', (_event, data) => callback(data));
  },
  onFullSyncEnd: (callback) => {
    ipcRenderer.on('full-sync-end', (_event, data) => callback(data));
  },
  onDropOfflineComplete: (callback) => {
    ipcRenderer.on('drop-offline-complete', (_event, data) => callback(data));
  },
  onAppLocked: (callback) => {
    ipcRenderer.on('app-locked', (_event, data) => callback(data));
  },
  onAppUnlocked: (callback) => {
    ipcRenderer.on('app-unlocked', (_event, data) => callback(data));
  }
});

/* ==================================================================
 *  In-App Security Lock Screen Overlay Controller
 * ================================================================== */
let lockPinInput = '';
let isLockVisible = false;
let lastReportedActivity = 0;

function reportUserActivity() {
  const now = Date.now();
  if (now - lastReportedActivity > 15000) {
    lastReportedActivity = now;
    ipcRenderer.invoke('report-activity').catch(() => {});
  }
}

// Track user interactions to keep session active
if (typeof window !== 'undefined') {
  window.addEventListener('mousemove', reportUserActivity, { passive: true });
  window.addEventListener('keydown', reportUserActivity, { passive: true });
  window.addEventListener('mousedown', reportUserActivity, { passive: true });
  window.addEventListener('touchstart', reportUserActivity, { passive: true });
}

function createLockScreenOverlay() {
  if (document.getElementById('lis-security-lockscreen')) return;

  const overlay = document.createElement('div');
  overlay.id = 'lis-security-lockscreen';
  overlay.style.cssText = `
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(11, 15, 25, 0.94);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    z-index: 2147483647;
    display: none;
    align-items: center;
    justify-content: center;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    user-select: none;
    color: #f1f5f9;
  `;

  overlay.innerHTML = `
    <style>
      #lis-security-lockscreen * { box-sizing: border-box; }
      .lock-card {
        background: rgba(30, 41, 59, 0.85);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 20px;
        padding: 36px 32px;
        width: 380px;
        max-width: 90vw;
        text-align: center;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 18px;
        animation: lockPopIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes lockPopIn {
        from { opacity: 0; transform: scale(0.92); }
        to { opacity: 1; transform: scale(1); }
      }
      .lock-icon-wrap {
        width: 64px;
        height: 64px;
        background: linear-gradient(135deg, rgba(37, 99, 235, 0.3), rgba(30, 58, 138, 0.4));
        border: 1px solid rgba(59, 130, 246, 0.4);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 28px;
        box-shadow: 0 8px 24px rgba(37, 99, 235, 0.3);
      }
      .lock-title {
        font-size: 20px;
        font-weight: 800;
        color: #ffffff;
        letter-spacing: -0.4px;
      }
      .lock-subtitle {
        font-size: 13px;
        color: #94a3b8;
        line-height: 1.4;
        margin-top: -8px;
      }
      .lock-dots {
        display: flex;
        gap: 16px;
        margin: 8px 0;
      }
      .lock-dot {
        width: 18px;
        height: 18px;
        border-radius: 50%;
        border: 2px solid rgba(255, 255, 255, 0.3);
        background: transparent;
        transition: all 0.15s ease;
      }
      .lock-dot.filled {
        background: #38bdf8;
        border-color: #38bdf8;
        box-shadow: 0 0 12px rgba(56, 189, 248, 0.7);
        transform: scale(1.15);
      }
      .lock-dot.error {
        background: #ef4444 !important;
        border-color: #ef4444 !important;
        box-shadow: 0 0 12px rgba(239, 68, 68, 0.7) !important;
      }
      .lock-keypad {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 10px;
        width: 100%;
        margin-top: 6px;
      }
      .lock-key {
        background: rgba(15, 23, 42, 0.6);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 12px;
        height: 48px;
        font-size: 18px;
        font-weight: 600;
        color: #f1f5f9;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.12s ease;
      }
      .lock-key:hover {
        background: rgba(255, 255, 255, 0.12);
        transform: translateY(-1px);
      }
      .lock-key:active {
        transform: scale(0.96);
        background: rgba(59, 130, 246, 0.3);
      }
      .lock-key.action {
        font-size: 14px;
        color: #94a3b8;
      }
      .lock-feedback {
        font-size: 12px;
        min-height: 18px;
        font-weight: 600;
        color: #f87171;
      }
      .shake {
        animation: shakeAnim 0.4s ease;
      }
      @keyframes shakeAnim {
        0%, 100% { transform: translateX(0); }
        20%, 60% { transform: translateX(-8px); }
        40%, 80% { transform: translateX(8px); }
      }
    </style>

    <div class="lock-card" id="lockCard">
      <div class="lock-icon-wrap">🔒</div>
      <div>
        <div class="lock-title">Gezyne LIS — Security Lock</div>
        <div class="lock-subtitle">Session timed out. Enter 4-digit PIN to continue.</div>
      </div>

      <div class="lock-dots" id="lockDots">
        <div class="lock-dot"></div>
        <div class="lock-dot"></div>
        <div class="lock-dot"></div>
        <div class="lock-dot"></div>
      </div>

      <div class="lock-feedback" id="lockFeedback"></div>

      <div class="lock-keypad">
        <button class="lock-key" data-digit="1">1</button>
        <button class="lock-key" data-digit="2">2</button>
        <button class="lock-key" data-digit="3">3</button>
        <button class="lock-key" data-digit="4">4</button>
        <button class="lock-key" data-digit="5">5</button>
        <button class="lock-key" data-digit="6">6</button>
        <button class="lock-key" data-digit="7">7</button>
        <button class="lock-key" data-digit="8">8</button>
        <button class="lock-key" data-digit="9">9</button>
        <button class="lock-key action" id="lockClearBtn">Clear</button>
        <button class="lock-key" data-digit="0">0</button>
        <button class="lock-key action" id="lockBackBtn">⌫</button>
      </div>
    </div>
  `;

  document.documentElement.appendChild(overlay);

  // Keypad click handlers
  overlay.querySelectorAll('.lock-key[data-digit]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handlePinDigit(btn.getAttribute('data-digit'));
    });
  });

  const clearBtn = overlay.querySelector('#lockClearBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      lockPinInput = '';
      updateDots();
      setLockFeedback('');
    });
  }

  const backBtn = overlay.querySelector('#lockBackBtn');
  if (backBtn) {
    backBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (lockPinInput.length > 0) {
        lockPinInput = lockPinInput.slice(0, -1);
        updateDots();
        setLockFeedback('');
      }
    });
  }
}

function updateDots(isError = false) {
  const dots = document.querySelectorAll('#lockDots .lock-dot');
  dots.forEach((dot, idx) => {
    if (isError) {
      dot.classList.add('error');
    } else {
      dot.classList.remove('error');
      if (idx < lockPinInput.length) {
        dot.classList.add('filled');
      } else {
        dot.classList.remove('filled');
      }
    }
  });
}

function setLockFeedback(msg) {
  const el = document.getElementById('lockFeedback');
  if (el) el.textContent = msg;
}

async function handlePinDigit(digit) {
  if (lockPinInput.length >= 4) return;
  lockPinInput += digit;
  updateDots();
  setLockFeedback('');

  if (lockPinInput.length === 4) {
    const pinToSubmit = lockPinInput;
    const res = await ipcRenderer.invoke('unlock-app', { pin: pinToSubmit });
    if (res && res.success) {
      hideLockScreen();
    } else {
      updateDots(true);
      setLockFeedback(res && res.reason ? res.reason : 'Incorrect PIN. Try again.');
      const card = document.getElementById('lockCard');
      if (card) {
        card.classList.remove('shake');
        void card.offsetWidth;
        card.classList.add('shake');
      }
      setTimeout(() => {
        lockPinInput = '';
        updateDots();
      }, 700);
    }
  }
}

function showLockScreen() {
  createLockScreenOverlay();
  const overlay = document.getElementById('lis-security-lockscreen');
  if (overlay) {
    overlay.style.display = 'flex';
    isLockVisible = true;
    lockPinInput = '';
    updateDots();
    setLockFeedback('');
  }
}

function hideLockScreen() {
  const overlay = document.getElementById('lis-security-lockscreen');
  if (overlay) {
    overlay.style.display = 'none';
    isLockVisible = false;
    lockPinInput = '';
    updateDots();
  }
}

// Global Keyboard Handler for Lock Screen
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e) => {
    if (!isLockVisible) return;
    e.stopPropagation();

    if (e.key >= '0' && e.key <= '9') {
      handlePinDigit(e.key);
    } else if (e.key === 'Backspace') {
      if (lockPinInput.length > 0) {
        lockPinInput = lockPinInput.slice(0, -1);
        updateDots();
      }
    } else if (e.key === 'Escape') {
      lockPinInput = '';
      updateDots();
    }
  }, true);
}

// IPC Listeners from main process
ipcRenderer.on('app-locked', () => {
  showLockScreen();
});

ipcRenderer.on('app-unlocked', () => {
  hideLockScreen();
});

// Check lock state on page load
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', async () => {
    try {
      const sec = await ipcRenderer.invoke('get-security-settings');
      if (sec && sec.isLocked) {
        showLockScreen();
      }
    } catch (_) {}
  });
}
