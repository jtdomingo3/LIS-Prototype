import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { InventoryModel } from '../models/Inventory';
import { getDb } from '../db/connection';

const router = Router();

// Critical stock check (for global banner / modal check)
router.get('/critical-check', requireAuth, (_req: Request, res: Response) => {
  try {
    const result = InventoryModel.checkCriticalStock();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// List inventory items
router.get('/', requireAuth, (req: Request, res: Response) => {
  try {
    const { search, category, area, is_active } = req.query;
    const items = InventoryModel.findAll({
      search: search as string,
      category: category as string,
      area: area as string,
      is_active: is_active !== undefined ? parseInt(is_active as string, 10) : undefined,
    });
    res.json(items);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Export inventory CSV
router.get('/export', requireAuth, (_req: Request, res: Response) => {
  try {
    const csv = InventoryModel.exportCsv();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="laboratory-inventory-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to export inventory CSV' });
  }
});

// Regulatory & Expiration Alerts
router.get('/alerts', requireAuth, (_req: Request, res: Response) => {
  try {
    const alerts = InventoryModel.getAlerts();
    res.json(alerts);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get inventory item by ID
router.get('/:id', requireAuth, (req: Request, res: Response) => {
  try {
    const item = InventoryModel.findById(req.params.id);
    if (!item) {
      res.status(404).json({ error: 'Inventory item not found' });
      return;
    }
    const db = getDb();
    const transactions = db.prepare('SELECT * FROM inventory_transactions WHERE inventory_id = ? ORDER BY created_at DESC LIMIT 50').all(item.id);
    res.json({ ...item, transactions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Create inventory item
router.post('/', requireAuth, (req: Request, res: Response) => {
  try {
    const createdBy = req.user ? req.user.email : 'System';
    const item = InventoryModel.create({
      ...req.body,
      created_by: createdBy,
    });
    res.status(201).json(item);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update inventory item
router.put('/:id', requireAuth, (req: Request, res: Response) => {
  try {
    const updated = InventoryModel.update(req.params.id, req.body);
    if (!updated) {
      res.status(404).json({ error: 'Inventory item not found' });
      return;
    }
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete inventory item
router.delete('/:id', requireAuth, (req: Request, res: Response) => {
  try {
    const ok = InventoryModel.delete(req.params.id);
    if (!ok) {
      res.status(404).json({ error: 'Inventory item not found' });
      return;
    }
    res.json({ message: 'Item deleted' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Add batch to inventory item
router.post('/:id/batches', requireAuth, (req: Request, res: Response) => {
  try {
    const item = InventoryModel.findById(req.params.id);
    if (!item) {
      res.status(404).json({ error: 'Inventory item not found' });
      return;
    }
    const batch = InventoryModel.addBatch(item.id, req.body);
    res.status(201).json(batch);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /:id/batch (alias for /:id/batches)
router.post('/:id/batch', requireAuth, (req: Request, res: Response) => {
  try {
    const item = InventoryModel.findById(req.params.id);
    if (!item) {
      res.status(404).json({ error: 'Inventory item not found' });
      return;
    }
    const batch = InventoryModel.addBatch(item.id, req.body);
    res.status(201).json(batch);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get batches for an inventory item
router.get('/:id/batches', requireAuth, (req: Request, res: Response) => {
  try {
    const batches = InventoryModel.findBatchesByInventoryId(req.params.id);
    res.json(batches);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Get transactions for an inventory item
router.get('/:id/transactions', requireAuth, (req: Request, res: Response) => {
  try {
    const db = getDb();
    const transactions = db.prepare(
      'SELECT * FROM inventory_transactions WHERE inventory_id = ? ORDER BY created_at DESC LIMIT 100'
    ).all(req.params.id);
    res.json(transactions);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /:id/batch/:batchId/open - Open vial/batch
router.post('/:id/batch/:batchId/open', requireAuth, (req: Request, res: Response) => {
  try {
    const item = InventoryModel.findById(req.params.id);
    const batch = InventoryModel.findBatchById(req.params.batchId);
    if (!item || !batch) {
      return res.status(404).json({ error: 'Item or batch not found' });
    }

    if (batch.opened_date) {
      return res.status(400).json({ error: 'This batch/vial has already been marked as opened.' });
    }

    const openDate = req.body.dateOpened ? new Date(req.body.dateOpened) : new Date();
    const stabilityDays = item.open_vial_stability_days || 30;
    const openVialExpiry = new Date(openDate.getTime() + stabilityDays * 24 * 60 * 60 * 1000);
    const user = req.user ? req.user.email : 'System';

    const updated = InventoryModel.updateBatch(batch.id, {
      opened_date: openDate.toISOString(),
      opened_by: user,
      open_vial_expiry_date: openVialExpiry.toISOString(),
    });

    InventoryModel.recordTransaction({
      inventory_id: item.id,
      batch_id: batch.id,
      transaction_type: 'OPEN_VIAL',
      quantity: 0,
      reference: batch.lot_number,
      reason: req.body.reason || `Opened for active testing (In-use stability: ${stabilityDays} days)`,
      notes: `Open-vial expiry set to ${openVialExpiry.toLocaleDateString()}`,
      performed_by: user,
    } as any);

    res.json({
      success: true,
      message: `Lot ${batch.lot_number} marked as OPEN. Open-vial expiry: ${openVialExpiry.toLocaleDateString()}`,
      batch: updated,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /:id/batch/:batchId/qc - Update QC verification status
router.post('/:id/batch/:batchId/qc', requireAuth, (req: Request, res: Response) => {
  try {
    const item = InventoryModel.findById(req.params.id);
    const batch = InventoryModel.findBatchById(req.params.batchId);
    if (!item || !batch) {
      return res.status(404).json({ error: 'Item or batch not found' });
    }

    const { qcStatus, notes } = req.body;
    if (!qcStatus) {
      return res.status(400).json({ error: 'QC Status is required' });
    }

    const prevStatus = batch.qc_status || 'PENDING';
    const user = req.user ? req.user.email : 'System';
    const nowIso = new Date().toISOString();

    const updated = InventoryModel.updateBatch(batch.id, {
      qc_status: qcStatus,
      qc_verified_by: user,
      qc_verified_date: nowIso,
    });

    InventoryModel.recordTransaction({
      inventory_id: item.id,
      batch_id: batch.id,
      transaction_type: 'QC_USAGE',
      quantity: 0,
      reference: batch.lot_number,
      reason: `QC Status changed from ${prevStatus} to ${qcStatus}`,
      notes: notes || '',
      performed_by: user,
    } as any);

    res.json({
      success: true,
      message: `Lot ${batch.lot_number} QC status updated to ${qcStatus}.`,
      batch: updated,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /:id/batch/:batchId/adjust - Stock count adjustment
router.post('/:id/batch/:batchId/adjust', requireAuth, (req: Request, res: Response) => {
  try {
    const item = InventoryModel.findById(req.params.id);
    const batch = InventoryModel.findBatchById(req.params.batchId);
    if (!item || !batch) {
      return res.status(404).json({ error: 'Item or batch not found' });
    }

    const { newQuantity, reason, notes } = req.body;
    if (newQuantity === undefined || isNaN(newQuantity) || parseInt(newQuantity, 10) < 0) {
      return res.status(400).json({ error: 'Valid non-negative new quantity is required' });
    }

    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'An audit reason for stock adjustment is required by ISO 15189 standards' });
    }

    const targetQty = Number(newQuantity);
    const qtyBefore = Number(batch.current_quantity);
    const diff = targetQty - qtyBefore;
    const user = req.user ? req.user.email : 'System';

    const updated = InventoryModel.updateBatch(batch.id, {
      current_quantity: targetQty,
    });

    InventoryModel.recordTransaction({
      inventory_id: item.id,
      batch_id: batch.id,
      transaction_type: 'ADJUST',
      quantity: diff,
      reference: batch.lot_number,
      reason: reason.trim(),
      notes: notes || '',
      performed_by: user,
    } as any);

    res.json({
      success: true,
      message: `Stock for Lot ${batch.lot_number} adjusted from ${qtyBefore} to ${targetQty} ${item.unit}.`,
      batch: updated,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /:id/batch/:batchId/discard - Discard / waste removal
router.post('/:id/batch/:batchId/discard', requireAuth, (req: Request, res: Response) => {
  try {
    const item = InventoryModel.findById(req.params.id);
    const batch = InventoryModel.findBatchById(req.params.batchId);
    if (!item || !batch) {
      return res.status(404).json({ error: 'Item or batch not found' });
    }

    const { discardQuantity, reason, notes } = req.body;
    const qtyToDiscard = Number(discardQuantity);

    if (!qtyToDiscard || qtyToDiscard <= 0) {
      return res.status(400).json({ error: 'Discard quantity must be greater than 0' });
    }

    if (batch.current_quantity < qtyToDiscard) {
      return res.status(400).json({ error: `Cannot discard ${qtyToDiscard}. Only ${batch.current_quantity} units available in lot.` });
    }

    const qtyBefore = Number(batch.current_quantity);
    const qtyAfter = qtyBefore - qtyToDiscard;
    const user = req.user ? req.user.email : 'System';

    const updateData: any = {
      current_quantity: qtyAfter,
    };
    if (qtyAfter === 0) {
      updateData.qc_status = 'DISCARDED';
    }

    const updated = InventoryModel.updateBatch(batch.id, updateData);

    InventoryModel.recordTransaction({
      inventory_id: item.id,
      batch_id: batch.id,
      transaction_type: 'DISCARD',
      quantity: qtyToDiscard,
      reference: batch.lot_number,
      reason: reason || 'Biohazard discard / Expired / Damaged',
      notes: notes || '',
      performed_by: user,
    } as any);

    res.json({
      success: true,
      message: `Discarded ${qtyToDiscard} ${item.unit} from Lot ${batch.lot_number}. Remaining: ${qtyAfter}`,
      batch: updated,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete batch
const handleDeleteBatch = (req: Request, res: Response) => {
  try {
    const batch = InventoryModel.findBatchById(req.params.batchId);
    if (!batch) {
      return res.status(404).json({ error: 'Batch not found' });
    }

    const ok = InventoryModel.deleteBatch(req.params.batchId);
    if (!ok) {
      return res.status(500).json({ error: 'Failed to delete batch' });
    }

    res.json({ success: true, message: `Batch Lot ${batch.lot_number} deleted successfully.` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};
router.delete('/:id/batch/:batchId', requireAuth, handleDeleteBatch);
router.post('/:id/batch/:batchId/delete', requireAuth, handleDeleteBatch);

// Update batch
router.put('/batches/:batchId', requireAuth, (req: Request, res: Response) => {
  try {
    const updated = InventoryModel.updateBatch(req.params.batchId, req.body);
    if (!updated) {
      res.status(404).json({ error: 'Batch not found' });
      return;
    }
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Consume / deduct quantity
router.post('/:id/consume', requireAuth, (req: Request, res: Response) => {
  try {
    const { quantity, batch_id, test_id, notes } = req.body;
    const qtyToDeduct = Number(quantity);
    if (!qtyToDeduct || qtyToDeduct <= 0) {
      res.status(400).json({ error: 'Invalid deduction quantity' });
      return;
    }

    const item = InventoryModel.findById(req.params.id);
    if (!item) {
      res.status(404).json({ error: 'Inventory item not found' });
      return;
    }

    const db = getDb();
    let targetBatchId = batch_id;

    if (!targetBatchId) {
      // Pick first active batch with available stock (FIFO)
      const firstBatch = db.prepare('SELECT * FROM inventory_batches WHERE inventory_id = ? AND is_active = 1 AND current_quantity > 0 ORDER BY expiration_date ASC, created_at ASC LIMIT 1').get(item.id) as any;
      if (firstBatch) targetBatchId = firstBatch.id;
    }

    if (targetBatchId) {
      db.prepare('UPDATE inventory_batches SET current_quantity = MAX(0, current_quantity - ?), updated_at = datetime("now") WHERE id = ?').run(qtyToDeduct, targetBatchId);
    }

    // Record transaction
    const performedBy = req.user ? req.user.email : 'System';
    const tx = InventoryModel.recordTransaction({
      inventory_id: item.id,
      batch_id: targetBatchId,
      test_id: test_id || null,
      transaction_type: 'CONSUMED',
      quantity: qtyToDeduct,
      notes: notes || 'Test Execution / Usage',
      performed_by: performedBy,
    });

    const refreshed = InventoryModel.findById(item.id);
    res.json({ message: 'Deduction recorded', transaction: tx, item: refreshed });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
