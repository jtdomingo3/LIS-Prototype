/**
 * preload-print.js — Preload for print source windows and print preview windows.
 *
 * - Source windows: window.print() is suppressed via executeJavaScript in main.js
 * - Preview windows: exposes lisAppPrint bridge for toolbar actions
 *
 * IMPORTANT: We do NOT expose window.lisApp here. The inject.js script checks
 * for window.lisApp and installs a window.print() override that would call
 * printPreview → causing infinite recursion in the source window.
 * By NOT having window.lisApp, inject.js bails out harmlessly.
 */
const { contextBridge, ipcRenderer } = require('electron');

// Expose print-specific API only
contextBridge.exposeInMainWorld('lisAppPrint', {
  /** Read a local PDF file via IPC and return its binary data as Uint8Array.
   *  We must use IPC because sandboxed preloads cannot require('fs'). */
  readPdfFile: (filePath) => ipcRenderer.invoke('read-pdf-file', { filePath }),
  savePdf:     (sourcePath) => ipcRenderer.invoke('save-pdf', { sourcePath }),
  openPdf:     (filePath) => ipcRenderer.invoke('open-pdf', { filePath }),
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  printSilent: (opts) => ipcRenderer.invoke('print-silent', opts),
  print:       () => ipcRenderer.invoke('print-current-window'),
  close:       () => ipcRenderer.invoke('close-current-window'),
});

// Prevent page scripts from calling window.print() and opening the
// Electron native print dialog. This preload runs before any page script,
// so overriding `print` here reliably suppresses in-page print triggers.
try {
  if (typeof globalThis !== 'undefined') {
    globalThis.print = function() { /* suppressed by preload */ };
  }
  if (typeof window !== 'undefined') {
    window.print = function() { /* suppressed by preload */ };
  }
} catch (e) { /* ignore if environment disallows */ }
