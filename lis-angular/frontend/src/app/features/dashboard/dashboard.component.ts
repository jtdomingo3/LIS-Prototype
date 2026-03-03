import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DashboardService } from '../../core/services/dashboard.service';
import { DashboardStats } from '../../core/models';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="page-header">
      <h1>Dashboard</h1>
      <input type="date" [value]="dateFilter()" (change)="onDateChange($event)" class="date-filter" />
    </div>

    @if (loading()) {
      <div class="loading">Loading dashboard...</div>
    } @else if (stats()) {
      <div class="stats-grid">
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

      @if (stats()!.typeBreakdown && objectKeys(stats()!.typeBreakdown).length) {
        <div class="card">
          <h3>Tests by Type</h3>
          <div class="type-grid">
            @for (type of objectKeys(stats()!.typeBreakdown); track type) {
              <div class="type-item">
                <span class="type-name">{{ type }}</span>
                <span class="type-count">{{ stats()!.typeBreakdown[type] }}</span>
              </div>
            }
          </div>
        </div>
      }
    }
  `,
  styles: [`
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .stat-card {
      background: white;
      border-radius: 8px;
      padding: 1.25rem;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      border-left: 4px solid #e5e7eb;
    }

    .stat-value { font-size: 2rem; font-weight: 700; color: #111827; }
    .stat-label { font-size: 0.8rem; color: #6b7280; margin-top: 0.25rem; }

    .stat-pending { border-left-color: #f59e0b; }
    .stat-progress { border-left-color: #3b82f6; }
    .stat-completed { border-left-color: #10b981; }
    .stat-released { border-left-color: #6366f1; }

    .date-filter {
      padding: 0.4rem 0.75rem;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 0.875rem;
    }

    .type-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 0.5rem;
      margin-top: 1rem;
    }

    .type-item {
      display: flex;
      justify-content: space-between;
      padding: 0.5rem 0.75rem;
      background: #f9fafb;
      border-radius: 6px;
    }

    .type-name { font-size: 0.875rem; }
    .type-count { font-weight: 600; color: #3b82f6; }

    .loading { text-align: center; padding: 3rem; color: #6b7280; }

    h3 { font-size: 1.1rem; font-weight: 600; }
  `]
})
export class DashboardComponent implements OnInit {
  private dashboardService = inject(DashboardService);

  stats = signal<DashboardStats | null>(null);
  loading = signal(true);
  dateFilter = signal(new Date().toISOString().slice(0, 10));

  objectKeys = Object.keys;

  ngOnInit() {
    this.loadStats();
  }

  onDateChange(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.dateFilter.set(value);
    this.loadStats();
  }

  private loadStats() {
    this.loading.set(true);
    this.dashboardService.getStats(this.dateFilter()).subscribe({
      next: (data) => {
        this.stats.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }
}
