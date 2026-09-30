/**
 * Backfill script: Populates revenue_entries table from historical patient.paymentHistory records.
 * Run once to provide instant historical financial data to the Costing module.
 */
const path = require('path');
const DATA_DIR = require('../lib/dataPath').getDataDir();
const SQLITE_FILE = path.join(DATA_DIR, 'lis-data.db');
const { createDb } = require('../lib/sqliteDb');

console.log('[backfill-revenue] Initializing database at', SQLITE_FILE);
const db = createDb(SQLITE_FILE);
global.db = db;

const Patient = require('../models/Patient');
const RevenueEntry = require('../models/RevenueEntry');

async function backfill() {
  try {
    const patients = await Patient.find();
    console.log(`[backfill-revenue] Found ${patients.length} total patient records to inspect`);

    let existingEntries = await RevenueEntry.find();
    console.log(`[backfill-revenue] Current revenue_entries count: ${existingEntries.length}`);

    // Create a set of existing (patientId + date) to avoid duplicates
    const existingKeys = new Set(existingEntries.map(e => `${e.patientId}_${e.revenueDate ? e.revenueDate.slice(0, 16) : ''}`));

    let backfilledCount = 0;

    for (const patient of patients) {
      if (!patient || !Array.isArray(patient.paymentHistory)) continue;

      for (const pay of patient.paymentHistory) {
        if (!pay) continue;
        const revDate = pay.timestamp || patient.createdAt || new Date().toISOString();
        const key = `${patient.id}_${revDate.slice(0, 16)}`;

        if (existingKeys.has(key)) continue;

        const clin = Number(pay.clinical) || 0;
        const xray = Number(pay.xray) || 0;
        const tot = Number(pay.total) || (clin + xray);

        // Even 0-value PhilHealth/HMO covered records can be tracked with their paymentMethod
        const entry = new RevenueEntry({
          patientId: patient.id,
          testId: Array.isArray(pay.tests) ? pay.tests.join(',') : '',
          paymentMethod: pay.paymentMethod || (pay.chargedToPhilhealth ? 'PhilHealth' : (pay.chargedToHealthCard ? 'Health Card' : 'Cash')),
          clinicalAmount: clin,
          xrayAmount: xray,
          totalAmount: tot,
          revenueDate: revDate,
          month: revDate.slice(0, 7),
          recordedBy: 'Backfill Script'
        });

        await entry.save();
        existingKeys.add(key);
        backfilledCount++;
      }
    }

    console.log(`[backfill-revenue] Successfully backfilled ${backfilledCount} revenue records!`);
    const totalNow = (await RevenueEntry.find()).length;
    console.log(`[backfill-revenue] Total revenue entries in database: ${totalNow}`);
    process.exit(0);
  } catch (err) {
    console.error('[backfill-revenue] Error backfilling revenue:', err);
    process.exit(1);
  }
}

backfill();
