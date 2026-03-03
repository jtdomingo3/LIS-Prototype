import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ReceptionService } from '../../../core/services/reception.service';

interface AreaInfo {
  name: string;
  label: string;
  count: number;
}

@Component({
  selector: 'app-reception-overview',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page-header">
      <h1>Reception</h1>
    </div>

    @if (loading()) {
      <div class="loading">Loading areas...</div>
    } @else {
      <div class="area-grid">
        @for (area of areas(); track area.name) {
          <a [routerLink]="['/reception/area', area.name]" class="area-card">
            <div class="area-count">{{ area.count }}</div>
            <div class="area-label">{{ area.label }}</div>
          </a>
        }
      </div>
    }
  `,
  styles: [`
    .area-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem; }
    .area-card {
      background: white;  border-radius: 10px; padding: 2rem 1.5rem; text-align: center;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08); border: 2px solid transparent;
      transition: border-color 0.2s, box-shadow 0.2s; text-decoration: none; color: inherit;
    }
    .area-card:hover { border-color: #3b82f6; box-shadow: 0 4px 12px rgba(59,130,246,0.15); }
    .area-count { font-size: 2.5rem; font-weight: 700; color: #3b82f6; }
    .area-label { font-size: 1rem; color: #6b7280; margin-top: 0.25rem; }
    .loading { text-align: center; padding: 3rem; color: #6b7280; }
  `]
})
export class ReceptionOverviewComponent implements OnInit {
  private receptionService = inject(ReceptionService);

  areas = signal<AreaInfo[]>([]);
  loading = signal(true);

  private areaLabels: Record<string, string> = {
    laboratory: 'Laboratory',
    xray: 'X-Ray',
    ecg: 'ECG',
    ultrasound: 'Ultrasound',
    'drug test': 'Drug Test',
    cashier: 'Cashier',
    release: 'Release',
  };

  ngOnInit() {
    this.receptionService.getOverview().subscribe({
      next: (res) => {
        const areas: AreaInfo[] = Object.entries(res.areas || {}).map(([name, count]) => ({
          name,
          label: this.areaLabels[name] || name.charAt(0).toUpperCase() + name.slice(1),
          count: typeof count === 'number' ? count : 0,
        }));
        // If no areas from server, show defaults
        if (!areas.length) {
          Object.entries(this.areaLabels).forEach(([name, label]) => {
            areas.push({ name, label, count: 0 });
          });
        }
        this.areas.set(areas);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }
}
