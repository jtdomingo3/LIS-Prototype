export interface InventoryItem {
    id: string;
    sku: string;
    name: string;
    description: string | null;
    category: string;
    item_mode: string;
    unit: string;
    package_size: string | null;
    min_threshold: number;
    critical_threshold: number;
    max_threshold: number | null;
    supplier: string | null;
    supplier_part_number: string | null;
    manufacturer: string | null;
    cost: number;
    storage_temp: string | null;
    location: string | null;
    area: string;
    requires_refrigeration: number;
    hazard_class: string | null;
    msds_url: string | null;
    open_vial_stability_days: number | null;
    barcode: string | null;
    target_roles: string[];
    is_active: number;
    notes: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
    total_stock?: number;
    batches?: InventoryBatch[];
    stock_status?: 'NORMAL' | 'LOW' | 'CRITICAL' | 'OUT_OF_STOCK';
}
export interface InventoryBatch {
    id: string;
    inventory_id: string;
    lot_number: string;
    initial_quantity: number;
    current_quantity: number;
    received_date: string | null;
    expiration_date: string | null;
    opened_date: string | null;
    opened_by: string | null;
    is_active: number;
    notes: string | null;
    created_at: string;
    updated_at: string;
}
export interface InventoryTransaction {
    id: string;
    inventory_id: string;
    batch_id: string | null;
    test_id: string | null;
    transaction_type: string;
    quantity: number;
    remaining_quantity: number | null;
    reference: string | null;
    notes: string | null;
    performed_by: string | null;
    created_at: string;
}
export declare const InventoryModel: {
    findAll(options?: {
        search?: string;
        category?: string;
        area?: string;
        is_active?: number;
    }): InventoryItem[];
    findById(id: string): InventoryItem | null;
    create(data: Partial<InventoryItem>): InventoryItem;
    update(id: string, data: Partial<InventoryItem>): InventoryItem | null;
    delete(id: string): boolean;
    addBatch(inventoryId: string, data: Partial<InventoryBatch>): InventoryBatch;
    updateBatch(batchId: string, data: Partial<InventoryBatch>): InventoryBatch | null;
    recordTransaction(data: {
        inventory_id: string;
        batch_id?: string | null;
        test_id?: string | null;
        transaction_type: string;
        quantity: number;
        reference?: string | null;
        notes?: string | null;
        performed_by?: string | null;
    }): InventoryTransaction;
    checkCriticalStock(): {
        hasCritical: boolean;
        items: {
            id: string;
            name: string;
            sku: string;
            area: string;
            location: string | null;
            unit: string;
            totalStock: number;
            criticalThreshold: number;
        }[];
    };
};
//# sourceMappingURL=Inventory.d.ts.map