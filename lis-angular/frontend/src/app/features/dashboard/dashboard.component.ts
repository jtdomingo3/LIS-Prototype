import { Component, inject, OnInit, OnDestroy, signal, computed, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DashboardService } from '../../core/services/dashboard.service';
import { DashboardStats } from '../../core/models';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page-header">
      <h1>Dashboard</h1>
      <div class="global-filters">
        <button class="btn btn-sm" [class.active]="mode() === 'total'" (click)="setMode('total')">TOTAL</button>
        <button class="btn btn-sm" [class.active]="mode() === 'date' && dateFilter() === todayStr" (click)="setMode('today')">TODAY</button>
        <input type="date" [value]="dateFilter()" (change)="onDateChange($event)" class="date-filter" />
      </div>
    </div>

    @if (loading()) {
      <div class="loading">Loading dashboard...</div>
    } @else if (stats()) {
      <!-- Active filter label -->
      <div class="filter-label">
        @if (mode() === 'total') {
          <span class="badge badge-total">Showing all-time totals</span>
        } @else {
          <span class="badge badge-date">Filtered: {{ dateFilter() }}</span>
        }
      </div>

      <!-- Row 1: Test count cards -->
      <div class="stats-row">
        <div class="stat-card">
          <div class="stat-value">{{ activeStats().totalPatients }}</div>
          <div class="stat-label">{{ mode() === 'total' ? 'Total Patients' : 'Patients' }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ activeStats().totalTests }}</div>
          <div class="stat-label">{{ mode() === 'total' ? 'Total Tests' : 'Tests' }}</div>
        </div>
        <div class="stat-card stat-pending">
          <div class="stat-value">{{ activeStats().pending }}</div>
          <div class="stat-label">Pending</div>
        </div>
        <div class="stat-card stat-progress">
          <div class="stat-value">{{ activeStats().inProgress }}</div>
          <div class="stat-label">In Progress</div>
        </div>
        <div class="stat-card stat-completed">
          <div class="stat-value">{{ activeStats().completed }}</div>
          <div class="stat-label">Completed</div>
        </div>
        <div class="stat-card stat-released">
          <div class="stat-value">{{ activeStats().released }}</div>
          <div class="stat-label">Released</div>
        </div>
      </div>

      <!-- Row 2: Sales Summary -->
      <div class="stats-row sales-row">
        <div class="stat-card sales-card">
          <div class="stat-value sales-value">₱{{ formatMoney(activeStats().totalSales) }}</div>
          <div class="stat-label">{{ mode() === 'total' ? 'Total Sales' : 'Sales' }}</div>
        </div>
        <div class="stat-card sales-card">
          <div class="stat-value sales-value">₱{{ formatMoney(activeStats().clinicalSales) }}</div>
          <div class="stat-label">Clinical Sales</div>
        </div>
        <div class="stat-card sales-card">
          <div class="stat-value sales-value">₱{{ formatMoney(activeStats().xraySales) }}</div>
          <div class="stat-label">X-ray Sales</div>
        </div>
      </div>

      <!-- Chart section -->
      <div class="card chart-section">
        <div class="chart-header">
          <h3>Tests by Type</h3>
        </div>
        <div class="chart-container">
          <canvas #chartCanvas></canvas>
        </div>
      </div>

      <!-- Recent Tests -->
      @if (stats()!.recentTests && stats()!.recentTests.length) {
        <div class="card">
          <h3>Recent Tests</h3>
          <table class="table">
            <thead>
              <tr>
                <th>Test ID</th>
                <th>Patient</th>
                <th>Type</th>
                <th>Status</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              @for (t of stats()!.recentTests; track t.id) {
                <tr>
                  <td><a [routerLink]="['/tests', t.id]">{{ t.testId }}</a></td>
                  <td>{{ t.patient ? (t.patient.firstName + ' ' + t.patient.lastName) : '—' }}</td>
                  <td>{{ t.testType }}</td>
                  <td><span class="status-badge" [class]="'status-' + t.status.toLowerCase().replace(' ', '-')">{{ t.status }}</span></td>
                  <td>{{ t.testDate | date:'shortDate' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    }
  `,
  styles: [`
    .global-filters { display: flex; gap: 0.5rem; align-items: center; }
    .global-filters .btn.active { background: #10b981; color: white; }

    .filter-label { margin-bottom: 1rem; }
    .badge { padding: 4px 12px; border-radius: 14px; font-size: 0.8rem; font-weight: 600; }
    .badge-total { background: #dbeafe; color: #1e40af; }
    .badge-date { background: #d1fae5; color: #065f46; }

    .stats-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
    }
    @media (min-width: 1024px) {
      .stats-row {
        grid-template-columns: repeat(6, 1fr);
      }
      .sales-row {
        grid-template-columns: repeat(3, 1fr);
      }
    }

    .stat-card {
      background: white; border-radius: 8px; padding: 1.25rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08); border-left: 4px solid #e5e7eb;
    }
    .stat-value { font-size: 1.8rem; font-weight: 700; color: #111827; }
    .stat-label { font-size: 0.8rem; color: #6b7280; margin-top: 0.25rem; }

    .stat-pending { border-left-color: #f59e0b; }
    .stat-progress { border-left-color: #3b82f6; }
    .stat-completed { border-left-color: #10b981; }
    .stat-released { border-left-color: #6366f1; }

    .sales-card { border-left-color: #10b981; }
    .sales-value { font-size: 1.4rem; color: #059669; }

    .date-filter {
      padding: 0.4rem 0.75rem; border: 1px solid #d1d5db;
      border-radius: 6px; font-size: 0.875rem;
    }

    .chart-section { margin-bottom: 1.5rem; }
    .chart-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    .chart-container { position: relative; height: 350px; width: 100%; }

    .loading { text-align: center; padding: 3rem; color: #6b7280; }
    h3 { font-size: 1.1rem; font-weight: 600; }

    .status-badge {
      padding: 2px 8px; border-radius: 12px; font-size: 0.75rem; font-weight: 600;
    }
    .status-pending { background: #fef3c7; color: #92400e; }
    .status-completed { background: #d1fae5; color: #065f46; }
    .status-released { background: #e0e7ff; color: #3730a3; }
    .status-in-progress { background: #dbeafe; color: #1e40af; }
  `]
})
export class DashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  private dashboardService = inject(DashboardService);

  @ViewChild('chartCanvas') chartCanvas!: ElementRef<HTMLCanvasElement>;

  stats = signal<DashboardStats | null>(null);
  loading = signal(true);
  dateFilter = signal(new Date().toISOString().slice(0, 10));
  mode = signal<'total' | 'date'>('total');
  todayStr = new Date().toISOString().slice(0, 10);

  /** Computed: pick all-time stats or date-filtered stats based on mode */
  activeStats = computed(() => {
    const s = this.stats();
    if (!s) return { totalPatients: 0, totalTests: 0, pending: 0, inProgress: 0, completed: 0, released: 0, totalSales: 0, clinicalSales: 0, xraySales: 0 };
    return this.mode() === 'total' ? s.stats : s.dateStats;
  });

  private chart: Chart | null = null;

  ngOnInit() {
    this.loadStats();
  }

  ngAfterViewInit() {}

  ngOnDestroy() {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
  }

  setMode(m: 'total' | 'date' | 'today') {
    if (m === 'today') {
      this.todayStr = new Date().toISOString().slice(0, 10);
      this.dateFilter.set(this.todayStr);
      this.mode.set('date');
      this.loadStats();
    } else {
      this.mode.set(m);
      if (m === 'date') {
        this.loadStats();
      } else {
        // total mode — just re-render chart
        this.updateChart();
      }
    }
  }

  onDateChange(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.dateFilter.set(value);
    this.mode.set('date');
    this.loadStats();
  }

  formatMoney(val: number): string {
    return (val || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private loadStats() {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
    this.loading.set(true);
    this.dashboardService.getStats(this.dateFilter()).subscribe({
      next: (data) => {
        this.stats.set(data);
        this.loading.set(false);
        setTimeout(() => this.updateChart(), 150);
      },
      error: () => this.loading.set(false),
    });
  }

  private updateChart() {
    const s = this.stats();
    if (!s || !this.chartCanvas) return;

    const dataMap = this.mode() === 'total' ? (s.stats.testTotals || {}) : (s.stats.testTotalsSelected || {});
    const labels = Object.keys(dataMap).sort();
    const values = labels.map(l => dataMap[l] || 0);

    const colors = [
      '#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6',
      '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
      '#06b6d4', '#d946ef', '#a3e635', '#fb923c', '#38bdf8',
    ];

    if (this.chart) {
      this.chart.data.labels = labels;
      this.chart.data.datasets[0].data = values;
      this.chart.data.datasets[0].backgroundColor = labels.map((_, i) => colors[i % colors.length]);
      this.chart.update();
    } else if (this.chartCanvas?.nativeElement) {
      this.chart = new Chart(this.chartCanvas.nativeElement, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Tests',
            data: values,
            backgroundColor: labels.map((_, i) => colors[i % colors.length]),
            borderRadius: 4,
          }],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
          },
          scales: {
            x: { beginAtZero: true, ticks: { precision: 0 } },
          },
        },
      });
    }
  }
}
