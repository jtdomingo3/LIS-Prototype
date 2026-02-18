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
  // Print using the original report URL (HTML) so the OS print dialog has a preview
  print:    (pdfPath, reportUrl) => ipcRenderer.invoke('print-pdf', { pdfPath, reportUrl }),
  savePdf:  (sourcePath)         => ipcRenderer.invoke('save-pdf', { sourcePath }),
});
