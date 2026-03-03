import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ReceptionService } from '../../../core/services/reception.service';

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
      <h1>Reception</h1>
      <a routerLink="/kiosk" target="_blank" class="btn btn-primary">Open Patient Queue Display</a>
    </div>

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
    @media (max-width: 1200px) { .area-grid { grid-template-columns: repeat(3, 1fr); } }
    @media (max-width: 768px) { .area-grid { grid-template-columns: repeat(2, 1fr); } }
  `]
})
export class ReceptionOverviewComponent implements OnInit {
  private receptionService = inject(ReceptionService);

  areas = signal<AreaInfo[]>([]);
  loading = signal(true);
  adText = '';
  adSaved = signal(false);

  ngOnInit() {
    this.receptionService.getOverview().subscribe({
      next: (res: any) => {
        const areaList = Array.isArray(res.areas) ? res.areas : [];
        this.areas.set(areaList);
        if (res.ad) this.adText = res.ad;
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
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
