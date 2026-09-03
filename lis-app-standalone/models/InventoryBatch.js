const { v4: uuidv4 } = require('uuid');

/**
 * InventoryBatch Model
 * Represents a specific batch/lot of an inventory reagent or supply with complete traceability:
 * - Lot number & Manufacturer expiration date
 * - In-Use / Open-Vial stability tracking (ISO 15189 requirement)
 * - Quality Control (QC) verification and lot release status
 * - Receipt condition inspection & cold-chain temperature verification
 * - Usable Quantity On Hand vs Defective / Discarded
 */
class InventoryBatch {
  constructor(data = {}) {
    this.id = data.id || uuidv4();
    this.inventoryId = data.inventoryId || ''; // Reference to Inventory item
    this.lotNumber = data.lotNumber || data.batchNumber || `LOT-${Date.now()}`; // Batch/Lot identifier
    this.serialNumber = data.serialNumber || ''; // Serial number if applicable
    this.receivedDate = data.receivedDate ? new Date(data.receivedDate).toISOString() : new Date().toISOString();
    this.expirationDate = data.expirationDate ? new Date(data.expirationDate).toISOString() : null; // Sealed expiration
    this.quantityReceived = Number.isFinite(Number(data.quantityReceived)) ? Math.max(0, parseInt(data.quantityReceived, 10)) : 0;
    this.quantityOnHand = Number.isFinite(Number(data.quantityOnHand))
      ? Math.max(0, parseInt(data.quantityOnHand, 10))
      : this.quantityReceived;
    this.quantityDefective = Number.isFinite(Number(data.quantityDefective)) ? Math.max(0, parseInt(data.quantityDefective, 10)) : 0;
    this.storageLocation = data.storageLocation || ''; // e.g. "Main Refrigerator 1 - Shelf B"
    this.storageArea = data.storageArea || '';
    this.supplierPartNumber = data.supplierPartNumber || '';
    
    // Receipt inspection & Cold-chain validation
    this.receiptCondition = data.receiptCondition || 'ACCEPTABLE'; // ACCEPTABLE, COMPROMISED, TEMPERATURE_EXCURSION
    this.receivedTemperature = data.receivedTemperature || ''; // e.g. "4°C Cold Chain OK"
    
    // Quality Control & Lot Verification
    this.qcStatus = data.qcStatus || 'PASSED'; // PASSED, PENDING_QC, QUARANTINED, DISCARDED
    this.qcVerifiedBy = data.qcVerifiedBy || '';
    this.qcVerifiedDate = data.qcVerifiedDate ? new Date(data.qcVerifiedDate).toISOString() : null;
    this.certificateOfAnalysis = data.certificateOfAnalysis || '';
    
    // Open-Vial / In-Use Stability Tracking (ISO 15189)
    this.isOpen = !!(data.isOpen === true || data.isOpen === 'true');
    this.dateOpened = data.dateOpened ? new Date(data.dateOpened).toISOString() : null;
    this.openedBy = data.openedBy || '';
    this.openVialExpiryDate = data.openVialExpiryDate ? new Date(data.openVialExpiryDate).toISOString() : null;

    this.receiveNotes = data.receiveNotes || '';
    this.isActive = data.isActive !== false && data.isActive !== 'false';
    this.createdAt = data.createdAt ? new Date(data.createdAt).toISOString() : new Date().toISOString();
    this.updatedAt = data.updatedAt ? new Date(data.updatedAt).toISOString() : new Date().toISOString();
    this.createdBy = data.createdBy || 'System';
  }

  // Calculate effective expiration date: earlier of sealed expiration vs open-vial expiration
  get effectiveExpirationDate() {
    if (this.isOpen && this.openVialExpiryDate && this.expirationDate) {
      const openExp = new Date(this.openVialExpiryDate);
      const sealedExp = new Date(this.expirationDate);
      return openExp < sealedExp ? openExp.toISOString() : sealedExp.toISOString();
    }
    if (this.isOpen && this.openVialExpiryDate) return this.openVialExpiryDate;
    return this.expirationDate;
  }

  // Virtual: Check if batch is expired (by sealed expiration or open vial expiration)
  get isExpired() {
    const effectiveExp = this.effectiveExpirationDate;
    if (!effectiveExp) return false;
    return new Date(effectiveExp) < new Date();
  }

  // Virtual: Check if batch is expiring soon (within 30 days)
  get isExpiringSoon() {
    const effectiveExp = this.effectiveExpirationDate;
    if (!effectiveExp) return false;
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const expDate = new Date(effectiveExp);
    return expDate <= thirtyDaysFromNow && expDate > now;
  }

  // Virtual: Days until effective expiration
  get daysUntilExpiration() {
    const effectiveExp = this.effectiveExpirationDate;
    if (!effectiveExp) return null;
    const expDate = new Date(effectiveExp);
    const now = new Date();
    const diff = expDate - now;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  // Virtual: Stock status code
  get stockStatus() {
    if (this.qcStatus === 'QUARANTINED') return 'QUARANTINED';
    if (this.qcStatus === 'PENDING_QC') return 'PENDING_QC';
    if (this.qcStatus === 'DISCARDED') return 'DISCARDED';
    if (this.isExpired) return 'EXPIRED';
    if (this.quantityOnHand <= 0) return 'DEPLETED';
    if (this.isExpiringSoon) return 'EXPIRING_SOON';
    return 'OK';
  }

  // Virtual: Total units consumed
  get quantityConsumed() {
    return Math.max(0, this.quantityReceived - this.quantityOnHand - this.quantityDefective);
  }

  // Format expiration display string
  formatExpiration() {
    const effectiveExp = this.effectiveExpirationDate;
    if (!effectiveExp) return 'No expiration set';
    const expDate = new Date(effectiveExp);
    const dateStr = expDate.toLocaleDateString();
    const isDueToOpenVial = this.isOpen && this.openVialExpiryDate && new Date(effectiveExp).getTime() === new Date(this.openVialExpiryDate).getTime();
    const prefix = isDueToOpenVial ? ' (Open-Vial)' : '';

    if (this.isExpired) return `❌ EXPIRED ${dateStr}${prefix}`;
    const days = this.daysUntilExpiration;
    if (days <= 0) return `❌ EXPIRED Today${prefix}`;
    if (days <= 7) return `🔴 ${days}d left (${dateStr})${prefix}`;
    if (days <= 30) return `🟡 ${days}d left (${dateStr})${prefix}`;
    return `✓ Valid until ${dateStr}${prefix}`;
  }
}

module.exports = InventoryBatch;
