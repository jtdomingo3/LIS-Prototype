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
