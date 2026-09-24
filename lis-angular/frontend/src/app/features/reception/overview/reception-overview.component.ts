import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ReceptionService } from '../../../core/services/reception.service';
import { AuthService } from '../../../core/services/auth.service';

interface AreaInfo {
  name: string;
  count: number;
  testCount: number;
}

@Component({
  selector: 'app-reception-overview',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <div class="page-header">
      <div>
        <h1>Reception - Department Areas</h1>
        <p class="subtitle">Real-time overview of active reception queues and patient area flow.</p>
      </div>
      <div class="header-actions">
        <a routerLink="/reception/stashed" class="btn btn-warning">
          &#128229; Stashed Results ({{ stashedCount() }})
        </a>
        <a routerLink="/kiosk" target="_blank" class="btn btn-primary">
          &#128421; Open Patient Queue Display
        </a>
        @if (isAdmin()) {
          <button class="btn btn-danger" (click)="clearQueues()" [disabled]="clearing()">
            {{ clearing() ? 'Clearing...' : '&#129529; Clear Reception Queue' }}
          </button>
        }
      </div>
    </div>

    @if (alertMsg()) {
      <div class="alert alert-success">{{ alertMsg() }}</div>
    }

    @if (loading()) {
      <div class="loading">Loading areas...</div>
    } @else {
      <div class="area-grid">
        @for (area of areas(); track area.name) {
          <a [routerLink]="['/reception/area', area.name]" class="area-card">
            <div class="area-count">{{ area.count }}</div>
            <div class="area-label">{{ area.name }}</div>
            <div class="area-link">View Queue &rarr;</div>
          </a>
        }
      </div>

      <!-- Advertisement Management -->
      <div class="card ad-section">
        <h3>Kiosk Advertisement</h3>
        <textarea [(ngModel)]="adText" placeholder="Enter advertisement text for kiosk display..." rows="3" class="form-control"></textarea>
        <button class="btn btn-primary" style="margin-top: 0.75rem;" (click)="saveAd()">Save Advertisement</button>
        @if (adSaved()) {
          <span class="save-msg">&check; Saved</span>
        }
      </div>
    }
  `,
  styles: [`
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    .subtitle {
      color: #64748b;
      margin-top: 0.25rem;
      font-size: 0.95rem;
    }
    .header-actions {
      display: flex;
      gap: 0.75rem;
      align-items: center;
      flex-wrap: wrap;
    }
    .btn-warning {
      background: #f59e0b;
      color: white;
      border: none;
      padding: 0.6rem 1.1rem;
      border-radius: 8px;
      font-weight: 600;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      box-shadow: 0 2px 6px rgba(245, 158, 11, 0.25);
    }
    .btn-warning:hover {
      background: #d97706;
    }
    .btn-danger {
      background: #dc2626;
      color: white;
      border: none;
      padding: 0.6rem 1.1rem;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
    }
    .btn-danger:hover {
      background: #b91c1c;
    }
    .area-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 1.5rem;
      margin-bottom: 2rem;
    }
    .area-card {
      background: white; border-radius: 10px; padding: 2rem 1.5rem; text-align: center;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08); border: 2px solid transparent;
      transition: border-color 0.2s, box-shadow 0.2s; text-decoration: none; color: inherit;
    }
    .area-card:hover { border-color: #10b981; box-shadow: 0 4px 12px rgba(16,185,129,0.15); }
    .area-count { font-size: 2.5rem; font-weight: 700; color: #10b981; }
    .area-label { font-size: 1rem; color: #374151; margin-top: 0.25rem; font-weight: 600; }
    .area-link { font-size: 0.8rem; color: #6b7280; margin-top: 0.5rem; }
    .loading { text-align: center; padding: 3rem; color: #6b7280; }
    .ad-section { margin-top: 1rem; }
    .ad-section h3 { margin-bottom: 0.75rem; }
    .save-msg { margin-left: 1rem; color: #10b981; font-weight: 600; }
    .alert-success {
      background: #dcfce7;
      color: #166534;
      border: 1px solid #bbf7d0;
      padding: 0.75rem 1rem;
      border-radius: 8px;
      margin-bottom: 1rem;
    }
    @media (max-width: 1200px) { .area-grid { grid-template-columns: repeat(3, 1fr); } }
    @media (max-width: 768px) { .area-grid { grid-template-columns: repeat(2, 1fr); } }
  `]
})
export class ReceptionOverviewComponent implements OnInit {
  private receptionService = inject(ReceptionService);
  private authService = inject(AuthService);

  areas = signal<AreaInfo[]>([]);
  loading = signal(true);
  stashedCount = signal(0);
  clearing = signal(false);
  alertMsg = signal<string | null>(null);
  adText = '';
  adSaved = signal(false);

  isAdmin(): boolean {
    return this.authService.user?.role === 'Admin';
  }

  ngOnInit() {
    this.loadData();
  }

  loadData() {
    this.receptionService.getOverview().subscribe({
      next: (res: any) => {
        const areaList = Array.isArray(res.areas) ? res.areas : [];
        this.areas.set(areaList);
        if (res.ad) this.adText = res.ad;
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });

    this.receptionService.getStashed().subscribe({
      next: (res) => {
        this.stashedCount.set((res.stashedList || []).length);
      },
      error: () => {},
    });
  }

  clearQueues() {
    const confirmed = confirm(
      'ADMIN CONFIRMATION REQUIRED\n\nAre you sure you want to clear all active reception queues?\n\n• All queue counts will reset to 0 (tests set to Released).\n• Patient profiles and encoded test results will NOT be lost.\n\nClick OK to proceed.'
    );
    if (!confirmed) return;

    this.clearing.set(true);
    this.receptionService.clearQueues().subscribe({
      next: (res: any) => {
        this.clearing.set(false);
        this.alertMsg.set(res.message || 'Queues cleared successfully.');
        setTimeout(() => this.alertMsg.set(null), 4000);
        this.loadData();
      },
      error: () => {
        this.clearing.set(false);
        alert('Failed to clear reception queues.');
      }
    });
  }

  saveAd() {
    this.receptionService.saveAdvert(this.adText).subscribe({
      next: () => {
        this.adSaved.set(true);
        setTimeout(() => this.adSaved.set(false), 2000);
      },
    });
  }
}
