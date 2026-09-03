const { v4: uuidv4 } = require('uuid');

/**
 * InventoryTransaction Model
 * Immutable regulatory audit trail for all laboratory inventory movements:
 * - RECEIVE: Stock receipt & initial registration
 * - CONSUME: Routine test analysis consumption
 * - OPEN_VIAL: Vial unsealed / put into active service (triggers in-use stability)
 * - QC_USAGE: Quality Control run, calibration, or instrument maintenance
 * - ADJUST: Physical inventory count correction (requires documented reason)
 * - DISCARD: Expired, contaminated, or compromised stock removal
 * - RETURN: Vendor return
 * - MOVE: Relocation between laboratory storage units
 */
class InventoryTransaction {
  constructor(data = {}) {
    this.id = data.id || uuidv4();
    this.inventoryId = data.inventoryId || ''; // Reference to Inventory item
    this.batchId = data.batchId || null; // Reference to specific InventoryBatch
    this.lotNumber = data.lotNumber || '';
    this.transactionType = data.transactionType || 'RECEIVE'; // RECEIVE, CONSUME, OPEN_VIAL, QC_USAGE, ADJUST, DISCARD, RETURN, MOVE
    this.quantity = Number.isFinite(Number(data.quantity)) ? Number(data.quantity) : 0;
    this.quantityBefore = Number.isFinite(Number(data.quantityBefore)) ? Number(data.quantityBefore) : 0;
    this.quantityAfter = Number.isFinite(Number(data.quantityAfter)) ? Number(data.quantityAfter) : 0;
    this.reason = data.reason || ''; // Clinical reason or calibration/adjustment justification
    this.testId = data.testId || null; // Associated patient test ID if applicable
    this.locationFrom = data.locationFrom || ''; // For MOVE transactions
    this.locationTo = data.locationTo || ''; // For MOVE transactions
    this.notes = data.notes || '';
    this.performedBy = data.performedBy || 'System'; // User who performed the action
    this.createdAt = data.createdAt ? new Date(data.createdAt).toISOString() : new Date().toISOString();
  }

  // Virtual: Formatted descriptive text
  get displayText() {
    const typeLabel = {
      'RECEIVE': '📥 Received Stock',
      'CONSUME': '📉 Used in Test',
      'OPEN_VIAL': '🔓 Opened for Testing',
      'QC_USAGE': '🧪 QC / Calibration Usage',
      'ADJUST': '⚖️ Stock Adjustment',
      'DISCARD': '🗑️ Discarded / Biohazard Waste',
      'RETURN': '↩️ Returned to Supplier',
      'MOVE': '📍 Relocated'
    };
    
    const label = typeLabel[this.transactionType] || this.transactionType;
    const qtySign = this.quantityImpact > 0 ? `+${this.quantity}` : (this.quantityImpact < 0 ? `-${Math.abs(this.quantity)}` : `${this.quantity}`);
    const lotInfo = this.lotNumber ? ` [Lot ${this.lotNumber}]` : '';
    const reasonInfo = this.reason ? ` - ${this.reason}` : '';
    return `${label}${lotInfo} (${qtySign} units)${reasonInfo}`;
  }

  // Virtual: Impact on inventory level
  get quantityImpact() {
    if (['RECEIVE', 'RETURN_IN'].includes(this.transactionType)) return Math.abs(this.quantity);
    if (['CONSUME', 'QC_USAGE', 'DISCARD', 'RETURN'].includes(this.transactionType)) return -Math.abs(this.quantity);
    if (this.transactionType === 'ADJUST') return this.quantity; // Adjust can be positive or negative
    return 0; // OPEN_VIAL or MOVE has 0 net quantity change
  }

  // Format timestamp for UI display
  formatTimestamp() {
    return new Date(this.createdAt).toLocaleString();
  }
}

module.exports = InventoryTransaction;
