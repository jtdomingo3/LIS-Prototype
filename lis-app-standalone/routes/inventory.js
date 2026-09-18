const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const Inventory = require('../models/Inventory');
const InventoryBatch = require('../models/InventoryBatch');
const InventoryTransaction = require('../models/InventoryTransaction');
const sseEmitter = require('../lib/sseEmitter');

// Helper: compute total stock on hand across all batches for an item
function getTotalStock(itemId) {
  try {
    const batches = (global.db.getInventoryBatchesByItemId(itemId) || []);
    return batches.reduce((sum, b) => sum + (b.quantityOnHand || 0), 0);
  } catch (_) { return 0; }
}

// Helper to get current user info
const getUserIdentifier = (req) => {
  if (!req.session || !req.session.user) return 'System';
  const u = req.session.user;
  return u.name || u.username || u.email || 'Admin';
};

// Middleware: Check authentication
const requireAuth = (req, res, next) => {
  if (!req.session || !req.session.user) {
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.status(401).json({ error: 'Unauthorized. Please log in.' });
    }
    return res.redirect('/login');
  }
  next();
};

// Helper function to check inventory access safely across all user permission schemas (object, array, string)
function hasInventoryAccess(user) {
  if (!user) return false;
  if (user.role === 'Admin' || user.role === 'Management' || user.role === 'Manager' || user.role === 'Owner') return true;
  let p = user.permissions;
  if (!p) return false;
  if (typeof p === 'string') {
    try { p = JSON.parse(p); } catch (_) { return false; }
  }
  if (Array.isArray(p)) return p.includes('inventory');
  if (typeof p === 'object') {
    return !!(p.inventory === true || p.inventory === '1' || p.inventory === 1 || p.inventory === 'true' || p.inventory === 'on');
  }
  return false;
}

// Middleware: Check inventory management access
const requireInventoryAccess = (req, res, next) => {
  requireAuth(req, res, () => {
    if (!hasInventoryAccess(req.session.user)) {
      if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
        return res.status(403).json({ error: 'Insufficient permissions for inventory management.' });
      }
      req.flash('error_msg', 'Access denied: You do not have permission to access or modify Inventory.');
      return res.status(403).render('error', { 
        title: 'Access Denied', 
        error: 'You do not have permission to modify laboratory inventory.' 
      });
    }
    next();
  });
};

// GET /inventory - Main Inventory Dashboard & List View
router.get('/', requireAuth, (req, res) => {
  try {
    const rawItems = global.db.getInventory() || [];
    const allBatches = typeof global.db.getAllInventoryBatches === 'function' 
      ? global.db.getAllInventoryBatches() 
      : [];

    // Map items to rich instances
    const allItems = rawItems.map(raw => new Inventory(raw));

    // Calculate Summary KPI Stats
    let lowStockCount = 0;
    let criticalStockCount = 0;
    let expiringCount = 0;
    let expiredCount = 0;
    let openVialActiveCount = 0;
    let quarantinedCount = 0;

    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    allItems.forEach(item => {
      const batches = (allBatches.filter(b => b.inventoryId === item.id) || []).map(b => new InventoryBatch(b));
      const totalStock = batches.reduce((sum, b) => sum + (b.quantityOnHand || 0), 0);
      
      const critLevel = item.criticalThreshold !== undefined ? item.criticalThreshold : Math.min(2, item.minThreshold);
      if (totalStock <= critLevel) {
        criticalStockCount++;
      }
      if (totalStock <= item.minThreshold) {
        lowStockCount++;
      }

      batches.forEach(b => {
        if (b.quantityOnHand > 0) {
          if (b.qcStatus === 'QUARANTINED') {
            quarantinedCount++;
          }
          if (b.isOpen) {
            openVialActiveCount++;
          }
          const effExp = b.effectiveExpirationDate;
          if (effExp) {
            const expDate = new Date(effExp);
            if (expDate < now) {
              expiredCount++;
            } else if (expDate <= thirtyDaysFromNow) {
              expiringCount++;
            }
          }
        }
      });
    });

    const categories = [
      'Clinical Reagents',
      'X-Ray & Imaging Chemicals',
      'X-Ray Films & Accessories',
      'Ultrasound & Echo Gels',
      'ECG Papers & Electrodes',
      'Controls & Calibrators',
      'Stains & Dyes',
      'Test Kits',
      'Consumables',
      'General Supplies',
      'PPE'
    ];

    const areas = [
      'Clinical Chemistry',
      'Hematology',
      'Immunology & Serology',
      'Microbiology',
      'Urinalysis & Parasitology',
      'Blood Banking',
      'Histopathology',
      'X-Ray & Radiology',
      'Ultrasound & 2D Echo',
      'Cardiology & ECG',
      'General Laboratory'
    ];

    const canEdit = hasInventoryAccess(req.session.user);

    let normalizedPerms = req.session.user.permissions || {};
    if (typeof normalizedPerms === 'string') {
      try { normalizedPerms = JSON.parse(normalizedPerms); } catch(_) { normalizedPerms = {}; }
    }

    res.render('inventory/index', {
      title: 'Laboratory Inventory & Reagent Tracking',
      totalItems: allItems.length,
      lowStockCount,
      criticalStockCount,
      expiringCount,
      expiredCount,
      openVialActiveCount,
      quarantinedCount,
      categories,
      areas,
      sessionUser: req.session.user,
      perms: normalizedPerms,
      canEdit
    });
  } catch (err) {
    console.error('GET /inventory error:', err);
    res.status(500).render('500', { error: err.message, title: 'Server Error' });
  }
});

// GET /inventory/list - JSON API for dynamic filtering, sorting, & search
router.get('/list', requireAuth, (req, res) => {
  try {
    const { category, area, search, sort, filter } = req.query;
    let rawItems = global.db.getInventory() || [];
    let items = rawItems.map(i => new Inventory(i));

    if (category) items = items.filter(i => i.category === category);
    if (area) items = items.filter(i => i.area === area);
    if (search) {
      const q = search.trim().toLowerCase();
      items = items.filter(i =>
        (i.name && i.name.toLowerCase().includes(q)) ||
        (i.sku && i.sku.toLowerCase().includes(q)) ||
        (i.supplier && i.supplier.toLowerCase().includes(q)) ||
        (i.manufacturer && i.manufacturer.toLowerCase().includes(q)) ||
        (i.description && i.description.toLowerCase().includes(q))
      );
    }

    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Enrich with batch computations
    let enriched = items.map(item => {
      const rawBatches = global.db.getInventoryBatchesByItemId(item.id) || [];
      const batches = rawBatches.map(b => new InventoryBatch(b));
      const totalStock = batches.reduce((sum, b) => sum + (b.quantityOnHand || 0), 0);

      const activeBatches = batches.filter(b => b.quantityOnHand > 0);
      const expiring = activeBatches.filter(b => {
        const eff = b.effectiveExpirationDate;
        if (!eff) return false;
        const expDate = new Date(eff);
        return expDate <= thirtyDaysFromNow && expDate > now;
      }).length;

      const expired = activeBatches.filter(b => {
        const eff = b.effectiveExpirationDate;
        if (!eff) return false;
        return new Date(eff) < now;
      }).length;

      const openVials = activeBatches.filter(b => b.isOpen).length;
      const quarantined = activeBatches.filter(b => b.qcStatus === 'QUARANTINED').length;
      const critLevel = item.criticalThreshold !== undefined ? item.criticalThreshold : Math.min(2, item.minThreshold);
      const isCritical = totalStock <= critLevel;

      return {
        ...item,
        totalStock,
        criticalThreshold: critLevel,
        isCriticalStock: isCritical,
        isLowStock: totalStock <= item.minThreshold,
        expiringBatchCount: expiring,
        expiredBatchCount: expired,
        openVialCount: openVials,
        quarantinedCount: quarantined,
        batchCount: batches.length,
        activeBatchCount: activeBatches.length,
        activeBatches: activeBatches.map(b => ({
          id: b.id,
          lotNumber: b.lotNumber,
          quantityOnHand: b.quantityOnHand,
          isOpen: !!b.isOpen,
          expirationDate: b.expirationDate,
          effectiveExpirationDate: b.effectiveExpirationDate,
          qcStatus: b.qcStatus
        }))
      };
    });

    // Special status filters
    if (filter === 'critical') {
      enriched = enriched.filter(i => i.isCriticalStock);
    } else if (filter === 'low-stock') {
      enriched = enriched.filter(i => i.isLowStock);
    } else if (filter === 'expiring') {
      enriched = enriched.filter(i => i.expiringBatchCount > 0);
    } else if (filter === 'expired') {
      enriched = enriched.filter(i => i.expiredBatchCount > 0);
    } else if (filter === 'open-vials') {
      enriched = enriched.filter(i => i.openVialCount > 0);
    }

    // Sort
    if (sort === 'stock-asc') {
      enriched.sort((a, b) => a.totalStock - b.totalStock);
    } else if (sort === 'stock-desc') {
      enriched.sort((a, b) => b.totalStock - a.totalStock);
    } else if (sort === 'name-desc') {
      enriched.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
    } else if (sort === 'category') {
      enriched.sort((a, b) => (a.category || '').localeCompare(b.category || '') || (a.name || '').localeCompare(b.name || ''));
    } else {
      // Default: name A-Z
      enriched.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }

    res.json(enriched);
  } catch (err) {
    console.error('GET /inventory/list error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /inventory/critical-check - API for Global Pop-up Alert across LIS
router.get('/critical-check', requireAuth, (req, res) => {
  try {
    const rawItems = global.db.getInventory() || [];
    const allBatches = typeof global.db.getAllInventoryBatches === 'function' 
      ? global.db.getAllInventoryBatches() 
      : [];

    const criticalList = [];

    rawItems.forEach(raw => {
      const item = new Inventory(raw);
      if (item.isActive === false) return; // Skip archived items

      // Check role assignment: only alert users targeted for this department/supply
      if (req.session && req.session.user && typeof item.shouldAlertUser === 'function') {
        if (!item.shouldAlertUser(req.session.user)) {
          return;
        }
      }

      const allItemBatches = allBatches.filter(b => b.inventoryId === item.id) || [];
      // Do not trigger out-of-stock emergency popup for newly registered catalog entries that have no batches received yet (item is still being set up)
      if (allItemBatches.length === 0) {
        return;
      }

      const batches = allItemBatches.map(b => new InventoryBatch(b));
      const totalStock = batches.reduce((sum, b) => sum + (b.quantityOnHand || 0), 0);
      const critLevel = item.criticalThreshold !== undefined ? item.criticalThreshold : Math.min(2, item.minThreshold);

      if (totalStock <= critLevel) {
        criticalList.push({
          id: item.id,
          name: item.name,
          sku: item.sku,
          category: item.category,
          area: item.area,
          totalStock,
          unit: item.unit,
          criticalThreshold: critLevel,
          minThreshold: item.minThreshold,
          location: item.location,
          isDepleted: totalStock <= 0
        });
      }
    });

    res.json({
      hasCritical: criticalList.length > 0,
      count: criticalList.length,
      items: criticalList
    });
  } catch (err) {
    console.error('critical-check error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /inventory/export - Export full inventory report to CSV
router.get('/export', requireAuth, (req, res) => {
  try {
    const rawItems = global.db.getInventory() || [];
    const allBatches = typeof global.db.getAllInventoryBatches === 'function' ? global.db.getAllInventoryBatches() : [];

    let csvRows = [];
    csvRows.push([
      'SKU/REF',
      'Item Name',
      'Category',
      'Department/Area',
      'Total Stock',
      'Unit',
      'Min Reorder Level',
      'Unit Cost',
      'Storage Temp',
      'Storage Location',
      'Manufacturer',
      'Supplier',
      'Active Lots Count',
      'Open-Vial Stability (Days)',
      'Status'
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

    rawItems.forEach(raw => {
      const item = new Inventory(raw);
      const batches = (allBatches.filter(b => b.inventoryId === item.id) || []).map(b => new InventoryBatch(b));
      const totalStock = batches.reduce((sum, b) => sum + (b.quantityOnHand || 0), 0);
      const status = totalStock <= 0 ? 'OUT OF STOCK' : (totalStock <= item.minThreshold ? 'LOW STOCK' : 'OK');

      csvRows.push([
        item.sku,
        item.name,
        item.category,
        item.area,
        totalStock,
        item.unit,
        item.minThreshold,
        item.cost.toFixed(2),
        item.storageTemp,
        item.location,
        item.manufacturer,
        item.supplier,
        batches.filter(b => b.quantityOnHand > 0).length,
        item.openVialStabilityDays || 'N/A',
        status
      ].map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(','));
    });

    const csvContent = csvRows.join('\r\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="laboratory-inventory-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csvContent);
  } catch (err) {
    console.error('GET /inventory/export error:', err);
    res.status(500).send('Failed to export inventory CSV.');
  }
});

// GET /inventory/alerts - Comprehensive Regulatory & Expiration Alerts
router.get('/alerts', requireAuth, (req, res) => {
  try {
    const rawItems = global.db.getInventory() || [];
    const items = rawItems.map(i => new Inventory(i));
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const alerts = {
      lowStock: [],
      expiringBatches: [],
      expiredBatches: [],
      openVials: [],
      quarantined: []
    };

    items.forEach(item => {
      const rawBatches = global.db.getInventoryBatchesByItemId(item.id) || [];
      const batches = rawBatches.map(b => new InventoryBatch(b));
      const totalStock = batches.reduce((sum, b) => sum + (b.quantityOnHand || 0), 0);

      if (totalStock <= item.minThreshold) {
        alerts.lowStock.push({
          itemId: item.id,
          sku: item.sku,
          itemName: item.name,
          category: item.category,
          area: item.area,
          currentStock: totalStock,
          minThreshold: item.minThreshold,
          unit: item.unit,
          isDepleted: totalStock <= 0
        });
      }

      batches.forEach(batch => {
        if (batch.quantityOnHand <= 0) return;

        // Quarantined batches alert
        if (batch.qcStatus === 'QUARANTINED') {
          alerts.quarantined.push({
            itemId: item.id,
            itemName: item.name,
            batchId: batch.id,
            lotNumber: batch.lotNumber,
            quantity: batch.quantityOnHand,
            unit: item.unit,
            storageLocation: batch.storageLocation || item.location,
            receiveNotes: batch.receiveNotes
          });
        }

        // Open vials tracking
        if (batch.isOpen && batch.openVialExpiryDate) {
          const openExp = new Date(batch.openVialExpiryDate);
          const daysLeft = Math.ceil((openExp - now) / (1000 * 60 * 60 * 24));
          alerts.openVials.push({
            itemId: item.id,
            itemName: item.name,
            batchId: batch.id,
            lotNumber: batch.lotNumber,
            dateOpened: batch.dateOpened,
            openedBy: batch.openedBy,
            openVialExpiryDate: batch.openVialExpiryDate,
            daysLeft,
            isExpired: daysLeft <= 0,
            quantity: batch.quantityOnHand,
            unit: item.unit
          });
        }

        // Effective expiration alerts
        const effExp = batch.effectiveExpirationDate;
        if (effExp) {
          const expDate = new Date(effExp);
          const isDueToOpenVial = batch.isOpen && batch.openVialExpiryDate && new Date(effExp).getTime() === new Date(batch.openVialExpiryDate).getTime();
          
          if (expDate < now) {
            alerts.expiredBatches.push({
              itemId: item.id,
              itemName: item.name,
              category: item.category,
              batchId: batch.id,
              lotNumber: batch.lotNumber,
              expirationDate: effExp,
              isDueToOpenVial,
              quantity: batch.quantityOnHand,
              unit: item.unit,
              storageLocation: batch.storageLocation || item.location
            });
          } else if (expDate <= thirtyDaysFromNow) {
            const daysLeft = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));
            alerts.expiringBatches.push({
              itemId: item.id,
              itemName: item.name,
              category: item.category,
              batchId: batch.id,
              lotNumber: batch.lotNumber,
              expirationDate: effExp,
              isDueToOpenVial,
              daysUntilExpiry: daysLeft,
              quantity: batch.quantityOnHand,
              unit: item.unit,
              storageLocation: batch.storageLocation || item.location
            });
          }
        }
      });
    });

    res.render('inventory/alerts', {
      title: 'Inventory & Quality Alerts (ISO 15189)',
      alerts,
      sessionUser: req.session.user
    });
  } catch (err) {
    console.error('GET /inventory/alerts error:', err);
    res.status(500).render('500', { error: err.message, title: 'Error' });
  }
});

// GET /inventory/create - Create Form
router.get('/create', requireInventoryAccess, (req, res) => {
  try {
    const categories = [
      'Clinical Reagents',
      'X-Ray & Imaging Chemicals',
      'X-Ray Films & Accessories',
      'Ultrasound & Echo Gels',
      'ECG Papers & Electrodes',
      'Controls & Calibrators',
      'Stains & Dyes',
      'Test Kits',
      'Consumables',
      'General Supplies',
      'PPE'
    ];
    const areas = [
      'Clinical Chemistry',
      'Hematology',
      'Immunology & Serology',
      'Microbiology',
      'Urinalysis & Parasitology',
      'Blood Banking',
      'Histopathology',
      'X-Ray & Radiology',
      'Ultrasound & 2D Echo',
      'Cardiology & ECG',
      'General Laboratory'
    ];
    
    res.render('inventory/create', {
      title: 'Register Laboratory Reagent - Inventory',
      categories,
      areas,
      sessionUser: req.session.user
    });
  } catch (err) {
    console.error('GET /inventory/create error:', err);
    res.status(500).render('500', { error: err.message, title: 'Error' });
  }
});

// POST /inventory - Create New Item
router.post('/', requireInventoryAccess, (req, res) => {
  try {
    const { 
      itemMode, name, sku, category, unit, packageSize, minThreshold, criticalThreshold, maxThreshold, 
      supplier, supplierPartNumber, manufacturer, cost, area, location, 
      storageTemp, requiresRefrigeration, hazardClass, msdsUrl, 
      openVialStabilityDays, barcode, notes, targetRoles 
    } = req.body;

    if (!name || !name.trim() || !category) {
      return res.status(400).json({ error: 'Item Name and Category are required.' });
    }

    // Parse targetRoles into Array
    const parsedTargetRoles = Array.isArray(targetRoles)
      ? targetRoles
      : (typeof targetRoles === 'string' && targetRoles ? [targetRoles] : []);

    // Check for existing duplicates:
    // 1. If explicit ID provided, check if item already exists
    if (req.body.id && typeof global.db.getInventoryById === 'function') {
      const existing = global.db.getInventoryById(req.body.id);
      if (existing) {
        Object.assign(existing, {
          name: name.trim(),
          category,
          unit: unit || existing.unit,
          area: area || existing.area,
          minThreshold: parseInt(minThreshold, 10) || existing.minThreshold,
          criticalThreshold: criticalThreshold !== undefined && criticalThreshold !== '' ? parseInt(criticalThreshold, 10) : existing.criticalThreshold,
          storageTemp: storageTemp || existing.storageTemp,
          updatedAt: new Date().toISOString()
        });
        global.db.saveInventory(existing);
        return res.json({
          success: true,
          itemId: existing.id,
          message: `Reagent/Supply "${existing.name}" updated successfully!`
        });
      }
    }

    // 2. Check if an item with the exact same name, category, and area already exists (idempotency check)
    const existingList = typeof global.db.getInventory === 'function' ? global.db.getInventory() : [];
    const normalizedName = name.trim().toLowerCase();
    const normalizedArea = (area || 'General Laboratory').trim().toLowerCase();
    const match = existingList.find(i => 
      i && i.isActive !== false &&
      i.name && i.name.trim().toLowerCase() === normalizedName &&
      i.category === category &&
      (i.area || 'General Laboratory').trim().toLowerCase() === normalizedArea
    );

    if (match) {
      return res.json({
        success: true,
        itemId: match.id,
        message: `Reagent/Supply "${match.name}" already registered in ${match.area}.`
      });
    }

    // Auto-generate SKU if not provided
    const cleanSku = (sku && sku.trim()) || `REF-${Date.now().toString().slice(-6)}`;

    const item = new Inventory({
      id: req.body.id || undefined,
      itemMode: itemMode || (['Reagents', 'Controls', 'Calibrators', 'Stains & Dyes', 'Test Kits', 'Clinical Reagents', 'X-Ray & Imaging Chemicals'].includes(category) ? 'reagent' : 'supply'),
      name: name.trim(),
      sku: cleanSku,
      category,
      unit: unit || 'ml',
      packageSize: packageSize || '',
      minThreshold: parseInt(minThreshold, 10) || 0,
      criticalThreshold: criticalThreshold !== undefined && criticalThreshold !== '' ? parseInt(criticalThreshold, 10) : 2,
      maxThreshold: maxThreshold ? parseInt(maxThreshold, 10) : null,
      supplier: supplier || '',
      supplierPartNumber: supplierPartNumber || '',
      manufacturer: manufacturer || '',
      cost: parseFloat(cost) || 0,
      area: area || 'General Laboratory',
      location: location || '',
      storageTemp: storageTemp || '18-25°C Room Temp',
      requiresRefrigeration: requiresRefrigeration === 'on' || requiresRefrigeration === true || (storageTemp && storageTemp.includes('2-8°C')),
      hazardClass: hazardClass || 'Non-Hazardous',
      msdsUrl: msdsUrl || '',
      openVialStabilityDays: openVialStabilityDays ? parseInt(openVialStabilityDays, 10) : null,
      barcode: barcode || '',
      notes: notes || '',
      targetRoles: parsedTargetRoles,
      createdBy: getUserIdentifier(req)
    });

    const saved = global.db.saveInventory(item);
    if (!saved) {
      return res.status(500).json({ error: 'Database failed to save the inventory item.' });
    }

    // Broadcast SSE event — all connected clients refresh instantly
    try { sseEmitter.emit('update', { action: 'inventory_create', itemId: saved.id, name: saved.name, category: saved.category, area: saved.area, totalStock: 0, time: new Date().toISOString() }); } catch (_) {}

    res.json({ 
      success: true, 
      itemId: saved.id, 
      message: `Reagent/Supply "${saved.name}" registered successfully!` 
    });
  } catch (err) {
    console.error('POST /inventory error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /inventory/:id/batches - JSON endpoint for active lot selection
router.get('/:id/batches', requireAuth, (req, res) => {
  try {
    const rawBatches = global.db.getInventoryBatchesByItemId(req.params.id) || [];
    const batches = rawBatches
      .map(b => new InventoryBatch(b))
      .filter(b => b.quantityOnHand > 0 && b.qcStatus !== 'QUARANTINED' && b.qcStatus !== 'DISCARDED')
      .map(b => ({
        id: b.id,
        lotNumber: b.lotNumber,
        quantityOnHand: b.quantityOnHand,
        isOpen: !!b.isOpen,
        expirationDate: b.expirationDate,
        effectiveExpirationDate: b.effectiveExpirationDate,
        qcStatus: b.qcStatus
      }));
    res.json(batches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /inventory/:id - View Item Details, Active Batches, and Full Audit Trail
router.get('/:id', requireAuth, (req, res) => {
  try {
    const raw = global.db.getInventoryById(req.params.id);
    if (!raw) {
      return res.status(404).render('404', { title: 'Item Not Found' });
    }

    const item = new Inventory(raw);
    const rawBatches = global.db.getInventoryBatchesByItemId(item.id) || [];
    const batches = rawBatches.map(b => new InventoryBatch(b));
    const rawTransactions = global.db.getInventoryTransactions(item.id) || [];
    const transactions = rawTransactions.map(t => new InventoryTransaction(t));

    const totalStock = batches.reduce((sum, b) => sum + (b.quantityOnHand || 0), 0);
    const activeBatches = batches.filter(b => b.quantityOnHand > 0);

    const canEdit = hasInventoryAccess(req.session.user);

    res.render('inventory/details', {
      title: `${item.name} (${item.sku}) - Inventory Details`,
      item: { ...item, totalStock },
      batches,
      activeBatches,
      transactions,
      sessionUser: req.session.user,
      canEdit,
      isEditableUser: canEdit
    });
  } catch (err) {
    console.error('GET /inventory/:id error:', err);
    res.status(500).render('500', { error: err.message, title: 'Error' });
  }
});

// GET /inventory/:id/edit - Edit Form
router.get('/:id/edit', requireInventoryAccess, (req, res) => {
  try {
    const raw = global.db.getInventoryById(req.params.id);
    if (!raw) {
      return res.status(404).render('404', { title: 'Item Not Found' });
    }

    const item = new Inventory(raw);
    const categories = [
      'Clinical Reagents',
      'X-Ray & Imaging Chemicals',
      'X-Ray Films & Accessories',
      'Ultrasound & Echo Gels',
      'ECG Papers & Electrodes',
      'Controls & Calibrators',
      'Stains & Dyes',
      'Test Kits',
      'Consumables',
      'General Supplies',
      'PPE'
    ];
    const areas = [
      'Clinical Chemistry',
      'Hematology',
      'Immunology & Serology',
      'Microbiology',
      'Urinalysis & Parasitology',
      'Blood Banking',
      'Histopathology',
      'X-Ray & Radiology',
      'Ultrasound & 2D Echo',
      'Cardiology & ECG',
      'General Laboratory'
    ];

    res.render('inventory/edit', {
      title: `Edit Inventory Item: ${item.name}`,
      item,
      categories,
      areas,
      sessionUser: req.session.user
    });
  } catch (err) {
    console.error('GET /inventory/:id/edit error:', err);
    res.status(500).render('500', { error: err.message, title: 'Error' });
  }
});

// PUT /inventory/:id or POST /inventory/:id - Update Item
const handleUpdateItem = (req, res) => {
  try {
    let raw = global.db.getInventoryById(req.params.id);
    if (!raw) {
      return res.status(404).json({ error: 'Inventory item not found.' });
    }

    const { 
      itemMode, name, sku, category, unit, packageSize, minThreshold, criticalThreshold, maxThreshold, 
      supplier, supplierPartNumber, manufacturer, cost, area, location, 
      storageTemp, requiresRefrigeration, hazardClass, msdsUrl, 
      openVialStabilityDays, barcode, notes, targetRoles, isActive 
    } = req.body;

    const parsedTargetRoles = targetRoles !== undefined
      ? (Array.isArray(targetRoles) ? targetRoles : (targetRoles ? [targetRoles] : []))
      : raw.targetRoles;

    const targetCategory = category !== undefined ? category : raw.category;
    const finalItemMode = itemMode !== undefined ? itemMode : (['Reagents', 'Controls', 'Calibrators', 'Stains & Dyes', 'Test Kits', 'Clinical Reagents', 'X-Ray & Imaging Chemicals'].includes(targetCategory) ? 'reagent' : 'supply');

    const updatedItem = new Inventory({
      ...raw,
      itemMode: finalItemMode,
      name: name !== undefined ? name.trim() : raw.name,
      sku: sku !== undefined ? sku.trim() : raw.sku,
      category: targetCategory,
      unit: unit !== undefined ? unit : raw.unit,
      packageSize: packageSize !== undefined ? packageSize : raw.packageSize,
      minThreshold: minThreshold !== undefined ? parseInt(minThreshold, 10) : raw.minThreshold,
      criticalThreshold: criticalThreshold !== undefined && criticalThreshold !== '' ? parseInt(criticalThreshold, 10) : raw.criticalThreshold,
      maxThreshold: maxThreshold !== undefined ? (maxThreshold ? parseInt(maxThreshold, 10) : null) : raw.maxThreshold,
      supplier: supplier !== undefined ? supplier : raw.supplier,
      supplierPartNumber: supplierPartNumber !== undefined ? supplierPartNumber : raw.supplierPartNumber,
      manufacturer: manufacturer !== undefined ? manufacturer : raw.manufacturer,
      cost: cost !== undefined ? parseFloat(cost) : raw.cost,
      area: area !== undefined ? area : raw.area,
      location: location !== undefined ? location : raw.location,
      storageTemp: storageTemp !== undefined ? storageTemp : raw.storageTemp,
      requiresRefrigeration: requiresRefrigeration !== undefined 
        ? (requiresRefrigeration === 'on' || requiresRefrigeration === true || (storageTemp && storageTemp.includes('2-8°C')))
        : raw.requiresRefrigeration,
      hazardClass: hazardClass !== undefined ? hazardClass : raw.hazardClass,
      msdsUrl: msdsUrl !== undefined ? msdsUrl : raw.msdsUrl,
      openVialStabilityDays: openVialStabilityDays !== undefined ? (openVialStabilityDays ? parseInt(openVialStabilityDays, 10) : null) : raw.openVialStabilityDays,
      barcode: barcode !== undefined ? barcode : raw.barcode,
      notes: notes !== undefined ? notes : raw.notes,
      targetRoles: parsedTargetRoles,
      isActive: isActive !== undefined ? (isActive === true || isActive === 'true' || isActive === 'on') : raw.isActive,
      updatedAt: new Date().toISOString()
    });

    const saved = global.db.saveInventory(updatedItem);
    if (!saved) {
      return res.status(500).json({ error: 'Failed to save updated inventory item.' });
    }

    // Broadcast SSE update event
    try { sseEmitter.emit('update', { action: 'inventory_update', itemId: saved.id, name: saved.name, category: saved.category, area: saved.area, totalStock: getTotalStock(saved.id), time: new Date().toISOString() }); } catch (_) {}

    res.json({ success: true, message: 'Item details updated successfully.' });
  } catch (err) {
    console.error('Update inventory item error:', err);
    res.status(500).json({ error: err.message });
  }
};

router.put('/:id', requireInventoryAccess, handleUpdateItem);
router.post('/:id', requireInventoryAccess, handleUpdateItem);

// POST /inventory/:id/delete or DELETE /inventory/:id - Delete item
const handleDeleteItem = (req, res) => {
  try {
    const item = global.db.getInventoryById(req.params.id);
    if (!item) {
      return res.json({ success: true, message: 'Item already removed.' });
    }

    // Audit and safety verification: capture stock on hand prior to deletion
    let totalStock = 0;
    let batchCount = 0;
    try {
      if (typeof global.db.getInventoryBatchesByItemId === 'function') {
        const batches = global.db.getInventoryBatchesByItemId(item.id) || [];
        batchCount = batches.length;
        totalStock = batches.reduce((sum, b) => sum + (b.quantityOnHand || 0), 0);
      }
    } catch (_) {}

    const userEmail = getUserIdentifier(req);
    console.warn(`[AUDIT WARNING] User "${userEmail}" deleted inventory item "${item.name}" (SKU: ${item.sku}, ID: ${item.id}, Area: ${item.area}, Category: ${item.category}, StockOnHand: ${totalStock} ${item.unit}, Batches: ${batchCount}) at ${new Date().toISOString()}`);

    let success = false;
    try {
      if (typeof global.db.deleteInventory === 'function') {
        success = global.db.deleteInventory(req.params.id);
      }
    } catch (dbErr) {
      console.error('[routes/inventory] deleteInventory DB error:', dbErr && dbErr.message);
    }

    if (!success) {
      // Soft-delete fallback to guarantee clean removal from views
      try {
        if (typeof global.db.saveInventory === 'function') {
          item.isActive = false;
          item.updatedAt = new Date().toISOString();
          global.db.saveInventory(item);
          success = true;
        }
      } catch (softErr) {
        console.error('[routes/inventory] soft-delete fallback error:', softErr && softErr.message);
      }
    }

    if (!success) {
      return res.status(500).json({ error: 'Failed to delete inventory item.' });
    }

    // Broadcast SSE delete event
    try { sseEmitter.emit('update', { action: 'inventory_delete', itemId: item.id, name: item.name, time: new Date().toISOString() }); } catch (_) {}

    res.json({ success: true, message: `Item "${item.name}" deleted successfully.` });
  } catch (err) {
    console.error('Delete inventory item error:', err);
    res.status(500).json({ error: err.message });
  }
};

router.delete('/:id', requireInventoryAccess, handleDeleteItem);
router.post('/:id/delete', requireInventoryAccess, handleDeleteItem);

// POST /inventory/:id/batch - Receive & Register New Lot/Batch
router.post('/:id/batch', requireInventoryAccess, (req, res) => {
  try {
    const item = global.db.getInventoryById(req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'Inventory item not found.' });
    }

    const { 
      lotNumber, serialNumber, receivedDate, expirationDate, quantityReceived, 
      storageLocation, supplierPartNumber, receiptCondition, receivedTemperature, 
      qcStatus, certificateOfAnalysis, receiveNotes 
    } = req.body;

    const qty = parseInt(quantityReceived, 10);
    if (!qty || qty <= 0) {
      return res.status(400).json({ error: 'Quantity received must be a positive integer greater than 0.' });
    }

    const cleanLotNumber = (lotNumber && lotNumber.trim()) || `LOT-${Date.now().toString().slice(-8)}`;

    // Idempotency check: if a batch with this exact lotNumber already exists for this item, return it
    const existingBatches = (typeof global.db.getInventoryBatchesByItemId === 'function')
      ? (global.db.getInventoryBatchesByItemId(item.id) || [])
      : [];
    const dupBatch = existingBatches.find(b => 
      b && b.lotNumber && b.lotNumber.trim().toUpperCase() === cleanLotNumber.trim().toUpperCase()
    );
    if (dupBatch) {
      return res.json({
        success: true,
        batch: dupBatch,
        message: `Lot "${cleanLotNumber}" is already registered for this item.`
      });
    }

    const batch = new InventoryBatch({
      id: req.body.id || undefined,
      inventoryId: item.id,
      lotNumber: cleanLotNumber,
      serialNumber: serialNumber || '',
      receivedDate: receivedDate || new Date(),
      expirationDate: expirationDate || null,
      quantityReceived: qty,
      quantityOnHand: qty,
      quantityDefective: 0,
      storageLocation: storageLocation || item.location || 'General Storage',
      storageArea: item.area || 'General Laboratory',
      supplierPartNumber: supplierPartNumber || item.supplierPartNumber || '',
      receiptCondition: receiptCondition || 'ACCEPTABLE',
      receivedTemperature: receivedTemperature || item.storageTemp || '',
      qcStatus: qcStatus || 'PASSED',
      qcVerifiedBy: qcStatus === 'PASSED' ? getUserIdentifier(req) : '',
      qcVerifiedDate: qcStatus === 'PASSED' ? new Date().toISOString() : null,
      certificateOfAnalysis: certificateOfAnalysis || '',
      receiveNotes: receiveNotes || '',
      createdBy: getUserIdentifier(req)
    });

    const savedBatch = global.db.saveBatch(batch);
    if (!savedBatch) {
      return res.status(500).json({ error: 'Failed to save batch.' });
    }

    // Record RECEIVE audit transaction
    const transaction = new InventoryTransaction({
      id: (req.body && req.body.transactionId) ? req.body.transactionId : undefined,
      inventoryId: item.id,
      batchId: savedBatch.id,
      lotNumber: savedBatch.lotNumber,
      transactionType: 'RECEIVE',
      quantity: qty,
      quantityBefore: 0,
      quantityAfter: qty,
      reason: receiveNotes || 'Initial Lot/Batch stock receipt',
      notes: `Condition: ${batch.receiptCondition}, Temp: ${batch.receivedTemperature}, QC: ${batch.qcStatus}`,
      performedBy: getUserIdentifier(req)
    });

    global.db.saveTransaction(transaction);

    // Broadcast SSE stock receive event
    try { sseEmitter.emit('update', { action: 'inventory_stock', itemId: item.id, name: item.name, batchId: savedBatch.id, lotNumber: savedBatch.lotNumber, delta: qty, totalStock: getTotalStock(item.id), time: new Date().toISOString() }); } catch (_) {}

    res.json({ 
      success: true, 
      batchId: savedBatch.id, 
      message: `Lot ${savedBatch.lotNumber} (${qty} ${item.unit}) received and registered successfully!` 
    });
  } catch (err) {
    console.error('POST /inventory/:id/batch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /inventory/:id/batch/:batchId/open - Open Vial / Bottle (ISO 15189 In-Use Stability Activation)
router.post('/:id/batch/:batchId/open', requireInventoryAccess, (req, res) => {
  try {
    const item = global.db.getInventoryById(req.params.id);
    const batchRaw = global.db.getInventoryBatchById(req.params.batchId);
    if (!item || !batchRaw) {
      return res.status(404).json({ error: 'Item or batch not found.' });
    }

    const batch = new InventoryBatch(batchRaw);
    if (batch.isOpen) {
      return res.status(400).json({ error: 'This batch/vial has already been marked as opened.' });
    }

    const openDate = req.body.dateOpened ? new Date(req.body.dateOpened) : new Date();
    const stabilityDays = item.openVialStabilityDays ? parseInt(item.openVialStabilityDays, 10) : 30;
    
    // Calculate in-use expiry date
    const openVialExpiry = new Date(openDate.getTime() + stabilityDays * 24 * 60 * 60 * 1000);

    batch.isOpen = true;
    batch.dateOpened = openDate.toISOString();
    batch.openedBy = getUserIdentifier(req);
    batch.openVialExpiryDate = openVialExpiry.toISOString();
    batch.updatedAt = new Date().toISOString();

    global.db.saveBatch(batch);

    // Record OPEN_VIAL transaction
    const transaction = new InventoryTransaction({
      inventoryId: item.id,
      batchId: batch.id,
      lotNumber: batch.lotNumber,
      transactionType: 'OPEN_VIAL',
      quantity: 0,
      quantityBefore: batch.quantityOnHand,
      quantityAfter: batch.quantityOnHand,
      reason: req.body.reason || `Opened for active testing (In-use stability: ${stabilityDays} days)`,
      notes: `Open-vial expiry set to ${openVialExpiry.toLocaleDateString()}`,
      performedBy: getUserIdentifier(req)
    });

    global.db.saveTransaction(transaction);

    res.json({ 
      success: true, 
      message: `Lot ${batch.lotNumber} marked as OPEN. Open-vial expiry: ${openVialExpiry.toLocaleDateString()}` 
    });
  } catch (err) {
    console.error('POST open batch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /inventory/:id/batch/:batchId/qc - Update QC Verification Status
router.post('/:id/batch/:batchId/qc', requireInventoryAccess, (req, res) => {
  try {
    const item = global.db.getInventoryById(req.params.id);
    const batchRaw = global.db.getInventoryBatchById(req.params.batchId);
    if (!item || !batchRaw) {
      return res.status(404).json({ error: 'Item or batch not found.' });
    }

    const { qcStatus, notes } = req.body;
    if (!qcStatus) {
      return res.status(400).json({ error: 'QC Status is required.' });
    }

    const batch = new InventoryBatch(batchRaw);
    const prevStatus = batch.qcStatus;
    batch.qcStatus = qcStatus;
    batch.qcVerifiedBy = getUserIdentifier(req);
    batch.qcVerifiedDate = new Date().toISOString();
    batch.updatedAt = new Date().toISOString();

    global.db.saveBatch(batch);

    // Record audit transaction
    const transaction = new InventoryTransaction({
      inventoryId: item.id,
      batchId: batch.id,
      lotNumber: batch.lotNumber,
      transactionType: 'QC_USAGE',
      quantity: 0,
      quantityBefore: batch.quantityOnHand,
      quantityAfter: batch.quantityOnHand,
      reason: `QC Status changed from ${prevStatus} to ${qcStatus}`,
      notes: notes || '',
      performedBy: getUserIdentifier(req)
    });

    global.db.saveTransaction(transaction);

    res.json({ 
      success: true, 
      message: `Lot ${batch.lotNumber} QC status updated to ${qcStatus}.` 
    });
  } catch (err) {
    console.error('POST qc status error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /inventory/:id/batch/:batchId/adjust - Stock Count Adjustment (Physical Inventory Audit)
router.post('/:id/batch/:batchId/adjust', requireInventoryAccess, (req, res) => {
  try {
    const item = global.db.getInventoryById(req.params.id);
    const batchRaw = global.db.getInventoryBatchById(req.params.batchId);
    if (!item || !batchRaw) {
      return res.status(404).json({ error: 'Item or batch not found.' });
    }

    const { newQuantity, reason, notes } = req.body;
    if (newQuantity === undefined || isNaN(newQuantity) || parseInt(newQuantity, 10) < 0) {
      return res.status(400).json({ error: 'Valid non-negative new quantity is required.' });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'An audit reason for stock adjustment is required by ISO 15189 standards.' });
    }

    const batch = new InventoryBatch(batchRaw);
    const targetQty = parseInt(newQuantity, 10);
    const quantityBefore = batch.quantityOnHand;
    const diff = targetQty - quantityBefore;

    batch.quantityOnHand = targetQty;
    batch.updatedAt = new Date().toISOString();

    global.db.saveBatch(batch);

    // Record ADJUST transaction
    const transaction = new InventoryTransaction({
      inventoryId: item.id,
      batchId: batch.id,
      lotNumber: batch.lotNumber,
      transactionType: 'ADJUST',
      quantity: diff,
      quantityBefore,
      quantityAfter: targetQty,
      reason: reason.trim(),
      notes: notes || '',
      performedBy: getUserIdentifier(req)
    });

    global.db.saveTransaction(transaction);

    // Broadcast SSE stock adjust event
    try { sseEmitter.emit('update', { action: 'inventory_stock', itemId: item.id, name: item.name, batchId: batch.id, lotNumber: batch.lotNumber, delta: diff, totalStock: getTotalStock(item.id), time: new Date().toISOString() }); } catch (_) {}

    res.json({ 
      success: true, 
      message: `Stock for Lot ${batch.lotNumber} adjusted from ${quantityBefore} to ${targetQty} ${item.unit}.` 
    });
  } catch (err) {
    console.error('POST adjust batch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /inventory/:id/batch/:batchId/discard - Discard / Biohazard Waste Removal
router.post('/:id/batch/:batchId/discard', requireInventoryAccess, (req, res) => {
  try {
    const item = global.db.getInventoryById(req.params.id);
    const batchRaw = global.db.getInventoryBatchById(req.params.batchId);
    if (!item || !batchRaw) {
      return res.status(404).json({ error: 'Item or batch not found.' });
    }

    const { discardQuantity, reason, notes } = req.body;
    const qtyToDiscard = parseInt(discardQuantity, 10);

    if (!qtyToDiscard || qtyToDiscard <= 0) {
      return res.status(400).json({ error: 'Discard quantity must be greater than 0.' });
    }

    const batch = new InventoryBatch(batchRaw);
    if (batch.quantityOnHand < qtyToDiscard) {
      return res.status(400).json({ error: `Cannot discard ${qtyToDiscard}. Only ${batch.quantityOnHand} units available in lot.` });
    }

    const quantityBefore = batch.quantityOnHand;
    batch.quantityOnHand -= qtyToDiscard;
    batch.quantityDefective = (batch.quantityDefective || 0) + qtyToDiscard;
    if (batch.quantityOnHand === 0) {
      batch.qcStatus = 'DISCARDED';
    }
    batch.updatedAt = new Date().toISOString();

    global.db.saveBatch(batch);

    // Record DISCARD transaction
    const transaction = new InventoryTransaction({
      inventoryId: item.id,
      batchId: batch.id,
      lotNumber: batch.lotNumber,
      transactionType: 'DISCARD',
      quantity: qtyToDiscard,
      quantityBefore,
      quantityAfter: batch.quantityOnHand,
      reason: reason || 'Biohazard discard / Expired / Damaged',
      notes: notes || '',
      performedBy: getUserIdentifier(req)
    });

    global.db.saveTransaction(transaction);

    // Broadcast SSE discard event
    try { sseEmitter.emit('update', { action: 'inventory_stock', itemId: item.id, name: item.name, batchId: batch.id, lotNumber: batch.lotNumber, delta: -qtyToDiscard, totalStock: getTotalStock(item.id), time: new Date().toISOString() }); } catch (_) {}

    res.json({ 
      success: true, 
      message: `Discarded ${qtyToDiscard} ${item.unit} from Lot ${batch.lotNumber}. Remaining: ${batch.quantityOnHand}` 
    });
  } catch (err) {
    console.error('POST discard batch error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /inventory/:id/batch/:batchId/delete or DELETE - Delete Batch
const handleDeleteBatch = (req, res) => {
  try {
    const batch = global.db.getInventoryBatchById(req.params.batchId);
    if (!batch) {
      return res.status(404).json({ error: 'Batch not found.' });
    }

    const success = global.db.deleteBatch(req.params.batchId);
    if (!success) {
      return res.status(500).json({ error: 'Failed to delete batch.' });
    }

    res.json({ success: true, message: `Batch Lot ${batch.lotNumber} deleted successfully.` });
  } catch (err) {
    console.error('Delete batch error:', err);
    res.status(500).json({ error: err.message });
  }
};

router.delete('/:id/batch/:batchId', requireInventoryAccess, handleDeleteBatch);
router.post('/:id/batch/:batchId/delete', requireInventoryAccess, handleDeleteBatch);

// POST /inventory/:id/consume - Routine Test Reagent Consumption
router.post('/:id/consume', requireAuth, (req, res) => {
  try {
    const item = global.db.getInventoryById(req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'Inventory item not found.' });
    }

    const { quantity, batchId, testId, reason } = req.body;
    const qty = parseInt(quantity, 10);

    if (!qty || qty <= 0) {
      return res.status(400).json({ error: 'Quantity must be greater than 0.' });
    }

    let batch = batchId ? global.db.getInventoryBatchById(batchId) : null;

    // If no batch specified, use FEFO (First-Expired, First-Out) or FIFO
    if (!batch) {
      const rawBatches = global.db.getInventoryBatchesByItemId(item.id) || [];
      const usable = rawBatches
        .map(b => new InventoryBatch(b))
        .filter(b => !b.isExpired && b.quantityOnHand > 0 && b.qcStatus !== 'QUARANTINED' && b.qcStatus !== 'DISCARDED');

      if (usable.length === 0) {
        return res.status(400).json({ error: 'No usable, unexpired stock available for this item.' });
      }

      // Prioritize open vials first, then earliest expiring
      usable.sort((a, b) => {
        if (a.isOpen && !b.isOpen) return -1;
        if (!a.isOpen && b.isOpen) return 1;
        const expA = a.effectiveExpirationDate ? new Date(a.effectiveExpirationDate).getTime() : Infinity;
        const expB = b.effectiveExpirationDate ? new Date(b.effectiveExpirationDate).getTime() : Infinity;
        return expA - expB;
      });

      batch = usable[0];
    }

    if (batch.quantityOnHand < qty) {
      return res.status(400).json({ error: `Insufficient stock in Lot ${batch.lotNumber}. Available: ${batch.quantityOnHand}` });
    }

    const quantityBefore = batch.quantityOnHand;
    batch.quantityOnHand -= qty;
    batch.updatedAt = new Date().toISOString();

    global.db.saveBatch(batch);

    // Record CONSUME transaction
    const transaction = new InventoryTransaction({
      inventoryId: item.id,
      batchId: batch.id,
      lotNumber: batch.lotNumber,
      transactionType: 'CONSUME',
      quantity: qty,
      quantityBefore,
      quantityAfter: batch.quantityOnHand,
      testId: testId || null,
      reason: reason || 'Routine patient specimen test analysis',
      performedBy: getUserIdentifier(req)
    });

    global.db.saveTransaction(transaction);

    // Broadcast SSE consume event
    try { sseEmitter.emit('update', { action: 'inventory_stock', itemId: item.id, name: item.name, batchId: batch.id, lotNumber: batch.lotNumber, delta: -qty, totalStock: getTotalStock(item.id), time: new Date().toISOString() }); } catch (_) {}

    res.json({ 
      success: true, 
      message: `Consumed ${qty} ${item.unit} from Lot ${batch.lotNumber}. Remaining: ${batch.quantityOnHand}` 
    });
  } catch (err) {
    console.error('POST /inventory/:id/consume error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /inventory/:id/transactions - JSON Transaction Audit List
router.get('/:id/transactions', requireAuth, (req, res) => {
  try {
    const item = global.db.getInventoryById(req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'Inventory item not found.' });
    }

    const rawTx = global.db.getInventoryTransactions(req.params.id) || [];
    const transactions = rawTx.map(t => new InventoryTransaction(t));

    res.json({
      itemName: item.name,
      sku: item.sku,
      transactions: transactions.map(t => ({
        ...t,
        displayText: t.displayText,
        formattedDate: t.formatTimestamp()
      }))
    });
  } catch (err) {
    console.error('GET /inventory/:id/transactions error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
