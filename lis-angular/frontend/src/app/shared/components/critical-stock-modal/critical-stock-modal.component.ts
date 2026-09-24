import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { InventoryService } from '../../../core/services/inventory.service';
import { AuthService } from '../../../core/services/auth.service';

const SNOOZE_KEY = 'lis_inv_critical_snooze_until';

@Component({
  selector: 'app-critical-stock-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (isVisible() && criticalItems().length > 0) {
      <div class="critical-modal-backdrop">
        <div class="critical-modal-dialog">
          <div class="critical-modal-header">
            <div class="header-left">
              <span class="warning-icon">🚨</span>
              <div>
                <h3>CRITICAL REAGENT &amp; STOCK ALERT</h3>
                <p>The following items are at or below emergency safety thresholds:</p>
              </div>
            </div>
            <button type="button" class="btn-close" (click)="closeModal()">×</button>
          </div>

          <div class="critical-modal-body">
            <div class="items-list">
              @for (item of criticalItems(); track item.id) {
                <div class="critical-item-row">
                  <div class="item-info">
                    <strong class="item-name">{{ item.name }}</strong>
                    <div class="item-meta">
                      REF: {{ item.sku }} &bull; {{ item.area }}
                      @if (item.location) {
                        &bull; Loc: {{ item.location }}
                      }
                    </div>
                  </div>
                  <div class="item-stock">
                    <div class="stock-num">{{ item.totalStock }} {{ item.unit }}</div>
                    <div class="crit-level">Critical Limit: &le; {{ item.criticalThreshold }}</div>
                  </div>
                </div>
              }
            </div>
          </div>

          <div class="critical-modal-footer">
            <div class="snooze-group">
              <span class="snooze-label">Remind me in:</span>
              <button type="button" class="btn btn-sm btn-outline" (click)="snooze(30)">30m</button>
              <button type="button" class="btn btn-sm btn-outline" (click)="snooze(60)">1 hour</button>
              <button type="button" class="btn btn-sm btn-outline" (click)="snooze(240)">4 hours</button>
            </div>
            <div class="footer-actions">
              <button type="button" class="btn btn-primary" (click)="goToInventory()">
                <i class="fa fa-boxes"></i> Go to Inventory
              </button>
              <button type="button" class="btn btn-secondary" (click)="closeModal()">Dismiss</button>
            </div>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .critical-modal-backdrop {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(15, 23, 42, 0.7);
      backdrop-filter: blur(4px);
      z-index: 10000;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Inter', sans-serif;
      animation: fadeIn 0.2s ease-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .critical-modal-dialog {
      background: white;
      width: 100%;
      max-width: 620px;
      border-radius: 14px;
      box-shadow: 0 25px 50px rgba(0, 0, 0, 0.35);
      border: 2px solid #ef4444;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      max-height: 85vh;
    }

    .critical-modal-header {
      background: #fef2f2;
      padding: 1.25rem 1.5rem;
      border-bottom: 1px solid #fee2e2;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .warning-icon { font-size: 2rem; }

    .header-left h3 {
      font-size: 1.1rem;
      font-weight: 800;
      color: #991b1b;
      margin: 0;
      letter-spacing: 0.3px;
    }

    .header-left p {
      font-size: 0.8rem;
      color: #b91c1c;
      margin: 0.2rem 0 0 0;
    }

    .btn-close {
      background: none;
      border: none;
      font-size: 1.8rem;
      color: #991b1b;
      cursor: pointer;
    }

    .critical-modal-body {
      padding: 1.25rem 1.5rem;
      overflow-y: auto;
      flex: 1;
    }

    .items-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .critical-item-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem 1rem;
      background: #fff5f5;
      border: 1px solid #fecaca;
      border-radius: 8px;
    }

    .item-name {
      font-size: 0.95rem;
      color: #1e293b;
    }

    .item-meta {
      font-size: 0.75rem;
      color: #64748b;
      margin-top: 2px;
    }

    .item-stock {
      text-align: right;
    }

    .stock-num {
      font-size: 1.15rem;
      font-weight: 800;
      color: #dc2626;
    }

    .crit-level {
      font-size: 0.75rem;
      color: #991b1b;
      font-weight: 600;
    }

    .critical-modal-footer {
      background: #f8fafc;
      padding: 1rem 1.5rem;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.75rem;
    }

    .snooze-group {
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }

    .snooze-label {
      font-size: 0.75rem;
      color: #64748b;
      font-weight: 600;
      margin-right: 0.25rem;
    }

    .footer-actions {
      display: flex;
      gap: 0.5rem;
    }

    .btn {
      padding: 0.5rem 1rem;
      border-radius: 6px;
      font-weight: 600;
      font-size: 0.85rem;
      cursor: pointer;
      border: none;
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
    }

    .btn-sm { padding: 0.3rem 0.6rem; font-size: 0.75rem; }
    .btn-primary { background: #10b981; color: white; }
    .btn-primary:hover { background: #059669; }
    .btn-secondary { background: #64748b; color: white; }
    .btn-outline { background: white; border: 1px solid #cbd5e1; color: #334155; }
    .btn-outline:hover { background: #f1f5f9; }
  `]
})
export class CriticalStockModalComponent implements OnInit {
  private invService = inject(InventoryService);
  private auth = inject(AuthService);
  private router = inject(Router);

  isVisible = signal<boolean>(false);
  criticalItems = signal<any[]>([]);

  ngOnInit(): void {
    setTimeout(() => {
      this.checkCriticalStock();
    }, 2000);
  }

  checkCriticalStock(): void {
    if (!this.auth.isAuthenticated()) return;

    // Check if snooze is active
    try {
      const snoozeUntil = localStorage.getItem(SNOOZE_KEY);
      if (snoozeUntil && Number(snoozeUntil) > Date.now()) {
        return; // Snoozed
      }
    } catch {}

    this.invService.checkCriticalStock().subscribe({
      next: (res) => {
        if (res && res.hasCritical && res.items.length > 0) {
          this.criticalItems.set(res.items);
          this.isVisible.set(true);
        }
      },
      error: () => {}
    });
  }

  snooze(minutes: number): void {
    try {
      const until = Date.now() + (minutes * 60 * 1000);
      localStorage.setItem(SNOOZE_KEY, until.toString());
    } catch {}
    this.closeModal();
  }

  closeModal(): void {
    this.isVisible.set(false);
  }

  goToInventory(): void {
    this.closeModal();
    this.router.navigate(['/inventory']);
  }
}
