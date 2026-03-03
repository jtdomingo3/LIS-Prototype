import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ReportService } from '../../../core/services/report.service';

@Component({
  selector: 'app-report-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <div class="page-header">
      <h1>Reports</h1>
      <div class="actions">
        <a routerLink="/reports/worksheet" class="btn btn-secondary">📊 Worksheet Export</a>
      </div>
    </div>

    <!-- Filters -->
    <div class="card filter-bar">
      <input type="text" [(ngModel)]="search" placeholder="Search patient, test ID..." class="form-control" (keyup.enter)="loadReports()" />
      <select [(ngModel)]="testTypeFilter" class="form-control" (change)="loadReports()">
        <option value="">All Test Types</option>
        @for (t of availableTestTypes(); track t) {
          <option [value]="t">{{ t }}</option>
        }
      </select>
      <input type="date" [(ngModel)]="dateFilter" class="form-control" (change)="loadReports()" />
      <button class="btn btn-secondary" (click)="clearFilters()">Clear</button>
      <button class="btn btn-primary" (click)="loadReports()">Filter</button>
    </div>

    @if (loading()) {
      <div class="loading">Loading reports...</div>
    } @else {
      <div class="card">
        <table class="table">
          <thead>
            <tr>
              <th><input type="checkbox" (change)="toggleAll($event)" /></th>
              <th>Test ID</th>
              <th>Patient</th>
              <th>Test Type</th>
              <th>Date</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (r of reports(); track r.id) {
              <tr>
                <td><input type="checkbox" [(ngModel)]="r.selected" /></td>
                <td>{{ r.test_id || r.id?.substring(0, 8) }}</td>
                <td>{{ r.patient_name || '—' }}</td>
                <td>{{ r.test_type }}</td>
                <td>{{ r.test_date | date:'mediumDate' }}</td>
                <td>
                  <span class="badge" [class]="'badge-' + r.status">{{ r.status }}</span>
                </td>
                <td>
                  <a [routerLink]="['/reports', r.id]" class="btn btn-sm btn-primary">View Report</a>
                </td>
              </tr>
            } @empty {
              <tr><td colspan="7" class="text-center">No reports found</td></tr>
            }
          </tbody>
        </table>

        <!-- Pagination -->
        <div class="pagination">
          <button class="btn btn-sm" [disabled]="page() <= 1" (click)="goToPage(1)">First</button>
          <button class="btn btn-sm" [disabled]="page() <= 1" (click)="goToPage(page() - 1)">Previous</button>
          <span class="page-info">Page {{ page() }} of {{ totalPages() }}</span>
          <button class="btn btn-sm" [disabled]="page() >= totalPages()" (click)="goToPage(page() + 1)">Next</button>
          <button class="btn btn-sm" [disabled]="page() >= totalPages()" (click)="goToPage(totalPages())">Last</button>
        </div>
      </div>
    }
  `,
  styles: [`
    .filter-bar { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; }
    .filter-bar input, .filter-bar select { max-width: 220px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 0.75rem; text-align: left; border-bottom: 1px solid #e5e7eb; }
    th { background: #f9fafb; font-weight: 600; color: #374151; }
    .badge { padding: 3px 10px; border-radius: 20px; font-size: 0.8rem; font-weight: 600; }
    .badge-completed { background: #d1fae5; color: #065f46; }
    .badge-released { background: #dbeafe; color: #1e40af; }
    .badge-pending { background: #fef3c7; color: #92400e; }
    .badge-in-progress { background: #e0e7ff; color: #3730a3; }
    .pagination { display: flex; gap: 0.5rem; align-items: center; justify-content: center; padding: 1rem 0; }
    .page-info { font-weight: 500; color: #374151; }
    .loading { text-align: center; padding: 3rem; color: #6b7280; }
    .text-center { text-align: center; }
    .btn-sm { padding: 4px 12px; font-size: 0.85rem; }
  `]
})
export class ReportListComponent implements OnInit {
  private reportService = inject(ReportService);

  reports = signal<any[]>([]);
  availableTestTypes = signal<string[]>([]);
  loading = signal(true);
  page = signal(1);
  totalPages = signal(1);

  search = '';
  testTypeFilter = '';
  dateFilter = '';

  ngOnInit() {
    this.loadReports();
  }

  loadReports() {
    this.loading.set(true);
    this.reportService.getAll({
      search: this.search || undefined,
      testType: this.testTypeFilter || undefined,
      date: this.dateFilter || undefined,
      page: this.page(),
      limit: 25,
    }).subscribe({
      next: (res: any) => {
        this.reports.set((res.reports || []).map((r: any) => ({ ...r, selected: false })));
        if (res.availableTestTypes) this.availableTestTypes.set(res.availableTestTypes);
        this.totalPages.set(res.pagination?.totalPages || 1);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  goToPage(p: number) {
    this.page.set(p);
    this.loadReports();
  }

  clearFilters() {
    this.search = '';
    this.testTypeFilter = '';
    this.dateFilter = '';
    this.page.set(1);
    this.loadReports();
  }

  toggleAll(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    this.reports.update(list => list.map(r => ({ ...r, selected: checked })));
  }
}
