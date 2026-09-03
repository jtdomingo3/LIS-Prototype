const { v4: uuidv4 } = require('uuid');

/**
 * Inventory Model
 * Represents a reagent, supply, or equipment item in the clinical laboratory.
 * Compliant with ISO 15189, CLSI GP44, CAP, and Good Laboratory Practice (GLP) standards.
 */
class Inventory {
  constructor(data = {}) {
    this.id = data.id || uuidv4();
    this.sku = data.sku || `SKU-${Date.now()}`; // Unique stock keeping unit / Catalog REF
    this.name = data.name || ''; // e.g., "AST / SGOT Reagent Kit", "EDTA K2 Vacuum Tubes 3ml"
    this.description = data.description || '';
    this.category = data.category || 'Reagents'; // Reagents, Controls, Calibrators, Consumables, Stains & Dyes, Test Kits, General Supplies, PPE
    this.unit = data.unit || 'ml'; // ml, L, μL, g, mg, kg, tests, kits, tubes, vials, bottles, boxes, pcs, packs
    this.packageSize = data.packageSize || ''; // e.g. "100 tests/kit", "500 ml/bottle"
    this.minThreshold = Number.isFinite(Number(data.minThreshold)) ? Math.max(0, parseInt(data.minThreshold, 10)) : 5; // Reorder safety level
    this.criticalThreshold = Number.isFinite(Number(data.criticalThreshold)) ? Math.max(0, parseInt(data.criticalThreshold, 10)) : Math.min(2, this.minThreshold); // Critical emergency stock alert level
    this.maxThreshold = data.maxThreshold ? parseInt(data.maxThreshold, 10) : null; // Max capacity
    this.supplier = data.supplier || ''; // Supplier / Vendor
    this.supplierPartNumber = data.supplierPartNumber || ''; // Catalog / Ref #
    this.manufacturer = data.manufacturer || ''; // Manufacturer (Roche, Bio-Rad, Abbott, Mindray, etc.)
    this.cost = Number.isFinite(Number(data.cost)) ? Math.max(0, parseFloat(data.cost)) : 0; // Unit cost
    this.storageTemp = data.storageTemp || (data.requiresRefrigeration ? '2-8°C Refrigerated' : '18-25°C Room Temp');
    this.location = data.location || ''; // Default physical storage (e.g., "Main Refrigerator 1 - Shelf B")
    this.area = data.area || 'General Laboratory'; // Lab section / department
    this.requiresRefrigeration = !!(data.requiresRefrigeration === true || data.requiresRefrigeration === 'on' || (data.storageTemp && data.storageTemp.includes('2-8°C')));
    this.hazardClass = data.hazardClass || 'Non-Hazardous'; // Non-Hazardous, Corrosive, Flammable, Toxic, Oxidizer, Biohazard, Irritant
    this.msdsUrl = data.msdsUrl || ''; // SDS / Safety Data Sheet reference
    this.openVialStabilityDays = data.openVialStabilityDays ? parseInt(data.openVialStabilityDays, 10) : null; // In-use stability period in days
    this.barcode = data.barcode || '';
    this.targetRoles = Array.isArray(data.targetRoles)
      ? data.targetRoles
      : (typeof data.targetRoles === 'string' && data.targetRoles ? [data.targetRoles] : []);
    this.isActive = data.isActive !== false && data.isActive !== 'false'; // Active status
    this.notes = data.notes || '';
    this.itemMode = data.itemMode || (['Reagents', 'Controls', 'Calibrators', 'Stains & Dyes', 'Test Kits', 'Clinical Reagents', 'X-Ray & Imaging Chemicals'].includes(this.category) ? 'reagent' : 'supply');
    this.createdAt = data.createdAt ? new Date(data.createdAt).toISOString() : new Date().toISOString();
    this.updatedAt = data.updatedAt ? new Date(data.updatedAt).toISOString() : new Date().toISOString();
    this.createdBy = data.createdBy || 'System';
  }

  // Boolean helper: true if biochemical reagent/chemical kit, false if consumable supply/film/paper
  get isReagent() {
    if (this.itemMode === 'reagent') return true;
    if (this.itemMode === 'supply') return false;
    return ['Reagents', 'Controls', 'Calibrators', 'Stains & Dyes', 'Test Kits', 'Clinical Reagents', 'X-Ray & Imaging Chemicals'].includes(this.category);
  }

  get isSupply() {
    return !this.isReagent;
  }

  // Default staff roles to notify based on clinical area / department
  get defaultTargetRoles() {
    const a = String(this.area || '').toLowerCase();
    if (a.includes('2d echo') || a.includes('echo') || a.includes('cardiology') || a.includes('ecg')) {
      return ['X-Ray Technologist', 'Sonographer', 'Doctor', 'Technician'];
    }
    if (a.includes('x-ray') || a.includes('radiology')) {
      return ['X-Ray Technologist', 'Radiologist', 'Technician'];
    }
    if (a.includes('ultrasound')) {
      return ['Sonographer', 'Doctor'];
    }
    // Default for clinical lab sections (Clinical Chemistry, Hematology, Micro, etc.):
    return ['Medical Technologist', 'Technician', 'Doctor', 'Pathologist'];
  }

  // Determine if a specific user account should receive stock alerts for this item
  shouldAlertUser(user) {
    if (!user) return false;
    const role = (user.role || '').trim();

    // Admins, Managers, Owners, and users with global inventory permission always receive all alerts
    const managementRoles = new Set(['Admin', 'admin', 'Manager', 'manager', 'Owner', 'owner']);
    if (managementRoles.has(role)) return true;

    let perms = user.permissions || {};
    if (typeof perms === 'string') {
      try { perms = JSON.parse(perms); } catch (_) { perms = {}; }
    }
    if (perms.admin || perms.inventory) return true;

    const targets = (Array.isArray(this.targetRoles) && this.targetRoles.length > 0)
      ? this.targetRoles
      : this.defaultTargetRoles;

    const normalizedRole = role.toLowerCase().replace(/[-_]/g, ' ');

    return targets.some(target => {
      const t = String(target).toLowerCase().replace(/[-_]/g, ' ');
      if (normalizedRole === t || normalizedRole.includes(t) || t.includes(normalizedRole)) return true;

      // Clinical lab aliases: MedTech, Medical Technologist, Technician
      if ((t.includes('medtech') || t.includes('medical technologist')) && 
          (normalizedRole.includes('medtech') || normalizedRole.includes('medical technologist') || normalizedRole === 'technician' || normalizedRole === 'staff')) {
        return true;
      }
      // X-Ray aliases: X-Ray Tech, X-Ray Technologist, Radiologic Technologist, RadTech
      if ((t.includes('x-ray') || t.includes('radiolog') || t.includes('radtech')) &&
          (normalizedRole.includes('x-ray') || normalizedRole.includes('radiolog') || normalizedRole.includes('radtech') || normalizedRole.includes('xray'))) {
        return true;
      }
      // Ultrasound aliases: Sonographer, Ultrasound Tech
      if ((t.includes('sonographer') || t.includes('ultrasound')) &&
          (normalizedRole.includes('sonographer') || normalizedRole.includes('ultrasound'))) {
        return true;
      }
      return false;
    });
  }

  // Virtual: Calculate total current stock across all active, non-discarded batches
  get totalStock() {
    if (global.db && typeof global.db.getInventoryBatchesByItemId === 'function') {
      const batches = global.db.getInventoryBatchesByItemId(this.id) || [];
      return Array.isArray(batches)
        ? batches.reduce((sum, batch) => sum + (batch.quantityOnHand || 0), 0)
        : 0;
    }
    return 0;
  }

  // Virtual: Check if stock is low or at reorder point
  get isLowStock() {
    return this.totalStock <= this.minThreshold;
  }

  // Virtual: Check if stock is at or below critical emergency reserve level
  get isCriticalStock() {
    return this.totalStock <= this.criticalThreshold;
  }

  // Virtual: Find batches expiring soon (within 30 days) or already expired (sealed or open-vial)
  get expiringBatches() {
    if (global.db && typeof global.db.getInventoryBatchesByItemId === 'function') {
      const batches = global.db.getInventoryBatchesByItemId(this.id) || [];
      if (!Array.isArray(batches)) return [];
      
      const now = new Date();
      const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      
      return batches.filter(batch => {
        if (batch.quantityOnHand <= 0) return false;
        
        // Check open-vial expiry first if open
        if (batch.isOpen && batch.openVialExpiryDate) {
          const openExp = new Date(batch.openVialExpiryDate);
          if (openExp <= thirtyDaysFromNow) return true;
        }

        // Check sealed expiration date
        if (!batch.expirationDate) return false;
        const expDate = new Date(batch.expirationDate);
        return expDate <= thirtyDaysFromNow;
      });
    }
    return [];
  }

  // Virtual: Active usable batches count
  get activeBatchesCount() {
    if (global.db && typeof global.db.getInventoryBatchesByItemId === 'function') {
      const batches = global.db.getInventoryBatchesByItemId(this.id) || [];
      return batches.filter(b => (b.quantityOnHand || 0) > 0 && b.qcStatus !== 'QUARANTINED' && b.qcStatus !== 'DISCARDED').length;
    }
    return 0;
  }

  // Virtual: Get latest received batch info
  get latestBatch() {
    if (global.db && typeof global.db.getInventoryBatchesByItemId === 'function') {
      const batches = global.db.getInventoryBatchesByItemId(this.id) || [];
      if (!Array.isArray(batches) || batches.length === 0) return null;
      return batches.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    }
    return null;
  }

  // Format stock display
  formatStock() {
    const stock = this.totalStock;
    const status = stock <= 0 ? '❌ OUT OF STOCK' : (stock <= this.minThreshold ? '⚠️ LOW STOCK' : (this.maxThreshold && stock > this.maxThreshold ? '⚠️ OVERSTOCK' : '✓ OK'));
    return `${stock} ${this.unit} (${status})`;
  }
}

module.exports = Inventory;
