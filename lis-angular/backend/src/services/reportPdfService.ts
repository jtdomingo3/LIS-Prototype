/**
 * Report PDF generator — uses puppeteer-core with the system Edge/Chrome browser.
 * Edge (Chromium) is pre-installed on every Windows 10/11 PC.
 * PDFs are cached in ~/Documents/LIS/reports/Lab_Report_<testId>.pdf.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getDb } from '../db/connection';
import { TestModel } from '../models/Test';
import { PatientModel } from '../models/Patient';
import { renderReportHtml } from '../lib/reportHtmlRenderer';

export const reportsDir = path.join(os.homedir(), 'Documents', 'LIS', 'reports');

export function ensureReportsDir(): void {
  try {
    fs.mkdirSync(reportsDir, { recursive: true });
  } catch (_) {}
}

export function findBrowserExe(): string | undefined {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch (_) {}
  }
  return undefined;
}

let _browser: any = null;
let _browserLaunchPromise: Promise<any> | null = null;
let _browserIdleTimer: NodeJS.Timeout | null = null;

function resetBrowserIdleTimer(): void {
  if (_browserIdleTimer) clearTimeout(_browserIdleTimer);
  _browserIdleTimer = setTimeout(async () => {
    try {
      if (_browser) {
        console.log('[reportPdfService] closing idle browser instance to conserve RAM');
        await _browser.close();
        _browser = null;
      }
    } catch (_) {}
  }, 60000);
}

export async function getBrowser(): Promise<any> {
  resetBrowserIdleTimer();
  if (_browser && _browser.isConnected()) return _browser;
  if (_browserLaunchPromise) return _browserLaunchPromise;

  _browserLaunchPromise = (async () => {
    let puppeteer: any;
    try {
      puppeteer = require('puppeteer-core');
    } catch (e) {
      try {
        puppeteer = require('puppeteer');
      } catch (ee) {
        return null;
      }
    }

    const executablePath = findBrowserExe();
    if (!executablePath) {
      console.warn('[reportPdfService] No Chromium/Edge/Chrome executable found on system.');
      return null;
    }

    console.log(`[reportPdfService] launching browser: ${executablePath}`);
    try {
      _browser = await puppeteer.launch({
        headless: 'new',
        executablePath,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-gpu',
          '--disable-dev-shm-usage',
          '--disable-extensions',
        ],
      });
      _browser.on('disconnected', () => {
        _browser = null;
        _browserLaunchPromise = null;
      });
    } catch (launchErr: any) {
      console.warn('[reportPdfService] browser launch failed:', launchErr?.message);
      _browser = null;
    }
    _browserLaunchPromise = null;
    return _browser;
  })();

  return _browserLaunchPromise;
}

export function getReportPath(testIdentifier: string): string {
  const safeId = String(testIdentifier || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(reportsDir, `Lab_Report_${safeId}.pdf`);
}

export function reportExists(testIdentifier: string): boolean {
  try {
    return fs.existsSync(getReportPath(testIdentifier));
  } catch (_) {
    return false;
  }
}

export async function generatePdfBufferFromHtml(html: string): Promise<Buffer | null> {
  const browser = await getBrowser();
  if (!browser) {
    throw new Error('Chromium/Edge browser not available for PDF generation');
  }

  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    const buf = await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: { top: '0.2in', bottom: '0.2in', left: '0.2in', right: '0.2in' },
    });
    return Buffer.from(buf);
  } finally {
    await page.close().catch(() => {});
  }
}

let _queue = Promise.resolve<any>(null);

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  _queue = _queue.then(fn, fn);
  return _queue;
}

export async function generatePdfForTest(testIdOrObj: any, baseUrl = 'http://localhost:3020', forceRegenerate = false): Promise<string | null> {
  let test: any;
  if (typeof testIdOrObj === 'string') {
    test = TestModel.findById(testIdOrObj);
  } else {
    test = testIdOrObj;
  }

  if (!test) return null;
  const testKey = test.test_id || test.id;
  const outPath = getReportPath(testKey);

  return enqueue(async () => {
    try {
      ensureReportsDir();

      // Check cache if newer than test updated timestamp
      if (!forceRegenerate && fs.existsSync(outPath)) {
        try {
          const stat = fs.statSync(outPath);
          const testUpdatedAt = test.updated_at ? new Date(test.updated_at).getTime() : 0;
          if (stat.mtimeMs >= testUpdatedAt && stat.size > 1000) {
            return outPath;
          }
        } catch (_) {}
      }

      const patient = test.patient_id ? PatientModel.findById(test.patient_id) : null;
      const html = renderReportHtml(test, patient || ({} as any), baseUrl, { print: false, inlineImages: true });
      const buf = await generatePdfBufferFromHtml(html);

      if (buf) {
        fs.writeFileSync(outPath, buf);
        console.log(`[reportPdfService] Wrote PDF: ${path.basename(outPath)}`);
        return outPath;
      }
      return null;
    } catch (err: any) {
      console.error(`[reportPdfService] Failed generating PDF for ${testKey}:`, err?.message || err);
      return null;
    }
  });
}
