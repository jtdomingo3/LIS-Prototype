const express = require('express');
const router = express.Router();
const HealthCardRecord = require('../models/HealthCardRecord');
const Patient = require('../models/Patient');
const Test = require('../models/Test');
const { requireAuth, canAccessPatient } = require('../middleware/auth');
const sseEmitter = require('../lib/sseEmitter');
const { getHmoCatalog } = require('../lib/hmoCatalog');

// Standard list of Philippine HMO / Health Card Providers
const PH_HMO_PROVIDERS = [
  'Maxicare',
  'Intellicare',
  'Medicard',
  'PhilCare',
  'Cocolife',
  'ValuCare',
  'Etiqa (AsianLife)',
  'Carehealth Plus',
  'Eastwest Healthcare',
  'Fortune Care',
  'Insular Health Care (InLife)',
  'Pacific Cross',
  'Avega Healthcare Solutions',
  'Generali Philippines',
  'Lacson & Lacson',
  'Beneficial Life (BenLife)',
  'Dynamic Care',
  'IMS Wellth Care',
  'Kaiser International Healthgroup',
  'Other / Corporate Direct'
];

// Helper to determine test prefix
function getPrefixForLabel(label) {
  const s = String(label || '').toLowerCase();
  if (/x[-\s]?ray|radiograph|chest/.test(s)) return 'XR';
  if (/ecg/.test(s)) return 'ECG';
  if (/ultrasound|sono/.test(s)) return 'US';
  if (/fecal|fecalysis|stool/.test(s)) return 'FA';
  if (/urinal|urine|urinalysis/.test(s)) return 'UA';
  if (/sputum|pap|send[-\s]?out/.test(s)) return 'SO';
  if (/hematology|hemato|cbc/.test(s)) return 'HM';
  if (/(?:blood|chemistry|bun|crea|sgpt|sgot|lipid|hba1c|albumin|blood\s*sugar|fbs|ogtt)/.test(s)) return 'BC';
  return 'T';
}

function getNextTestId(prefix) {
  try {
    const counters = (global.db && typeof global.db.getCounters === 'function') ? (global.db.getCounters() || {}) : {};
    const next = (counters[prefix] || 0) + 1;
    counters[prefix] = next;
    if (global.db && typeof global.db.saveCounters === 'function') {
      global.db.saveCounters(counters);
    }
    return prefix + String(next).padStart(7, '0');
  } catch (e) {
    return prefix + Date.now();
  }
}

// GET /healthcard - Main Health Card (HMO) Panel
router.get('/', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const searchQuery = req.query.search || '';
    const hmoFilter = req.query.hmo || '';
    const statusFilter = req.query.status || '';
    const dateFrom = req.query.dateFrom || '';
    const dateTo = req.query.dateTo || '';

    let records = await HealthCardRecord.find();

    // Auto-sync demographic data from linked Patient
    for (const r of records) {
      if (r.patientId && (!r.hmoProvider || !r.cardNumber || !r.company)) {
        try {
          const p = await Patient.findById(r.patientId);
          if (p) {
            let changed = false;
            if (!r.hmoProvider && (p.healthInsuranceProvider || p.healthCardProvider)) {
              r.hmoProvider = p.healthInsuranceProvider || p.healthCardProvider;
              changed = true;
            }
            if (!r.cardNumber && (p.healthInsuranceId || p.healthCardNumber)) {
              r.cardNumber = p.healthInsuranceId || p.healthCardNumber;
              changed = true;
            }
            if (!r.company && (p.company || p.philhealthAgency)) {
              r.company = p.company || p.philhealthAgency;
              changed = true;
            }
            if (changed) await r.save();
          }
        } catch (_) {}
      }
    }

    // Compute overview stats
    const stats = {
      total: records.length,
      pendingLoa: records.filter(r => r.status === 'Pending LOA').length,
      approved: records.filter(r => r.status === 'Approved').length,
      billed: records.filter(r => r.status === 'Billed').length,
      paid: records.filter(r => r.status === 'Paid').length,
      totalCovered: records.reduce((sum, r) => sum + (Number(r.hmoCoveredAmount) || 0), 0),
      totalPaid: records.filter(r => r.status === 'Paid').reduce((sum, r) => sum + (Number(r.hmoCoveredAmount) || 0), 0)
    };

    // Apply filters
    if (searchQuery) {
      const s = searchQuery.toLowerCase().trim();
      records = records.filter(r => {
        const full = `${r.firstName} ${r.middleName} ${r.lastName}`.toLowerCase();
        const ctrl = String(r.controlNo || '').toLowerCase();
        const hmo = String(r.hmoProvider || '').toLowerCase();
        const card = String(r.cardNumber || '').toLowerCase();
        const loa = String(r.loaNumber || '').toLowerCase();
        const comp = String(r.company || '').toLowerCase();
        const diag = String(r.diagnosis || '').toLowerCase();
        return full.includes(s) || ctrl.includes(s) || hmo.includes(s) || card.includes(s) || loa.includes(s) || comp.includes(s) || diag.includes(s);
      });
    }

    if (hmoFilter) {
      records = records.filter(r => (r.hmoProvider || '').toLowerCase() === hmoFilter.toLowerCase());
    }

    if (statusFilter) {
      records = records.filter(r => r.status === statusFilter);
    }

    if (dateFrom) {
      records = records.filter(r => String(r.recordDate || r.createdAt || '').slice(0, 10) >= dateFrom);
    }
    if (dateTo) {
      records = records.filter(r => String(r.recordDate || r.createdAt || '').slice(0, 10) <= dateTo);
    }

    // Sort: Pending LOA first, then newest recordDate
    records.sort((a, b) => {
      if (a.status === 'Pending LOA' && b.status !== 'Pending LOA') return -1;
      if (a.status !== 'Pending LOA' && b.status === 'Pending LOA') return 1;
      return new Date(b.recordDate || b.createdAt || 0) - new Date(a.recordDate || a.createdAt || 0);
    });

    const catalog = getHmoCatalog();

    res.render('healthcard/index', {
      title: 'Health Card Panel',
      records,
      stats,
      catalog,
      hmoProviders: PH_HMO_PROVIDERS,
      searchQuery,
      hmoFilter,
      statusFilter,
      dateFrom,
      dateTo
    });
  } catch (error) {
    console.error('Health Card panel error:', error);
    req.flash('error_msg', 'Failed to load Health Card panel');
    res.redirect('/dashboard');
  }
});

// GET /healthcard/api/catalog
router.get('/api/catalog', (req, res) => {
  res.json({ success: true, catalog: getHmoCatalog(), hmoProviders: PH_HMO_PROVIDERS });
});

// GET /healthcard/api/:id - Get single record
router.get('/api/:id', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const record = await HealthCardRecord.findById(req.params.id);
    if (!record) return res.status(404).json({ success: false, error: 'Health Card record not found' });
    res.json({ success: true, record });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /healthcard - Create record manually or from patient intake
router.post('/', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const {
      patientId,
      recordDate,
      hmoProvider,
      cardNumber,
      company,
      loaNumber,
      loaDate,
      loaExpiry,
      availmentType,
      diagnosis,
      physician,
      notes
    } = req.body;

    let patient = null;
    if (patientId) {
      patient = await Patient.findById(patientId);
    }

    const recDate = recordDate || (new Date()).toISOString().slice(0, 10);
    const controlNo = HealthCardRecord.getNextControlNo(recDate);

    const record = new HealthCardRecord({
      controlNo,
      patientId: patient ? patient.id : (patientId || ''),
      recordDate: recDate,
      firstName: patient ? patient.firstName : (req.body.firstName || ''),
      middleName: patient ? patient.middleName : (req.body.middleName || ''),
      lastName: patient ? patient.lastName : (req.body.lastName || ''),
      hmoProvider: hmoProvider || (patient ? (patient.healthInsuranceProvider || patient.healthCardProvider) : '') || '',
      cardNumber: cardNumber || (patient ? (patient.healthInsuranceId || patient.healthCardNumber) : '') || '',
      company: company || (patient ? (patient.company || patient.philhealthAgency) : '') || '',
      loaNumber: loaNumber || '',
      loaDate: loaDate || recDate,
      loaExpiry: loaExpiry || '',
      availmentType: availmentType || 'Outpatient Diagnostic',
      diagnosis: diagnosis || '',
      physician: physician || (patient ? (patient.physician || '') : ''),
      procedures: [],
      grossAmount: 0,
      hmoCoveredAmount: 0,
      patientExcessAmount: 0,
      status: 'Pending LOA',
      notes: notes || ''
    });

    await record.save();

    // Sync back to patient record
    if (patient) {
      patient.healthInsuranceConsent = true;
      if (hmoProvider) patient.healthInsuranceProvider = hmoProvider;
      if (cardNumber) patient.healthInsuranceId = cardNumber;
      if (company && !patient.company) patient.company = company;
      await patient.save();
    }

    const msg = `Health Card claim ${record.controlNo} enrolled successfully!`;
    if (req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.json({ success: true, message: msg, record });
    }

    req.flash('success_msg', msg);
    res.redirect('/healthcard');
  } catch (err) {
    console.error('Create Health Card record error:', err);
    if (req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.status(500).json({ success: false, error: err.message });
    }
    req.flash('error_msg', 'Failed to create Health Card record: ' + err.message);
    res.redirect('/healthcard');
  }
});

// PUT /healthcard/:id - Update Health Card claim details
router.put('/:id', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const record = await HealthCardRecord.findById(req.params.id);
    if (!record) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }

    const {
      hmoProvider,
      cardNumber,
      company,
      loaNumber,
      loaDate,
      loaExpiry,
      availmentType,
      diagnosis,
      physician,
      procedures,
      grossAmount,
      hmoCoveredAmount,
      patientExcessAmount,
      status,
      soaRef,
      billedDate,
      paidDate,
      paymentRef,
      ewtAmount,
      netAmount,
      notes
    } = req.body;

    if (hmoProvider !== undefined) record.hmoProvider = String(hmoProvider).trim();
    if (cardNumber !== undefined) record.cardNumber = String(cardNumber).trim();
    if (company !== undefined) record.company = String(company).trim();
    if (loaNumber !== undefined) record.loaNumber = String(loaNumber).trim();
    if (loaDate !== undefined) record.loaDate = String(loaDate).trim();
    if (loaExpiry !== undefined) record.loaExpiry = String(loaExpiry).trim();
    if (availmentType !== undefined) record.availmentType = String(availmentType).trim();
    if (diagnosis !== undefined) record.diagnosis = String(diagnosis).trim();
    if (physician !== undefined) record.physician = String(physician).trim();
    if (status !== undefined) record.status = status;
    if (soaRef !== undefined) record.soaRef = String(soaRef).trim();
    if (billedDate !== undefined) record.billedDate = String(billedDate).trim();
    if (paidDate !== undefined) record.paidDate = String(paidDate).trim();
    if (paymentRef !== undefined) record.paymentRef = String(paymentRef).trim();
    if (notes !== undefined) record.notes = String(notes).trim();

    if (grossAmount !== undefined) record.grossAmount = Number(grossAmount) || 0;
    if (hmoCoveredAmount !== undefined) record.hmoCoveredAmount = Number(hmoCoveredAmount) || 0;
    if (patientExcessAmount !== undefined) record.patientExcessAmount = Number(patientExcessAmount) || 0;
    if (ewtAmount !== undefined) record.ewtAmount = Number(ewtAmount) || 0;
    if (netAmount !== undefined) record.netAmount = Number(netAmount) || 0;

    if (procedures !== undefined) {
      let procsArray = procedures;
      if (typeof procedures === 'string') {
        try { procsArray = JSON.parse(procedures); } catch (_) { procsArray = []; }
      }
      if (Array.isArray(procsArray)) {
        record.procedures = procsArray.map(p => ({
          key: p.key || '',
          label: p.label || '',
          category: p.category || '',
          amount: Number(p.amount || 0),
          hmoCovered: p.hmoCovered !== undefined ? Number(p.hmoCovered) : Number(p.amount || 0),
          patientExcess: Number(p.patientExcess || 0),
          remarks: p.remarks || '',
          forSendOut: !!p.forSendOut,
          targetArea: p.targetArea || (p.forSendOut ? 'Send-out Area' : 'Extraction Area')
        }));

        // Recompute totals if not explicitly specified
        if (grossAmount === undefined) {
          record.grossAmount = record.procedures.reduce((sum, p) => sum + (p.amount || 0), 0);
        }
        if (hmoCoveredAmount === undefined) {
          record.hmoCoveredAmount = record.procedures.reduce((sum, p) => sum + (p.hmoCovered || 0), 0);
        }
        if (patientExcessAmount === undefined) {
          record.patientExcessAmount = record.procedures.reduce((sum, p) => sum + (p.patientExcess || 0), 0);
        }
      }
    }

    await record.save();

    // Sync HMO info to patient demographic
    if (record.patientId) {
      try {
        const p = await Patient.findById(record.patientId);
        if (p) {
          if (record.hmoProvider) p.healthInsuranceProvider = record.hmoProvider;
          if (record.cardNumber) p.healthInsuranceId = record.cardNumber;
          if (record.company) p.company = record.company;
          await p.save();
        }
      } catch (_) {}
    }

    if (req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.json({ success: true, record });
    }

    req.flash('success_msg', `Health Card claim ${record.controlNo} updated successfully!`);
    res.redirect('/healthcard');
  } catch (err) {
    console.error('Update Health Card record error:', err);
    if (req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.status(500).json({ success: false, error: err.message });
    }
    req.flash('error_msg', 'Failed to update Health Card record: ' + err.message);
    res.redirect('/healthcard');
  }
});

// POST /healthcard/:id/approve - Approve LOA and generate clinical tests
router.post('/:id/approve', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const record = await HealthCardRecord.findById(req.params.id);
    if (!record) {
      const msg = 'Health Card record not found';
      if (req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
        return res.status(404).json({ success: false, error: msg });
      }
      req.flash('error_msg', msg);
      return res.redirect('/healthcard');
    }

    // Process LOA info submitted with approval
    if (req.body.loaNumber) record.loaNumber = String(req.body.loaNumber).trim();
    if (req.body.loaExpiry) record.loaExpiry = String(req.body.loaExpiry).trim();
    if (req.body.hmoProvider) record.hmoProvider = String(req.body.hmoProvider).trim();
    if (req.body.cardNumber) record.cardNumber = String(req.body.cardNumber).trim();
    if (req.body.diagnosis) record.diagnosis = String(req.body.diagnosis).trim();
    if (req.body.physician) record.physician = String(req.body.physician).trim();

    let procedures = record.procedures || [];
    if (req.body.procedures) {
      let submittedProcs = req.body.procedures;
      if (typeof submittedProcs === 'string') {
        try { submittedProcs = JSON.parse(submittedProcs); } catch (_) {}
      }
      if (Array.isArray(submittedProcs)) {
        procedures = submittedProcs.map(p => ({
          key: p.key || '',
          label: p.label || '',
          category: p.category || '',
          amount: Number(p.amount || 0),
          hmoCovered: p.hmoCovered !== undefined ? Number(p.hmoCovered) : Number(p.amount || 0),
          patientExcess: Number(p.patientExcess || 0),
          remarks: p.remarks || '',
          forSendOut: !!p.forSendOut,
          targetArea: p.targetArea || (p.forSendOut ? 'Send-out Area' : 'Extraction Area')
        }));
        record.procedures = procedures;
      }
    }

    if (!Array.isArray(procedures) || procedures.length === 0) {
      const msg = 'Please assign at least one authorized test/procedure before approving LOA.';
      if (req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
        return res.status(400).json({ success: false, error: msg });
      }
      req.flash('error_msg', msg);
      return res.redirect('/healthcard');
    }

    // Compute updated financial totals
    record.grossAmount = procedures.reduce((sum, p) => sum + (p.amount || 0), 0);
    record.hmoCoveredAmount = procedures.reduce((sum, p) => sum + (p.hmoCovered || 0), 0);
    record.patientExcessAmount = procedures.reduce((sum, p) => sum + (p.patientExcess || 0), 0);

    const patient = await Patient.findById(record.patientId);
    if (!patient) {
      const msg = 'Linked patient demographic record not found';
      if (req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
        return res.status(400).json({ success: false, error: msg });
      }
      req.flash('error_msg', msg);
      return res.redirect('/healthcard');
    }

    // Create Test records for approved procedures
    // Like PhilHealth, HMO approved tests skip Payment Area and land directly in diagnostic stations!
    const createdTests = [];
    const copyProcedures = procedures.slice();

    // 1. Group Blood Chemistry procedures if multiple
    const bloodItems = copyProcedures.filter(p => p.category === 'Blood Chemistry');
    if (bloodItems.length > 1) {
      const prefix = getPrefixForLabel('Blood Chemistry');
      const tid = getNextTestId(prefix);
      const requestedList = bloodItems.map(b => ({
        key: b.key,
        label: b.label,
        amount: b.amount || 0,
        lab: 'clinical',
        area: 'Extraction Area',
        remarks: b.remarks || `HMO: ${record.hmoProvider} (LOA: ${record.loaNumber || 'N/A'})`
      }));

      const summaryNotes = bloodItems.map(b => b.remarks).filter(Boolean).join('; ');
      const excessTotal = bloodItems.reduce((sum, b) => sum + (b.patientExcess || 0), 0);

      const t = new Test({
        testId: tid,
        patient: patient.id,
        testType: 'Blood Chemistry',
        testDate: (new Date()).toISOString(),
        status: 'Extraction Area', // Direct to Extraction!
        priority: 'Normal',
        requestedBy: req.session.user.id,
        requestedTests: requestedList,
        notes: `HMO: ${record.hmoProvider} | LOA: ${record.loaNumber || 'N/A'}${summaryNotes ? ' | ' + summaryNotes : ''}`,
        chargedToHmo: true,
        hmoProvider: record.hmoProvider,
        loaNumber: record.loaNumber,
        paymentMethod: `HMO - ${record.hmoProvider}`,
        paid: true,
        price: excessTotal
      });
      t.addStatusEntry({
        from: null,
        to: 'Extraction Area',
        user: req.session.user.username || 'System',
        area: 'Extraction Area',
        timestamp: (new Date()).toISOString(),
        notes: `Approved via Health Card Panel (${record.controlNo} - ${record.hmoProvider})`
      });
      await t.save();
      createdTests.push(t);

      // Remove grouped blood items
      for (const b of bloodItems) {
        const idx = copyProcedures.findIndex(x => x.key === b.key);
        if (idx >= 0) copyProcedures.splice(idx, 1);
      }
    }

    // 2. Create individual tests for remaining procedures
    for (const p of copyProcedures) {
      const prefix = getPrefixForLabel(p.label);
      const tid = getNextTestId(prefix);
      const targetArea = p.targetArea || 'Extraction Area';
      const isSendout = !!p.forSendOut;

      const requestedList = [{
        key: p.key,
        label: p.label,
        amount: p.amount || 0,
        lab: isSendout ? 'external' : 'clinical',
        area: targetArea,
        remarks: p.remarks || `HMO: ${record.hmoProvider} (LOA: ${record.loaNumber || 'N/A'})`
      }];

      const t = new Test({
        testId: tid,
        patient: patient.id,
        testType: p.label,
        testDate: (new Date()).toISOString(),
        status: targetArea, // Directly into station (X-ray, ECG, Extraction, Ultrasound, etc.)
        priority: 'Normal',
        requestedBy: req.session.user.id,
        notes: `HMO: ${record.hmoProvider} | LOA: ${record.loaNumber || 'N/A'}${p.remarks ? ' | ' + p.remarks : ''}`,
        requestedTests: requestedList,
        chargedToHmo: true,
        hmoProvider: record.hmoProvider,
        loaNumber: record.loaNumber,
        paymentMethod: `HMO - ${record.hmoProvider}`,
        paid: true,
        price: p.patientExcess || 0
      });
      t.addStatusEntry({
        from: null,
        to: targetArea,
        user: req.session.user.username || 'System',
        area: targetArea,
        timestamp: (new Date()).toISOString(),
        notes: `Approved via Health Card Panel (${record.controlNo} - ${record.hmoProvider})`
      });
      await t.save();
      createdTests.push(t);
    }

    // Update HealthCardRecord
    record.testIds = createdTests.map(t => t.testId);
    record.status = 'Approved';
    record.approvedBy = req.session.user.name || req.session.user.username;
    record.approvedAt = (new Date()).toISOString();
    await record.save();

    // Broadcast SSE update so Reception and Diagnostic stations refresh instantly
    for (const t of createdTests) {
      try {
        sseEmitter.emit('update', {
          action: 'assign',
          testId: t.testId,
          area: t.status,
          patient: t.patient,
          patientCode: patient.patientCode,
          time: (new Date()).toISOString()
        });
      } catch (e) { console.warn('SSE emit failed for HMO test creation', e); }
    }

    const testIdLabels = createdTests.map(t => t.testId).join(', ');
    const successMsg = `LOA for ${record.controlNo} (${record.hmoProvider}) approved! Created ${createdTests.length} procedure test(s): ${testIdLabels}. Routed directly to diagnostic stations.`;

    if (req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.json({ success: true, message: successMsg, record, testIds: record.testIds });
    }

    req.flash('success_msg', successMsg);
    res.redirect('/healthcard');
  } catch (err) {
    console.error('Approve Health Card record error:', err);
    if (req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.status(500).json({ success: false, error: err.message });
    }
    req.flash('error_msg', 'Failed to approve LOA: ' + err.message);
    res.redirect('/healthcard');
  }
});

// POST /healthcard/:id/cancel - Cancel Health Card claim
router.post('/:id/cancel', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const record = await HealthCardRecord.findById(req.params.id);
    if (!record) {
      req.flash('error_msg', 'Record not found');
      return res.redirect('/healthcard');
    }
    record.status = 'Cancelled';
    await record.save();
    req.flash('success_msg', `Health Card record ${record.controlNo} marked as Cancelled.`);
    res.redirect('/healthcard');
  } catch (err) {
    console.error('Cancel Health Card record error:', err);
    req.flash('error_msg', 'Failed to cancel record');
    res.redirect('/healthcard');
  }
});

// POST /healthcard/bulk-update - Multi-select Universal Batch Status / Settlement
router.post('/bulk-update', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const { ids, status, soaRef, billedDate, paidDate, paymentRef } = req.body;
    const idList = Array.isArray(ids) ? ids : (ids ? String(ids).split(',').map(s => s.trim()).filter(Boolean) : []);

    if (!idList.length) {
      const msg = 'Please select at least one Health Card claim.';
      if (req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
        return res.status(400).json({ success: false, error: msg });
      }
      req.flash('error_msg', msg);
      return res.redirect('/healthcard');
    }

    let updatedCount = 0;
    const nowStr = (new Date()).toISOString().slice(0, 10);

    for (const id of idList) {
      const rec = await HealthCardRecord.findById(id);
      if (rec) {
        let changed = false;
        if (status) {
          rec.status = status;
          changed = true;
          if (status === 'Billed' && !rec.billedDate) {
            rec.billedDate = billedDate || nowStr;
          }
          if (status === 'Paid' && !rec.paidDate) {
            rec.paidDate = paidDate || nowStr;
          }
        }
        if (soaRef) { rec.soaRef = String(soaRef).trim(); changed = true; }
        if (billedDate) { rec.billedDate = String(billedDate).trim(); changed = true; }
        if (paidDate) { rec.paidDate = String(paidDate).trim(); changed = true; }
        if (paymentRef) { rec.paymentRef = String(paymentRef).trim(); changed = true; }

        if (changed) {
          await rec.save();
          updatedCount++;
        }
      }
    }

    const msg = `Successfully updated ${updatedCount} Health Card claim(s) in batch.`;
    if (req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.json({ success: true, count: updatedCount, message: msg });
    }

    req.flash('success_msg', msg);
    res.redirect('/healthcard');
  } catch (err) {
    console.error('Batch update Health Card claims error:', err);
    if (req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.status(500).json({ success: false, error: err.message });
    }
    req.flash('error_msg', 'Failed to perform batch update: ' + err.message);
    res.redirect('/healthcard');
  }
});

// GET /healthcard/export.csv - Direct CSV Export with Philippine HMO Claim Specs
router.get('/export.csv', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const { search, hmo, status, dateFrom, dateTo, ids } = req.query;

    let records = await HealthCardRecord.find();

    if (ids) {
      const idArray = String(ids).split(',').map(s => s.trim()).filter(Boolean);
      records = records.filter(r => idArray.includes(r.id) || idArray.includes(r.controlNo));
    } else {
      if (search) {
        const s = search.toLowerCase().trim();
        records = records.filter(r => {
          const full = `${r.firstName} ${r.middleName} ${r.lastName}`.toLowerCase();
          const ctrl = String(r.controlNo || '').toLowerCase();
          const prov = String(r.hmoProvider || '').toLowerCase();
          const card = String(r.cardNumber || '').toLowerCase();
          const loa = String(r.loaNumber || '').toLowerCase();
          const comp = String(r.company || '').toLowerCase();
          return full.includes(s) || ctrl.includes(s) || prov.includes(s) || card.includes(s) || loa.includes(s) || comp.includes(s);
        });
      }
      if (hmo) {
        records = records.filter(r => (r.hmoProvider || '').toLowerCase() === hmo.toLowerCase());
      }
      if (status) {
        records = records.filter(r => r.status === status);
      }
      if (dateFrom) {
        records = records.filter(r => String(r.recordDate || r.createdAt || '').slice(0, 10) >= dateFrom);
      }
      if (dateTo) {
        records = records.filter(r => String(r.recordDate || r.createdAt || '').slice(0, 10) <= dateTo);
      }
    }

    const headers = [
      '#',
      'CONTROL NO',
      'DATE',
      'FIRST NAME',
      'MIDDLE NAME',
      'LAST NAME',
      'FULL NAME',
      'HMO PROVIDER',
      'CARD NO / MEMBER ID',
      'COMPANY / EMPLOYER',
      'LOA NUMBER',
      'LOA DATE',
      'LOA EXPIRY',
      'AVAILMENT TYPE',
      'DIAGNOSIS / ICD-10',
      'PHYSICIAN',
      'PROCEDURES',
      'GROSS AMOUNT (PHP)',
      'HMO COVERED (PHP)',
      'PATIENT EXCESS (PHP)',
      'STATUS',
      'SOA REF #',
      'BILLED DATE',
      'PAID DATE',
      'PAYMENT REF #',
      'APPROVED BY',
      'APPROVED AT'
    ];

    function escapeCsv(val) {
      if (val === null || val === undefined) return '""';
      const s = String(val).replace(/"/g, '""');
      return `"${s}"`;
    }

    const lines = [headers.map(escapeCsv).join(',')];

    records.forEach((r, idx) => {
      const procList = (r.procedures || []).map(p => {
        let text = p.label || '';
        if (p.amount) text += ` (PHP ${Number(p.amount).toFixed(2)})`;
        if (p.remarks) text += ` [${p.remarks}]`;
        return text;
      }).join('; ');

      const row = [
        idx + 1,
        r.controlNo || '',
        r.recordDate || (r.createdAt ? String(r.createdAt).slice(0, 10) : ''),
        r.firstName || '',
        r.middleName || '',
        r.lastName || '',
        r.fullName || '',
        r.hmoProvider || '',
        r.cardNumber || '',
        r.company || '',
        r.loaNumber || '',
        r.loaDate || '',
        r.loaExpiry || '',
        r.availmentType || 'Outpatient Diagnostic',
        r.diagnosis || '',
        r.physician || '',
        procList,
        Number(r.grossAmount || 0).toFixed(2),
        Number(r.hmoCoveredAmount || 0).toFixed(2),
        Number(r.patientExcessAmount || 0).toFixed(2),
        r.status || 'Pending LOA',
        r.soaRef || '',
        r.billedDate || '',
        r.paidDate || '',
        r.paymentRef || '',
        r.approvedBy || '',
        r.approvedAt ? String(r.approvedAt).slice(0, 19).replace('T', ' ') : ''
      ];
      lines.push(row.map(escapeCsv).join(','));
    });

    const csvContent = '\uFEFF' + lines.join('\r\n');
    const todayStr = (new Date()).toISOString().slice(0, 10);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="healthcard_claims_export_${todayStr}.csv"`);
    res.status(200).send(csvContent);
  } catch (err) {
    console.error('Health Card CSV export error:', err);
    res.status(500).send('Error generating Health Card CSV export: ' + err.message);
  }
});

module.exports = router;
