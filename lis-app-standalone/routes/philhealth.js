const express = require('express');
const router = express.Router();
const PhilhealthRecord = require('../models/PhilhealthRecord');
const Patient = require('../models/Patient');
const Test = require('../models/Test');
const { requireAuth, canAccessPatient } = require('../middleware/auth');
const sseEmitter = require('../lib/sseEmitter');
const { PHILHEALTH_CATALOG, getCatalog, getProcedureByKey, isValidProcedureKey, normalizeProcedure, normalizeProcedures } = require('../lib/philhealthCatalog');

// Helper to get prefix for test types (consistent with routes/tests.js)
function getPrefixForLabel(label) {
  const s = String(label || '').toLowerCase();
  if (/x[-\s]?ray|radiograph|chest/.test(s)) return 'XR';
  if (/ecg/.test(s)) return 'ECG';
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

// GET /philhealth - Main PhilHealth / Health Card Panel
router.get('/', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const searchQuery = req.query.search || '';
    const dateFrom = req.query.dateFrom || '';
    const dateTo = req.query.dateTo || '';
    const statusFilter = req.query.status || '';
    const tranche1PaidFilter = req.query.tranche1Paid || '';
    const tranche2PaidFilter = req.query.tranche2Paid || '';

    let records = await PhilhealthRecord.find();

    // Auto-sync agency with patient's employer/company and PIN with patient's philhealthId
    for (const r of records) {
      if (r.patientId && (!r.agency || !r.pinNo)) {
        try {
          const p = await Patient.findById(r.patientId);
          if (p) {
            let changed = false;
            if (!r.agency && (p.company || p.philhealthAgency)) {
              r.agency = p.company || p.philhealthAgency;
              changed = true;
            }
            if (!r.pinNo && (p.philhealthId || p.philhealthNumber)) {
              r.pinNo = p.philhealthId || p.philhealthNumber;
              changed = true;
            }
            if (changed) await r.save();
          }
        } catch (_) {}
      }
      if (r.procedures && r.procedures.length) {
        r.procedures = normalizeProcedures(r.procedures);
      }
    }

    // Compute overview metrics
    const stats = {
      total: records.length,
      pendingApproval: records.filter(r => r.status === 'Pending Approval').length,
      approved: records.filter(r => r.status === 'Approved').length,
      tranche1Paid: records.filter(r => r.tranche1Paid === 'Paid').length,
      tranche2Paid: records.filter(r => r.tranche2Paid === 'Paid').length
    };

    // Apply search filter
    if (searchQuery) {
      const s = searchQuery.toLowerCase().trim();
      records = records.filter(r => {
        const full = `${r.firstName} ${r.middleName} ${r.lastName}`.toLowerCase();
        const ctrl = String(r.controlNo || '').toLowerCase();
        const pin = String(r.pinNo || '').toLowerCase();
        const ag = String(r.agency || '').toLowerCase();
        const pcu = String(r.pcuError || '').toLowerCase();
        return full.includes(s) || ctrl.includes(s) || pin.includes(s) || ag.includes(s) || pcu.includes(s);
      });
    }

    // Apply date range
    if (dateFrom) {
      records = records.filter(r => {
        const d = String(r.recordDate || r.createdAt || '').slice(0, 10);
        return d >= dateFrom;
      });
    }
    if (dateTo) {
      records = records.filter(r => {
        const d = String(r.recordDate || r.createdAt || '').slice(0, 10);
        return d <= dateTo;
      });
    }

    // Apply status filter
    if (statusFilter) {
      records = records.filter(r => r.status === statusFilter);
    }

    // Apply tranche paid filters
    if (tranche1PaidFilter) {
      records = records.filter(r => r.tranche1Paid === tranche1PaidFilter);
    }
    if (tranche2PaidFilter) {
      records = records.filter(r => r.tranche2Paid === tranche2PaidFilter);
    }

    // Sort: Pending Approval first, then newest recordDate
    records.sort((a, b) => {
      if (a.status === 'Pending Approval' && b.status !== 'Pending Approval') return -1;
      if (a.status !== 'Pending Approval' && b.status === 'Pending Approval') return 1;
      return new Date(b.recordDate || b.createdAt || 0) - new Date(a.recordDate || a.createdAt || 0);
    });

    const catalog = getCatalog();

    res.render('philhealth/index', {
      title: 'PhilHealth / Health Card Panel',
      records,
      stats,
      catalog,
      searchQuery,
      dateFrom,
      dateTo,
      statusFilter,
      tranche1PaidFilter,
      tranche2PaidFilter
    });
  } catch (error) {
    console.error('PhilHealth panel error:', error);
    req.flash('error_msg', 'Failed to load PhilHealth panel');
    res.redirect('/dashboard');
  }
});

// GET /philhealth/api/catalog - Get catalog JSON
router.get('/api/catalog', (req, res) => {
  res.json({ success: true, catalog: getCatalog() });
});

// GET /philhealth/api/:id - Get single record
router.get('/api/:id', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const record = await PhilhealthRecord.findById(req.params.id);
    if (!record) return res.status(404).json({ success: false, error: 'Record not found' });
    res.json({ success: true, record });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /philhealth - Create record manually
router.post('/', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const { patientId, recordDate, pinNo, agency, pcuError } = req.body;
    let patient = null;
    if (patientId) {
      patient = await Patient.findById(patientId);
    }

    const recDate = recordDate || (new Date()).toISOString().slice(0, 10);
    const controlNo = PhilhealthRecord.getNextControlNo(recDate);

    const record = new PhilhealthRecord({
      controlNo,
      patientId: patient ? patient.id : (patientId || ''),
      recordDate: recDate,
      firstName: patient ? patient.firstName : (req.body.firstName || ''),
      middleName: patient ? patient.middleName : (req.body.middleName || ''),
      lastName: patient ? patient.lastName : (req.body.lastName || ''),
      pinNo: pinNo || (patient ? (patient.philhealthId || patient.philhealthNumber) : '') || '',
      agency: agency || (patient ? (patient.company || patient.philhealthAgency) : '') || '',
      pcuError: pcuError || '',
      procedures: [],
      status: 'Pending Approval',
      tranche1Encoded: 'Pending',
      tranche2Encoded: 'Pending',
      ekas: 'Pending',
      tranche1Paid: 'Not Paid',
      tranche2Paid: 'Not Paid'
    });

    await record.save();

    if (patient) {
      patient.philhealthConsent = true;
      if (pinNo) patient.philhealthId = pinNo;
      if (agency) patient.philhealthAgency = agency;
      await patient.save();
    }

    req.flash('success_msg', `PhilHealth record ${record.controlNo} created successfully!`);
    res.redirect('/philhealth');
  } catch (err) {
    console.error('Create PhilHealth record error:', err);
    req.flash('error_msg', 'Failed to create PhilHealth record');
    res.redirect('/philhealth');
  }
});

// PUT /philhealth/:id - Update PhilHealth record details
router.put('/:id', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const record = await PhilhealthRecord.findById(req.params.id);
    if (!record) {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }

    const {
      pinNo,
      agency,
      pcuError,
      procedures,
      tranche1Encoded,
      tranche2Encoded,
      ekas,
      tranche1Paid,
      tranche2Paid,
      soaRef,
      paidDate,
      notes
    } = req.body;

    if (pinNo !== undefined) record.pinNo = String(pinNo).trim();
    if (agency !== undefined) record.agency = String(agency).trim();
    if (pcuError !== undefined) record.pcuError = String(pcuError).trim();
    if (tranche1Encoded !== undefined) record.tranche1Encoded = tranche1Encoded;
    if (tranche2Encoded !== undefined) record.tranche2Encoded = tranche2Encoded;
    if (ekas !== undefined) record.ekas = ekas;
    if (tranche1Paid !== undefined) record.tranche1Paid = tranche1Paid;
    if (tranche2Paid !== undefined) record.tranche2Paid = tranche2Paid;
    if (soaRef !== undefined) record.soaRef = String(soaRef).trim();
    if (paidDate !== undefined) record.paidDate = String(paidDate).trim();
    if (notes !== undefined) record.notes = String(notes).trim();

    // If procedures provided (JSON string or array), validate against catalog
    if (procedures !== undefined) {
      let procsArray = procedures;
      if (typeof procedures === 'string') {
        try { procsArray = JSON.parse(procedures); } catch (_) { procsArray = []; }
      }
      if (Array.isArray(procsArray)) {
        record.procedures = normalizeProcedures(procsArray);
      }
    }

    await record.save();

    // Sync PIN & agency to patient demographic if linked
    if (record.patientId) {
      try {
        const p = await Patient.findById(record.patientId);
        if (p) {
          if (record.pinNo) {
            p.philhealthId = record.pinNo;
            p.philhealthNumber = record.pinNo;
          }
          if (record.agency) {
            p.company = record.agency;
            p.philhealthAgency = record.agency;
          }
          await p.save();
        }
      } catch (_) {}
    }

    if (req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.json({ success: true, record });
    }

    req.flash('success_msg', `Record ${record.controlNo} updated successfully!`);
    res.redirect('/philhealth');
  } catch (err) {
    console.error('Update PhilHealth record error:', err);
    if (req.xhr || (req.headers && req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.status(500).json({ success: false, error: err.message });
    }
    req.flash('error_msg', 'Failed to update PhilHealth record');
    res.redirect('/philhealth');
  }
});

// POST /philhealth/:id/approve - Approve order & generate clinical tests (skips Payment Area)
router.post('/:id/approve', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const record = await PhilhealthRecord.findById(req.params.id);
    if (!record) {
      req.flash('error_msg', 'PhilHealth record not found');
      return res.redirect('/philhealth');
    }

    // Accept procedures array if submitted with the approval form
    let procedures = record.procedures || [];
    if (req.body && req.body.procedures) {
      let submittedProcs = req.body.procedures;
      if (typeof submittedProcs === 'string') {
        try { submittedProcs = JSON.parse(submittedProcs); } catch (_) {}
      }
      if (Array.isArray(submittedProcs)) {
        procedures = normalizeProcedures(submittedProcs);
        record.procedures = procedures;
      }
    } else {
      procedures = normalizeProcedures(procedures);
      record.procedures = procedures;
    }

    if (!Array.isArray(procedures) || procedures.length === 0) {
      const msg = 'Please assign at least one PhilHealth procedure before approving.';
      if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
        return res.status(400).json({ success: false, error: msg });
      }
      req.flash('error_msg', msg);
      return res.redirect('/philhealth');
    }

    // Validate sendout items have remarks
    for (const p of procedures) {
      if (p.forSendOut && (!p.remarks || !String(p.remarks).trim())) {
        const msg = `Remarks are required for send-out procedure: ${p.label}`;
        if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
          return res.status(400).json({ success: false, error: msg });
        }
        req.flash('error_msg', msg);
        return res.redirect('/philhealth');
      }
    }

    const patient = await Patient.findById(record.patientId);
    if (!patient) {
      const msg = 'Linked patient demographic record not found';
      if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
        return res.status(400).json({ success: false, error: msg });
      }
      req.flash('error_msg', msg);
      return res.redirect('/philhealth');
    }

    // Create Test records for the procedures!
    // Note: PhilHealth tests SKIP Payment Area completely and land directly in their respective clinical areas!
    const createdTests = [];
    const copyProcedures = procedures.slice();

    // 1. Group Blood Chemistry procedures if multiple are selected
    const bloodItems = copyProcedures.filter(p => p.category === 'Blood Chemistry');
    if (bloodItems.length > 1) {
      const prefix = getPrefixForLabel('Blood Chemistry');
      const tid = getNextTestId(prefix);
      const requestedList = bloodItems.map(b => ({
        key: b.key,
        label: b.label,
        amount: 0,
        lab: 'clinical',
        area: 'Extraction Area',
        remarks: b.remarks || ''
      }));

      const summaryNotes = bloodItems.map(b => b.remarks).filter(Boolean).join('; ');

      const t = new Test({
        testId: tid,
        patient: patient.id,
        testType: 'Blood Chemistry',
        testDate: (new Date()).toISOString(),
        status: 'Extraction Area', // Directly in Extraction Area!
        priority: 'Normal',
        requestedBy: req.session.user.id,
        requestedTests: requestedList,
        notes: summaryNotes ? `PhilHealth: ${summaryNotes}` : 'PhilHealth Blood Chemistry',
        chargedToPhilhealth: true,
        paymentMethod: 'PhilHealth',
        paid: true,
        price: 0
      });
      t.addStatusEntry({
        from: null,
        to: 'Extraction Area',
        user: req.session.user.username || 'System',
        area: 'Extraction Area',
        timestamp: (new Date()).toISOString(),
        notes: `Approved via PhilHealth Panel (${record.controlNo})`
      });
      await t.save();
      createdTests.push(t);

      // Remove from individual processing
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
        amount: 0,
        lab: isSendout ? 'external' : 'clinical',
        area: targetArea,
        remarks: p.remarks || ''
      }];

      const testPayload = {
        testId: tid,
        patient: patient.id,
        testType: p.label,
        testDate: (new Date()).toISOString(),
        status: targetArea, // Directly into target area! (Sendout, X-ray, ECG, Extraction Area, Awaiting)
        priority: 'Normal',
        requestedBy: req.session.user.id,
        notes: p.remarks ? `PhilHealth: ${p.remarks}` : 'PhilHealth Coverage',
        requestedTests: requestedList,
        chargedToPhilhealth: true,
        paymentMethod: 'PhilHealth',
        paid: true,
        price: 0
      };

      const t = new Test(testPayload);
      t.addStatusEntry({
        from: null,
        to: targetArea,
        user: req.session.user.username || 'System',
        area: targetArea,
        timestamp: (new Date()).toISOString(),
        notes: `Approved via PhilHealth Panel (${record.controlNo})`
      });
      await t.save();
      createdTests.push(t);
    }

    // Update PhilhealthRecord
    record.testIds = createdTests.map(t => t.testId);
    record.status = 'Approved';
    record.approvedBy = req.session.user.name || req.session.user.username;
    record.approvedAt = (new Date()).toISOString();
    await record.save();

    // Broadcast SSE events for each created test so Reception & Kiosk refresh immediately
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
      } catch (e) { console.warn('SSE emit failed for PhilHealth test creation', e); }
    }

    const testIdLabels = createdTests.map(t => t.testId).join(', ');
    const successMsg = `PhilHealth order ${record.controlNo} approved! Assigned ${createdTests.length} procedure(s) (${testIdLabels}). Patients routed directly to specimen collection / diagnostic stations.`;

    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.json({ success: true, message: successMsg, record, testIds: record.testIds });
    }

    req.flash('success_msg', successMsg);
    res.redirect('/philhealth');
  } catch (err) {
    console.error('Approve PhilHealth record error:', err);
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.status(500).json({ success: false, error: err.message });
    }
    req.flash('error_msg', 'Failed to approve PhilHealth order: ' + err.message);
    res.redirect('/philhealth');
  }
});

// POST /philhealth/:id/cancel - Cancel PhilHealth order
router.post('/:id/cancel', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const record = await PhilhealthRecord.findById(req.params.id);
    if (!record) {
      req.flash('error_msg', 'Record not found');
      return res.redirect('/philhealth');
    }
    record.status = 'Cancelled';
    await record.save();
    req.flash('success_msg', `PhilHealth record ${record.controlNo} marked as Cancelled.`);
    res.redirect('/philhealth');
  } catch (err) {
    console.error('Cancel PhilHealth record error:', err);
    req.flash('error_msg', 'Failed to cancel record');
    res.redirect('/philhealth');
  }
});

// POST /philhealth/bulk-update - Universal Batch Update for Tranches Encoded, Tranches Paid, EKAS
router.post('/bulk-update', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const {
      ids,
      tranche1Encoded,
      tranche2Encoded,
      ekas,
      tranche1Paid,
      tranche2Paid,
      soaRef,
      paidDate
    } = req.body;

    const idList = Array.isArray(ids) ? ids : (ids ? String(ids).split(',').map(s => s.trim()).filter(Boolean) : []);

    if (!idList.length) {
      const msg = 'Please select at least one patient record.';
      if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
        return res.status(400).json({ success: false, error: msg });
      }
      req.flash('error_msg', msg);
      return res.redirect('/philhealth');
    }

    let updatedCount = 0;
    const soa = (soaRef !== undefined && soaRef !== null && String(soaRef).trim()) ? String(soaRef).trim() : null;
    const pDate = (paidDate !== undefined && paidDate !== null && String(paidDate).trim()) ? String(paidDate).trim() : (new Date()).toISOString().slice(0, 10);

    for (const id of idList) {
      const rec = await PhilhealthRecord.findById(id);
      if (rec) {
        let changed = false;

        if (tranche1Encoded === 'Completed' || tranche1Encoded === 'Pending') {
          rec.tranche1Encoded = tranche1Encoded;
          changed = true;
        }
        if (tranche2Encoded === 'Completed' || tranche2Encoded === 'Pending') {
          rec.tranche2Encoded = tranche2Encoded;
          changed = true;
        }
        if (ekas === 'Completed' || ekas === 'Pending') {
          rec.ekas = ekas;
          changed = true;
        }
        if (tranche1Paid === 'Paid' || tranche1Paid === 'Not Paid') {
          rec.tranche1Paid = tranche1Paid;
          if (tranche1Paid === 'Paid') {
            if (soa) rec.soaRef = soa;
            rec.paidDate = pDate;
          }
          changed = true;
        }
        if (tranche2Paid === 'Paid' || tranche2Paid === 'Not Paid') {
          rec.tranche2Paid = tranche2Paid;
          if (tranche2Paid === 'Paid') {
            if (soa) rec.soaRef = soa;
            rec.paidDate = pDate;
          }
          changed = true;
        }

        if (changed) {
          await rec.save();
          updatedCount++;
        }
      }
    }

    const msg = `Successfully updated ${updatedCount} patient record(s) in batch.`;

    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.json({ success: true, count: updatedCount, message: msg });
    }

    req.flash('success_msg', msg);
    res.redirect('/philhealth');
  } catch (err) {
    console.error('Universal bulk update error:', err);
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.status(500).json({ success: false, error: err.message });
    }
    req.flash('error_msg', 'Failed to perform batch update: ' + err.message);
    res.redirect('/philhealth');
  }
});

// POST /philhealth/bulk-paid - Multi-select DOH SOA Tranche Mark as Paid
router.post('/bulk-paid', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const { ids, tranche, paidStatus, soaRef, paidDate } = req.body;
    const idList = Array.isArray(ids) ? ids : (ids ? String(ids).split(',').map(s => s.trim()).filter(Boolean) : []);

    if (!idList.length) {
      const msg = 'Please select at least one patient record.';
      if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
        return res.status(400).json({ success: false, error: msg });
      }
      req.flash('error_msg', msg);
      return res.redirect('/philhealth');
    }

    const trancheNum = parseInt(tranche, 10) === 2 ? 2 : 1;
    const statusVal = (paidStatus === 'Paid' || paidStatus === '1') ? 'Paid' : 'Not Paid';
    const soa = soaRef ? String(soaRef).trim() : '';
    const pDate = paidDate ? String(paidDate).trim() : (new Date()).toISOString().slice(0, 10);

    let updatedCount = 0;
    for (const id of idList) {
      const rec = await PhilhealthRecord.findById(id);
      if (rec) {
        if (trancheNum === 1) {
          rec.tranche1Paid = statusVal;
        } else {
          rec.tranche2Paid = statusVal;
        }
        if (soa) rec.soaRef = soa;
        if (statusVal === 'Paid') rec.paidDate = pDate;
        await rec.save();
        updatedCount++;
      }
    }

    const trancheLabel = trancheNum === 1 ? '1st Tranche' : '2nd Tranche';
    const msg = `Successfully updated ${updatedCount} record(s): ${trancheLabel} marked as ${statusVal}${soa ? ' (SOA: ' + soa + ')' : ''}.`;

    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.json({ success: true, count: updatedCount, message: msg });
    }

    req.flash('success_msg', msg);
    res.redirect('/philhealth');
  } catch (err) {
    console.error('Bulk paid error:', err);
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.status(500).json({ success: false, error: err.message });
    }
    req.flash('error_msg', 'Failed to update payment status: ' + err.message);
    res.redirect('/philhealth');
  }
});

// GET /philhealth/export.csv - Direct CSV Export with UTF-8 BOM
router.get('/export.csv', requireAuth, canAccessPatient, async (req, res) => {
  try {
    const { search, dateFrom, dateTo, status, tranche1Paid, tranche2Paid, ids } = req.query;

    let records = await PhilhealthRecord.find();

    // If specific ids selected, only export those
    if (ids) {
      const idArray = String(ids).split(',').map(s => s.trim()).filter(Boolean);
      records = records.filter(r => idArray.includes(r.id) || idArray.includes(r.controlNo));
    } else {
      if (search) {
        const s = search.toLowerCase().trim();
        records = records.filter(r => {
          const full = `${r.firstName} ${r.middleName} ${r.lastName}`.toLowerCase();
          const ctrl = String(r.controlNo || '').toLowerCase();
          const pin = String(r.pinNo || '').toLowerCase();
          const ag = String(r.agency || '').toLowerCase();
          const pcu = String(r.pcuError || '').toLowerCase();
          return full.includes(s) || ctrl.includes(s) || pin.includes(s) || ag.includes(s) || pcu.includes(s);
        });
      }
      if (dateFrom) {
        records = records.filter(r => String(r.recordDate || r.createdAt || '').slice(0, 10) >= dateFrom);
      }
      if (dateTo) {
        records = records.filter(r => String(r.recordDate || r.createdAt || '').slice(0, 10) <= dateTo);
      }
      if (status) {
        records = records.filter(r => r.status === status);
      }
      if (tranche1Paid) {
        records = records.filter(r => r.tranche1Paid === tranche1Paid);
      }
      if (tranche2Paid) {
        records = records.filter(r => r.tranche2Paid === tranche2Paid);
      }
    }

    // CSV header row matching exact user specifications:
    // #	DATE	NAME	PIN NO.	PROCEDURE	AGENCY	PCU/ERROR	1ST TRANCH ENCODED	2ND TRANCH ENCODED	EKAS	1ST TRANCH PAID	2ND TRANCH PAID
    const headers = [
      '#',
      'CONTROL NO',
      'DATE',
      'FIRST NAME',
      'MIDDLE NAME',
      'LAST NAME',
      'FULL NAME',
      'PIN NO.',
      'PROCEDURE',
      'AGENCY',
      'PCU/ERROR',
      '1ST TRANCHE ENCODED',
      '2ND TRANCHE ENCODED',
      'EKAS',
      '1ST TRANCHE PAID',
      '2ND TRANCHE PAID',
      'SOA REF',
      'PAID DATE',
      'STATUS',
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
      const normalizedProcs = normalizeProcedures(r.procedures || []);
      const procList = normalizedProcs.map(p => {
        const num = p.itemNo ? `${p.itemNo}. ` : '';
        if (p.remarks && String(p.remarks).trim()) {
          return `${num}${p.label} [${p.remarks}]`;
        }
        return `${num}${p.label}`;
      }).join('; ');

      const row = [
        idx + 1,
        r.controlNo || '',
        r.recordDate || (r.createdAt ? String(r.createdAt).slice(0, 10) : ''),
        r.firstName || '',
        r.middleName || '',
        r.lastName || '',
        r.fullName || '',
        r.pinNo || '',
        procList,
        r.agency || '',
        r.pcuError || '',
        r.tranche1Encoded || 'Pending',
        r.tranche2Encoded || 'Pending',
        r.ekas || 'Pending',
        r.tranche1Paid || 'Not Paid',
        r.tranche2Paid || 'Not Paid',
        r.soaRef || '',
        r.paidDate || '',
        r.status || 'Pending Approval',
        r.approvedBy || '',
        r.approvedAt ? String(r.approvedAt).slice(0, 19).replace('T', ' ') : ''
      ];
      lines.push(row.map(escapeCsv).join(','));
    });

    const csvContent = '\uFEFF' + lines.join('\r\n');
    const todayStr = (new Date()).toISOString().slice(0, 10);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="philhealth_export_${todayStr}.csv"`);
    res.status(200).send(csvContent);
  } catch (err) {
    console.error('PhilHealth CSV export error:', err);
    res.status(500).send('Error generating PhilHealth CSV export: ' + err.message);
  }
});

module.exports = router;
