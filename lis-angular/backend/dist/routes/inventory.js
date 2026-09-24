"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const Inventory_1 = require("../models/Inventory");
const connection_1 = require("../db/connection");
const router = (0, express_1.Router)();
// Critical stock check (for global banner / modal check)
router.get('/critical-check', auth_1.requireAuth, (_req, res) => {
    try {
        const result = Inventory_1.InventoryModel.checkCriticalStock();
        res.json(result);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// List inventory items
router.get('/', auth_1.requireAuth, (req, res) => {
    try {
        const { search, category, area, is_active } = req.query;
        const items = Inventory_1.InventoryModel.findAll({
            search: search,
            category: category,
            area: area,
            is_active: is_active !== undefined ? parseInt(is_active, 10) : undefined,
        });
        res.json(items);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Get inventory item by ID
router.get('/:id', auth_1.requireAuth, (req, res) => {
    try {
        const item = Inventory_1.InventoryModel.findById(req.params.id);
        if (!item) {
            res.status(404).json({ error: 'Inventory item not found' });
            return;
        }
        const db = (0, connection_1.getDb)();
        const transactions = db.prepare('SELECT * FROM inventory_transactions WHERE inventory_id = ? ORDER BY created_at DESC LIMIT 50').all(item.id);
        res.json({ ...item, transactions });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Create inventory item
router.post('/', auth_1.requireAuth, (req, res) => {
    try {
        const createdBy = req.user ? req.user.email : 'System';
        const item = Inventory_1.InventoryModel.create({
            ...req.body,
            created_by: createdBy,
        });
        res.status(201).json(item);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Update inventory item
router.put('/:id', auth_1.requireAuth, (req, res) => {
    try {
        const updated = Inventory_1.InventoryModel.update(req.params.id, req.body);
        if (!updated) {
            res.status(404).json({ error: 'Inventory item not found' });
            return;
        }
        res.json(updated);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Delete inventory item
router.delete('/:id', auth_1.requireAuth, (req, res) => {
    try {
        const ok = Inventory_1.InventoryModel.delete(req.params.id);
        if (!ok) {
            res.status(404).json({ error: 'Inventory item not found' });
            return;
        }
        res.json({ message: 'Item deleted' });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Add batch to inventory item
router.post('/:id/batches', auth_1.requireAuth, (req, res) => {
    try {
        const item = Inventory_1.InventoryModel.findById(req.params.id);
        if (!item) {
            res.status(404).json({ error: 'Inventory item not found' });
            return;
        }
        const batch = Inventory_1.InventoryModel.addBatch(item.id, req.body);
        res.status(201).json(batch);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Update batch
router.put('/batches/:batchId', auth_1.requireAuth, (req, res) => {
    try {
        const updated = Inventory_1.InventoryModel.updateBatch(req.params.batchId, req.body);
        if (!updated) {
            res.status(404).json({ error: 'Batch not found' });
            return;
        }
        res.json(updated);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// Consume / deduct quantity
router.post('/:id/consume', auth_1.requireAuth, (req, res) => {
    try {
        const { quantity, batch_id, test_id, notes } = req.body;
        const qtyToDeduct = Number(quantity);
        if (!qtyToDeduct || qtyToDeduct <= 0) {
            res.status(400).json({ error: 'Invalid deduction quantity' });
            return;
        }
        const item = Inventory_1.InventoryModel.findById(req.params.id);
        if (!item) {
            res.status(404).json({ error: 'Inventory item not found' });
            return;
        }
        const db = (0, connection_1.getDb)();
        let targetBatchId = batch_id;
        if (!targetBatchId) {
            // Pick first active batch with available stock (FIFO)
            const firstBatch = db.prepare('SELECT * FROM inventory_batches WHERE inventory_id = ? AND is_active = 1 AND current_quantity > 0 ORDER BY expiration_date ASC, created_at ASC LIMIT 1').get(item.id);
            if (firstBatch)
                targetBatchId = firstBatch.id;
        }
        if (targetBatchId) {
            db.prepare('UPDATE inventory_batches SET current_quantity = MAX(0, current_quantity - ?), updated_at = datetime("now") WHERE id = ?').run(qtyToDeduct, targetBatchId);
        }
        // Record transaction
        const performedBy = req.user ? req.user.email : 'System';
        const tx = Inventory_1.InventoryModel.recordTransaction({
            inventory_id: item.id,
            batch_id: targetBatchId,
            test_id: test_id || null,
            transaction_type: 'CONSUMED',
            quantity: qtyToDeduct,
            notes: notes || 'Test Execution / Usage',
            performed_by: performedBy,
        });
        const refreshed = Inventory_1.InventoryModel.findById(item.id);
        res.json({ message: 'Deduction recorded', transaction: tx, item: refreshed });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
});
exports.default = router;
//# sourceMappingURL=inventory.js.map