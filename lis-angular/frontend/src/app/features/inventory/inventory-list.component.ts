import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InventoryService } from '../../core/services/inventory.service';
import { ToastService } from '../../shared/services/toast.service';
import { InventoryItem } from '../../core/models';

@Component({
  selector: 'app-inventory-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="inventory-page">
      <header class="page-header">
        <div class="header-title">
          <h1>📦 Reagent &amp; Laboratory Supply Inventory</h1>
          <p class="subtitle">ISO 15189 / CLSI GP44 Compliant Stock Tracking &amp; Expiration Management</p>
        </div>
        <div class="header-actions">
          <button type="button" class="btn btn-outline" (click)="loadCriticalAlerts()">
            ⚠️ Check Critical Stock
          </button>
          <button type="button" class="btn btn-primary" (click)="openNewItemModal()">
            <i class="fa fa-plus"></i> Add New Item
          </button>
        </div>
      </header>

      <!-- Filter Controls -->
      <section class="filters-card">
        <div class="search-box">
          <input type="text" class="form-control" [(ngModel)]="searchQuery" (input)="applyFilters()" placeholder="Search item name, REF / SKU, supplier..." />
        </div>
        <div class="filter-group">
          <select class="form-control" [(ngModel)]="selectedCategory" (change)="applyFilters()">
            <option value="">All Categories</option>
            <option value="Reagents">Reagents &amp; Test Kits</option>
            <option value="Controls">Controls &amp; Calibrators</option>
            <option value="Consumables">Tubes &amp; Consumables</option>
            <option value="Stains & Dyes">Stains &amp; Dyes</option>
            <option value="PPE">PPE &amp; General Supplies</option>
          </select>

          <select class="form-control" [(ngModel)]="selectedArea" (change)="applyFilters()">
            <option value="">All Departments</option>
            <option value="General Laboratory">General Laboratory</option>
            <option value="Clinical Chemistry">Clinical Chemistry</option>
            <option value="Hematology">Hematology</option>
            <option value="Clinical Microscopy">Clinical Microscopy</option>
            <option value="X-Ray & Imaging">X-Ray &amp; Imaging</option>
          </select>
        </div>
      </section>

      <!-- Inventory Table -->
      <div class="table-card">
        <div class="table-responsive">
          <table class="table">
            <thead>
              <tr>
                <th>REF / SKU</th>
                <th>Item Name</th>
                <th>Category</th>
                <th>Department / Area</th>
                <th>Storage Temp</th>
                <th>Current Stock</th>
                <th>Status</th>
                <th style="text-align: right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              @for (item of items(); track item.id) {
                <tr>
                  <td><code>{{ item.sku }}</code></td>
                  <td>
                    <strong>{{ item.name }}</strong>
                    @if (item.manufacturer) {
                      <div class="sub-text">{{ item.manufacturer }} &bull; {{ item.package_size || '' }}</div>
                    }
                  </td>
                  <td>{{ item.category }}</td>
                  <td>{{ item.area }}</td>
                  <td>
                    <span class="temp-badge" [class.cold]="item.requires_refrigeration">
                      {{ item.storage_temp || (item.requires_refrigeration ? '2-8°C Refrigerated' : '18-25°C Room Temp') }}
                    </span>
                  </td>
                  <td>
                    <div class="stock-qty">
                      <strong [class.danger]="(item.total_stock || 0) <= item.critical_threshold">
                        {{ item.total_stock || 0 }} {{ item.unit }}
                      </strong>
                    </div>
                    <div class="sub-text">Min: {{ item.min_threshold }} &bull; Crit: {{ item.critical_threshold }}</div>
                  </td>
                  <td>
                    <span class="status-pill" [ngClass]="statusPillClass(item.stock_status)">
                      {{ item.stock_status }}
                    </span>
                  </td>
                  <td style="text-align: right;">
                    <div class="btn-group">
                      <button type="button" class="btn btn-sm btn-outline" (click)="openReceiveModal(item)" title="Receive Batch">
                        <i class="fa fa-truck-loading"></i> Receive
                      </button>
                      <button type="button" class="btn btn-sm btn-outline-danger" (click)="openConsumeModal(item)" title="Record Usage">
                        <i class="fa fa-minus"></i> Deduct
                      </button>
                    </div>
                  </td>
                </tr>
              }
              @if (items().length === 0) {
                <tr>
                  <td colspan="8" class="empty-state">No inventory items matching your filters.</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      </div>

      <!-- RECEIVE BATCH MODAL -->
      @if (activeModal() === 'receive') {
        <div class="modal-backdrop">
          <div class="modal-dialog">
            <div class="modal-header">
              <h3>📦 Receive New Lot / Batch: {{ selectedItem()?.name }}</h3>
              <button type="button" class="close-btn" (click)="closeModal()">×</button>
            </div>
            <div class="modal-body">
              <div class="form-group">
                <label>Lot Number / Batch # <span class="required">*</span></label>
                <input type="text" class="form-control" [(ngModel)]="batchForm.lot_number" placeholder="e.g. LOT-2026-X99" />
              </div>
              <div class="grid-2">
                <div class="form-group">
                  <label>Quantity Received ({{ selectedItem()?.unit }}) <span class="required">*</span></label>
                  <input type="number" class="form-control" [(ngModel)]="batchForm.initial_quantity" placeholder="e.g. 50" />
                </div>
                <div class="form-group">
                  <label>Expiration Date</label>
                  <input type="date" class="form-control" [(ngModel)]="batchForm.expiration_date" />
                </div>
              </div>
              <div class="form-group">
                <label>Storage / Receipt Notes</label>
                <input type="text" class="form-control" [(ngModel)]="batchForm.notes" placeholder="Delivery notes, PO #, certificate of analysis" />
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline" (click)="closeModal()">Cancel</button>
              <button type="button" class="btn btn-primary" (click)="submitBatchReceipt()">Confirm Receipt</button>
            </div>
          </div>
        </div>
      }

      <!-- DEDUCT / CONSUME MODAL -->
      @if (activeModal() === 'consume') {
        <div class="modal-backdrop">
          <div class="modal-dialog">
            <div class="modal-header">
              <h3>🧪 Deduct / Consume Reagent: {{ selectedItem()?.name }}</h3>
              <button type="button" class="close-btn" (click)="closeModal()">×</button>
            </div>
            <div class="modal-body">
              <div class="stock-summary-banner">
                Available Stock: <strong>{{ selectedItem()?.total_stock || 0 }} {{ selectedItem()?.unit }}</strong>
              </div>
              <div class="form-group">
                <label>Quantity to Deduct <span class="required">*</span></label>
                <input type="number" class="form-control" [(ngModel)]="consumeForm.quantity" placeholder="Units used" />
              </div>
              <div class="form-group">
                <label>Reason / Purpose</label>
                <input type="text" class="form-control" [(ngModel)]="consumeForm.notes" placeholder="Routine daily tests, quality control, calibration run" />
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline" (click)="closeModal()">Cancel</button>
              <button type="button" class="btn btn-danger" (click)="submitDeduction()">Record Deduction</button>
            </div>
          </div>
        </div>
      }

      <!-- NEW ITEM MODAL -->
      @if (activeModal() === 'new_item') {
        <div class="modal-backdrop">
          <div class="modal-dialog modal-lg">
            <div class="modal-header">
              <h3>✨ Add New Inventory Reagent / Supply</h3>
              <button type="button" class="close-btn" (click)="closeModal()">×</button>
            </div>
            <div class="modal-body">
              <div class="grid-2">
                <div class="form-group">
                  <label>Item Name <span class="required">*</span></label>
                  <input type="text" class="form-control" [(ngModel)]="itemForm.name" placeholder="e.g. Glucose Hexokinase Reagent Kit" />
                </div>
                <div class="form-group">
                  <label>REF / Catalog SKU</label>
                  <input type="text" class="form-control" [(ngModel)]="itemForm.sku" placeholder="Auto-generated if blank" />
                </div>
              </div>
              <div class="grid-3">
                <div class="form-group">
                  <label>Category</label>
                  <select class="form-control" [(ngModel)]="itemForm.category">
                    <option value="Reagents">Reagents &amp; Test Kits</option>
                    <option value="Controls">Controls &amp; Calibrators</option>
                    <option value="Consumables">Tubes &amp; Supplies</option>
                    <option value="Stains & Dyes">Stains &amp; Dyes</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Department / Section</label>
                  <select class="form-control" [(ngModel)]="itemForm.area">
                    <option value="General Laboratory">General Laboratory</option>
                    <option value="Clinical Chemistry">Clinical Chemistry</option>
                    <option value="Hematology">Hematology</option>
                    <option value="Clinical Microscopy">Clinical Microscopy</option>
                    <option value="X-Ray & Imaging">X-Ray &amp; Imaging</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Unit of Measure</label>
                  <input type="text" class="form-control" [(ngModel)]="itemForm.unit" placeholder="tests, ml, kits, pcs" />
                </div>
              </div>
              <div class="grid-2">
                <div class="form-group">
                  <label>Reorder Level (Min Threshold)</label>
                  <input type="number" class="form-control" [(ngModel)]="itemForm.min_threshold" />
                </div>
                <div class="form-group">
                  <label>Critical Alert Level</label>
                  <input type="number" class="form-control" [(ngModel)]="itemForm.critical_threshold" />
                </div>
              </div>
              <div class="form-group">
                <label>Storage Temperature</label>
                <input type="text" class="form-control" [(ngModel)]="itemForm.storage_temp" placeholder="e.g. 2-8°C Refrigerated or 18-25°C Room Temp" />
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-outline" (click)="closeModal()">Cancel</button>
              <button type="button" class="btn btn-primary" (click)="submitNewItem()">Save Item</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .inventory-page {
      padding: 1.5rem;
      max-width: 1400px;
      margin: 0 auto;
      font-family: 'Inter', sans-serif;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
      flex-wrap: wrap;
      gap: 1rem;
    }

    .header-title h1 {
      font-size: 1.45rem;
      font-weight: 800;
      color: #0f172a;
      margin: 0;
    }

    .subtitle {
      font-size: 0.85rem;
      color: #64748b;
      margin-top: 0.25rem;
    }

    .header-actions {
      display: flex;
      gap: 0.75rem;
    }

    /* Filters */
    .filters-card {
      background: white;
      padding: 1rem 1.25rem;
      border-radius: 10px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.05);
      margin-bottom: 1.25rem;
      display: flex;
      gap: 1rem;
      flex-wrap: wrap;
    }

    .search-box {
      flex: 1;
      min-width: 260px;
    }

    .filter-group {
      display: flex;
      gap: 0.75rem;
    }

    /* Table */
    .table-card {
      background: white;
      border-radius: 12px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.06);
      border: 1px solid #e2e8f0;
      overflow: hidden;
    }

    .table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9rem;
    }

    .table th {
      background: #f8fafc;
      padding: 0.85rem 1rem;
      font-weight: 700;
      color: #475569;
      border-bottom: 2px solid #e2e8f0;
      text-align: left;
    }

    .table td {
      padding: 0.85rem 1rem;
      border-bottom: 1px solid #f1f5f9;
      vertical-align: middle;
    }

    .sub-text {
      font-size: 0.75rem;
      color: #64748b;
      margin-top: 2px;
    }

    .temp-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.75rem;
      background: #f1f5f9;
      color: #475569;
    }

    .temp-badge.cold {
      background: #e0f2fe;
      color: #0369a1;
      font-weight: 600;
    }

    .stock-qty {
      font-size: 1rem;
    }

    .stock-qty .danger {
      color: #dc2626;
      font-weight: 800;
    }

    .status-pill {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 700;
    }

    .pill-normal { background: #dcfce7; color: #15803d; }
    .pill-low { background: #fef3c7; color: #b45309; }
    .pill-critical { background: #fee2e2; color: #b91c1c; }
    .pill-out { background: #fecdd3; color: #991b1b; }

    .btn-group {
      display: inline-flex;
      gap: 0.35rem;
    }

    /* Buttons */
    .btn {
      padding: 0.6rem 1rem;
      border-radius: 6px;
      font-weight: 600;
      font-size: 0.85rem;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      border: none;
      transition: all 0.2s ease;
    }

    .btn-primary { background: #10b981; color: white; }
    .btn-primary:hover { background: #059669; }

    .btn-outline { background: white; border: 1px solid #cbd5e1; color: #334155; }
    .btn-outline:hover { background: #f8fafc; }

    .btn-outline-danger { background: white; border: 1px solid #ef4444; color: #ef4444; }
    .btn-outline-danger:hover { background: #fee2e2; }

    .btn-danger { background: #ef4444; color: white; }
    .btn-danger:hover { background: #dc2626; }

    .btn-sm {
      padding: 0.35rem 0.65rem;
      font-size: 0.75rem;
    }

    .form-control {
      padding: 0.6rem 0.85rem;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      font-size: 0.85rem;
      font-family: inherit;
      width: 100%;
      box-sizing: border-box;
    }

    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1rem; }
    .form-group { margin-bottom: 1rem; }
    .form-group label { display: block; font-size: 0.8rem; font-weight: 600; color: #475569; margin-bottom: 0.3rem; }

    /* Modal Backdrop */
    .modal-backdrop {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1050;
      backdrop-filter: blur(2px);
    }

    .modal-dialog {
      background: white;
      width: 100%;
      max-width: 520px;
      border-radius: 12px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.25);
      overflow: hidden;
    }

    .modal-lg { max-width: 720px; }

    .modal-header {
      padding: 1.25rem 1.5rem;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .modal-header h3 {
      font-size: 1.1rem;
      font-weight: 700;
      margin: 0;
      color: #0f172a;
    }

    .close-btn {
      background: none;
      border: none;
      font-size: 1.5rem;
      color: #64748b;
      cursor: pointer;
    }

    .modal-body {
      padding: 1.5rem;
    }

    .modal-footer {
      padding: 1rem 1.5rem;
      background: #f8fafc;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
    }

    .stock-summary-banner {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      padding: 0.75rem 1rem;
      border-radius: 6px;
      margin-bottom: 1rem;
      color: #1e40af;
      font-size: 0.9rem;
    }

    .empty-state {
      text-align: center;
      padding: 2.5rem;
      color: #94a3b8;
    }
  `]
})
export class InventoryListComponent implements OnInit {
  private invService = inject(InventoryService);
  private toast = inject(ToastService);

  items = signal<InventoryItem[]>([]);
  selectedItem = signal<InventoryItem | null>(null);
  activeModal = signal<'receive' | 'consume' | 'new_item' | null>(null);

  searchQuery = '';
  selectedCategory = '';
  selectedArea = '';

  batchForm = {
    lot_number: '',
    initial_quantity: 0,
    expiration_date: '',
    notes: '',
  };

  consumeForm = {
    quantity: 1,
    notes: 'Routine daily test usage',
  };

  itemForm: Partial<InventoryItem> = {
    name: '',
    sku: '',
    category: 'Reagents',
    area: 'General Laboratory',
    unit: 'tests',
    min_threshold: 5,
    critical_threshold: 2,
    storage_temp: '2-8°C Refrigerated',
  };

  ngOnInit(): void {
    this.loadInventory();
  }

  loadInventory(): void {
    this.invService.getAll({
      search: this.searchQuery,
      category: this.selectedCategory,
      area: this.selectedArea,
    }).subscribe({
      next: (res) => this.items.set(res),
      error: () => this.toast.error('Failed to load inventory')
    });
  }

  applyFilters(): void {
    this.loadInventory();
  }

  statusPillClass(status?: string): string {
    if (status === 'NORMAL') return 'pill-normal';
    if (status === 'LOW') return 'pill-low';
    if (status === 'CRITICAL') return 'pill-critical';
    if (status === 'OUT_OF_STOCK') return 'pill-out';
    return '';
  }

  openReceiveModal(item: InventoryItem): void {
    this.selectedItem.set(item);
    this.batchForm = {
      lot_number: `LOT-${Date.now().toString().slice(-4)}`,
      initial_quantity: 50,
      expiration_date: '',
      notes: '',
    };
    this.activeModal.set('receive');
  }

  openConsumeModal(item: InventoryItem): void {
    this.selectedItem.set(item);
    this.consumeForm = {
      quantity: 1,
      notes: 'Test run consumption',
    };
    this.activeModal.set('consume');
  }

  openNewItemModal(): void {
    this.itemForm = {
      name: '',
      sku: `SKU-${Date.now().toString().slice(-6)}`,
      category: 'Reagents',
      area: 'General Laboratory',
      unit: 'tests',
      min_threshold: 5,
      critical_threshold: 2,
      storage_temp: '2-8°C Refrigerated',
    };
    this.activeModal.set('new_item');
  }

  closeModal(): void {
    this.activeModal.set(null);
    this.selectedItem.set(null);
  }

  submitBatchReceipt(): void {
    const item = this.selectedItem();
    if (!item) return;

    this.invService.addBatch(item.id, this.batchForm).subscribe({
      next: () => {
        this.toast.success(`Received ${this.batchForm.initial_quantity} ${item.unit} for ${item.name}`);
        this.closeModal();
        this.loadInventory();
      },
      error: (err) => this.toast.error(err?.error?.error || 'Failed to record batch')
    });
  }

  submitDeduction(): void {
    const item = this.selectedItem();
    if (!item) return;

    this.invService.consume(item.id, this.consumeForm).subscribe({
      next: () => {
        this.toast.success(`Deducted ${this.consumeForm.quantity} ${item.unit}`);
        this.closeModal();
        this.loadInventory();
      },
      error: (err) => this.toast.error(err?.error?.error || 'Failed to deduct stock')
    });
  }

  submitNewItem(): void {
    if (!this.itemForm.name?.trim()) {
      this.toast.error('Item name is required');
      return;
    }

    this.invService.create(this.itemForm).subscribe({
      next: () => {
        this.toast.success('Inventory item created');
        this.closeModal();
        this.loadInventory();
      },
      error: (err) => this.toast.error(err?.error?.error || 'Failed to create item')
    });
  }

  loadCriticalAlerts(): void {
    this.invService.checkCriticalStock().subscribe({
      next: (res) => {
        if (!res.hasCritical) {
          this.toast.success('All inventory stock is currently at safe operating levels.');
        } else {
          this.toast.warning(`⚠️ Attention: ${res.items.length} items are at or below critical thresholds!`);
        }
      }
    });
  }
}
