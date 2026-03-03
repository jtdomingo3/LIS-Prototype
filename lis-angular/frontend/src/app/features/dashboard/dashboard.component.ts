import { Component, inject, OnInit, OnDestroy, signal, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
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
      <div class="date-controls">
        <button class="btn btn-sm" (click)="setDate('yesterday')">YESTERDAY</button>
        <button class="btn btn-sm" (click)="setDate('today')">TODAY</button>
        <input type="date" [value]="dateFilter()" (change)="onDateChange($event)" class="date-filter" />
      </div>
    </div>

    @if (loading()) {
      <div class="loading">Loading dashboard...</div>
    } @else if (stats()) {
      <!-- Row 1: Test count cards -->
      <div class="stats-row">
        <div class="stat-card">
          <div class="stat-value">{{ stats()!.stats.totalPatients }}</div>
          <div class="stat-label">Total Patients</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{{ stats()!.stats.totalTests }}</div>
          <div class="stat-label">Total Tests</div>
        </div>
        <div class="stat-card stat-pending">
          <div class="stat-value">{{ stats()!.stats.pending }}</div>
          <div class="stat-label">Pending</div>
        </div>
        <div class="stat-card stat-progress">
          <div class="stat-value">{{ stats()!.stats.inProgress }}</div>
          <div class="stat-label">In Progress</div>
        </div>
        <div class="stat-card stat-completed">
          <div class="stat-value">{{ stats()!.stats.completed }}</div>
          <div class="stat-label">Completed</div>
        </div>
        <div class="stat-card stat-released">
          <div class="stat-value">{{ stats()!.stats.released }}</div>
          <div class="stat-label">Released</div>
        </div>
      </div>

      <!-- Row 2: Sales Summary -->
      <div class="stats-row sales-row">
        <div class="stat-card sales-card">
          <div class="stat-value sales-value">₱{{ formatMoney(stats()!.stats.totalSales) }}</div>
          <div class="stat-label">Total Sales</div>
        </div>
        <div class="stat-card sales-card">
          <div class="stat-value sales-value">₱{{ formatMoney(stats()!.stats.clinicalSales) }}</div>
          <div class="stat-label">Clinical Sales</div>
        </div>
        <div class="stat-card sales-card">
          <div class="stat-value sales-value">₱{{ formatMoney(stats()!.stats.xraySales) }}</div>
          <div class="stat-label">X-ray Sales</div>
        </div>
        <div class="stat-card sales-card today">
          <div class="stat-value sales-value">₱{{ formatMoney(stats()!.stats.todaySales) }}</div>
          <div class="stat-label">Today Sales</div>
        </div>
        <div class="stat-card sales-card today">
          <div class="stat-value sales-value">₱{{ formatMoney(stats()!.stats.clinicalToday) }}</div>
          <div class="stat-label">Clinical Today</div>
        </div>
        <div class="stat-card sales-card today">
          <div class="stat-value sales-value">₱{{ formatMoney(stats()!.stats.xrayToday) }}</div>
          <div class="stat-label">X-ray Today</div>
        </div>
      </div>

      <!-- Chart section -->
      <div class="card chart-section">
        <div class="chart-header">
          <h3>Tests by Type</h3>
          <div class="chart-toggles">
            <button class="btn btn-sm" [class.active]="chartMode() === 'total'" (click)="setChartMode('total')">TOTAL</button>
            <button class="btn btn-sm" [class.active]="chartMode() === 'selected'" (click)="setChartMode('selected')">SELECTED</button>
            <button class="btn btn-sm" [class.active]="chartMode() === 'today'" (click)="setChartMode('today')">TODAY</button>
          </div>
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
    .date-controls { display: flex; gap: 0.5rem; align-items: center; }
    .stats-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
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
    .sales-card.today { border-left-color: #f97316; }
    .sales-value { font-size: 1.4rem; color: #059669; }
    .sales-card.today .sales-value { color: #ea580c; }

    .date-filter {
      padding: 0.4rem 0.75rem; border: 1px solid #d1d5db;
      border-radius: 6px; font-size: 0.875rem;
    }

    .chart-section { margin-bottom: 1.5rem; }
    .chart-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    .chart-toggles { display: flex; gap: 0.5rem; }
    .chart-toggles .btn.active { background: #10b981; color: white; }
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
  chartMode = signal<'total' | 'selected' | 'today'>('total');

  private chart: Chart | null = null;

  objectKeys = Object.keys;

  ngOnInit() {
    this.loadStats();
  }

  ngAfterViewInit() {
    // Chart will be created after data loads
  }

  ngOnDestroy() {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
  }

  setDate(preset: string) {
    if (preset === 'today') {
      this.dateFilter.set(new Date().toISOString().slice(0, 10));
    } else if (preset === 'yesterday') {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      this.dateFilter.set(d.toISOString().slice(0, 10));
    }
    this.loadStats();
  }

  onDateChange(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.dateFilter.set(value);
    this.loadStats();
  }

  setChartMode(mode: 'total' | 'selected' | 'today') {
    this.chartMode.set(mode);
    this.updateChart();
  }

  formatMoney(val: number): string {
    return (val || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private loadStats() {
    // Destroy chart before hiding canvas (loading hides the @if block)
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
    this.loading.set(true);
    this.dashboardService.getStats(this.dateFilter()).subscribe({
      next: (data) => {
        this.stats.set(data);
        this.loading.set(false);
        // Wait for view to render then create/update chart
        setTimeout(() => this.updateChart(), 150);
      },
      error: () => this.loading.set(false),
    });
  }

  private updateChart() {
    const s = this.stats();
    if (!s || !this.chartCanvas) return;

    const mode = this.chartMode();
    let dataMap: Record<string, number>;
    if (mode === 'total') dataMap = s.stats.testTotals || {};
    else if (mode === 'selected') dataMap = s.stats.testTotalsSelected || {};
    else dataMap = s.stats.testTotalsToday || {};

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
