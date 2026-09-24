"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InventoryModel = void 0;
const connection_1 = require("../db/connection");
const uuid_1 = require("uuid");
function rowToItem(row) {
    let roles = [];
    try {
        roles = JSON.parse(row.target_roles || '[]');
    }
    catch {
        roles = [];
    }
    return {
        ...row,
        target_roles: roles,
    };
}
exports.InventoryModel = {
    findAll(options = {}) {
        const db = (0, connection_1.getDb)();
        const where = [];
        const params = [];
        if (options.is_active !== undefined) {
            where.push('is_active = ?');
            params.push(options.is_active);
        }
        if (options.category) {
            where.push('category = ?');
            params.push(options.category);
        }
        if (options.area) {
            where.push('area = ?');
            params.push(options.area);
        }
        if (options.search) {
            where.push('(name LIKE ? OR sku LIKE ? OR supplier LIKE ?)');
            const q = `%${options.search}%`;
            params.push(q, q, q);
        }
        const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
        const rows = db.prepare(`SELECT * FROM inventory ${whereClause} ORDER BY name ASC`).all(...params);
        // Attach total stock and stock status for each item
        return rows.map(r => {
            const item = rowToItem(r);
            const stockRow = db.prepare('SELECT COALESCE(SUM(current_quantity), 0) as total FROM inventory_batches WHERE inventory_id = ? AND is_active = 1').get(item.id);
            item.total_stock = stockRow.total;
            if (item.total_stock <= 0) {
                item.stock_status = 'OUT_OF_STOCK';
            }
            else if (item.total_stock <= item.critical_threshold) {
                item.stock_status = 'CRITICAL';
            }
            else if (item.total_stock <= item.min_threshold) {
                item.stock_status = 'LOW';
            }
            else {
                item.stock_status = 'NORMAL';
            }
            return item;
        });
    },
    findById(id) {
        const db = (0, connection_1.getDb)();
        const row = db.prepare('SELECT * FROM inventory WHERE id = ?').get(id);
        if (!row)
            return null;
        const item = rowToItem(row);
        const batches = db.prepare('SELECT * FROM inventory_batches WHERE inventory_id = ? ORDER BY expiration_date ASC, created_at ASC').all(id);
        item.batches = batches;
        item.total_stock = batches.filter(b => b.is_active === 1).reduce((sum, b) => sum + (b.current_quantity || 0), 0);
        if (item.total_stock <= 0) {
            item.stock_status = 'OUT_OF_STOCK';
        }
        else if (item.total_stock <= item.critical_threshold) {
            item.stock_status = 'CRITICAL';
        }
        else if (item.total_stock <= item.min_threshold) {
            item.stock_status = 'LOW';
        }
        else {
            item.stock_status = 'NORMAL';
        }
        return item;
    },
    create(data) {
        const db = (0, connection_1.getDb)();
        const id = data.id || (0, uuid_1.v4)();
        const sku = data.sku || `SKU-${Date.now().toString().slice(-6)}`;
        const now = new Date().toISOString();
        db.prepare(`
      INSERT INTO inventory (
        id, sku, name, description, category, item_mode, unit, package_size,
        min_threshold, critical_threshold, max_threshold, supplier,
        supplier_part_number, manufacturer, cost, storage_temp, location,
        area, requires_refrigeration, hazard_class, msds_url,
        open_vial_stability_days, barcode, target_roles, is_active, notes,
        created_by, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?
      )
    `).run(id, sku, data.name || 'Unnamed Item', data.description || null, data.category || 'Reagents', data.item_mode || 'reagent', data.unit || 'tests', data.package_size || null, data.min_threshold ?? 5, data.critical_threshold ?? 2, data.max_threshold || null, data.supplier || null, data.supplier_part_number || null, data.manufacturer || null, data.cost || 0, data.storage_temp || null, data.location || null, data.area || 'General Laboratory', data.requires_refrigeration ? 1 : 0, data.hazard_class || 'Non-Hazardous', data.msds_url || null, data.open_vial_stability_days || null, data.barcode || null, JSON.stringify(data.target_roles || []), data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1, data.notes || null, data.created_by || 'System', now, now);
        return this.findById(id);
    },
    update(id, data) {
        const db = (0, connection_1.getDb)();
        const fields = [];
        const values = [];
        const now = new Date().toISOString();
        if (data.name !== undefined) {
            fields.push('name = ?');
            values.push(data.name);
        }
        if (data.description !== undefined) {
            fields.push('description = ?');
            values.push(data.description);
        }
        if (data.category !== undefined) {
            fields.push('category = ?');
            values.push(data.category);
        }
        if (data.item_mode !== undefined) {
            fields.push('item_mode = ?');
            values.push(data.item_mode);
        }
        if (data.unit !== undefined) {
            fields.push('unit = ?');
            values.push(data.unit);
        }
        if (data.package_size !== undefined) {
            fields.push('package_size = ?');
            values.push(data.package_size);
        }
        if (data.min_threshold !== undefined) {
            fields.push('min_threshold = ?');
            values.push(data.min_threshold);
        }
        if (data.critical_threshold !== undefined) {
            fields.push('critical_threshold = ?');
            values.push(data.critical_threshold);
        }
        if (data.max_threshold !== undefined) {
            fields.push('max_threshold = ?');
            values.push(data.max_threshold);
        }
        if (data.supplier !== undefined) {
            fields.push('supplier = ?');
            values.push(data.supplier);
        }
        if (data.supplier_part_number !== undefined) {
            fields.push('supplier_part_number = ?');
            values.push(data.supplier_part_number);
        }
        if (data.manufacturer !== undefined) {
            fields.push('manufacturer = ?');
            values.push(data.manufacturer);
        }
        if (data.cost !== undefined) {
            fields.push('cost = ?');
            values.push(data.cost);
        }
        if (data.storage_temp !== undefined) {
            fields.push('storage_temp = ?');
            values.push(data.storage_temp);
        }
        if (data.location !== undefined) {
            fields.push('location = ?');
            values.push(data.location);
        }
        if (data.area !== undefined) {
            fields.push('area = ?');
            values.push(data.area);
        }
        if (data.requires_refrigeration !== undefined) {
            fields.push('requires_refrigeration = ?');
            values.push(data.requires_refrigeration ? 1 : 0);
        }
        if (data.hazard_class !== undefined) {
            fields.push('hazard_class = ?');
            values.push(data.hazard_class);
        }
        if (data.msds_url !== undefined) {
            fields.push('msds_url = ?');
            values.push(data.msds_url);
        }
        if (data.open_vial_stability_days !== undefined) {
            fields.push('open_vial_stability_days = ?');
            values.push(data.open_vial_stability_days);
        }
        if (data.barcode !== undefined) {
            fields.push('barcode = ?');
            values.push(data.barcode);
        }
        if (data.target_roles !== undefined) {
            fields.push('target_roles = ?');
            values.push(JSON.stringify(data.target_roles));
        }
        if (data.is_active !== undefined) {
            fields.push('is_active = ?');
            values.push(data.is_active ? 1 : 0);
        }
        if (data.notes !== undefined) {
            fields.push('notes = ?');
            values.push(data.notes);
        }
        fields.push('updated_at = ?');
        values.push(now);
        values.push(id);
        db.prepare(`UPDATE inventory SET ${fields.join(', ')} WHERE id = ?`).run(...values);
        return this.findById(id);
    },
    delete(id) {
        const db = (0, connection_1.getDb)();
        const result = db.prepare('DELETE FROM inventory WHERE id = ?').run(id);
        return result.changes > 0;
    },
    // Batch operations
    addBatch(inventoryId, data) {
        const db = (0, connection_1.getDb)();
        const id = data.id || (0, uuid_1.v4)();
        const now = new Date().toISOString();
        const initialQty = Number(data.initial_quantity || 0);
        db.prepare(`
      INSERT INTO inventory_batches (
        id, inventory_id, lot_number, initial_quantity, current_quantity,
        received_date, expiration_date, opened_date, opened_by, is_active, notes,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `).run(id, inventoryId, data.lot_number || `LOT-${Date.now().toString().slice(-4)}`, initialQty, data.current_quantity !== undefined ? Number(data.current_quantity) : initialQty, data.received_date || now, data.expiration_date || null, data.opened_date || null, data.opened_by || null, data.notes || null, now, now);
        // Record transaction
        this.recordTransaction({
            inventory_id: inventoryId,
            batch_id: id,
            transaction_type: 'RECEIVED',
            quantity: initialQty,
            reference: 'Initial Stock / Batch Receipt',
            notes: `Lot ${data.lot_number || ''}`,
        });
        return db.prepare('SELECT * FROM inventory_batches WHERE id = ?').get(id);
    },
    updateBatch(batchId, data) {
        const db = (0, connection_1.getDb)();
        const fields = [];
        const values = [];
        const now = new Date().toISOString();
        if (data.lot_number !== undefined) {
            fields.push('lot_number = ?');
            values.push(data.lot_number);
        }
        if (data.current_quantity !== undefined) {
            fields.push('current_quantity = ?');
            values.push(Number(data.current_quantity));
        }
        if (data.expiration_date !== undefined) {
            fields.push('expiration_date = ?');
            values.push(data.expiration_date);
        }
        if (data.opened_date !== undefined) {
            fields.push('opened_date = ?');
            values.push(data.opened_date);
        }
        if (data.opened_by !== undefined) {
            fields.push('opened_by = ?');
            values.push(data.opened_by);
        }
        if (data.is_active !== undefined) {
            fields.push('is_active = ?');
            values.push(data.is_active ? 1 : 0);
        }
        if (data.notes !== undefined) {
            fields.push('notes = ?');
            values.push(data.notes);
        }
        fields.push('updated_at = ?');
        values.push(now);
        values.push(batchId);
        db.prepare(`UPDATE inventory_batches SET ${fields.join(', ')} WHERE id = ?`).run(...values);
        return db.prepare('SELECT * FROM inventory_batches WHERE id = ?').get(batchId);
    },
    // Record audit transaction
    recordTransaction(data) {
        const db = (0, connection_1.getDb)();
        const id = (0, uuid_1.v4)();
        const now = new Date().toISOString();
        // Check remaining total stock
        const stockRow = db.prepare('SELECT COALESCE(SUM(current_quantity), 0) as total FROM inventory_batches WHERE inventory_id = ? AND is_active = 1').get(data.inventory_id);
        db.prepare(`
      INSERT INTO inventory_transactions (
        id, inventory_id, batch_id, test_id, transaction_type, quantity,
        remaining_quantity, reference, notes, performed_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, data.inventory_id, data.batch_id || null, data.test_id || null, data.transaction_type, data.quantity, stockRow.total, data.reference || null, data.notes || null, data.performed_by || 'System', now);
        return db.prepare('SELECT * FROM inventory_transactions WHERE id = ?').get(id);
    },
    // Critical stock check (for global banner / modal)
    checkCriticalStock() {
        const db = (0, connection_1.getDb)();
        const query = `
      SELECT i.id, i.name, i.sku, i.area, i.location, i.unit, i.critical_threshold,
             COALESCE(SUM(b.current_quantity), 0) as totalStock
      FROM inventory i
      LEFT JOIN inventory_batches b ON i.id = b.inventory_id AND b.is_active = 1
      WHERE i.is_active = 1
      GROUP BY i.id
      HAVING totalStock <= i.critical_threshold
      ORDER BY totalStock ASC
    `;
        const rows = db.prepare(query).all();
        return {
            hasCritical: rows.length > 0,
            items: rows.map(r => ({
                id: r.id,
                name: r.name,
                sku: r.sku,
                area: r.area,
                location: r.location,
                unit: r.unit,
                totalStock: Number(r.totalStock),
                criticalThreshold: Number(r.critical_threshold),
            })),
        };
    }
};
//# sourceMappingURL=Inventory.js.map