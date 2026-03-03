import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TestService } from '../../../core/services/test.service';
import { Test } from '../../../core/models';

@Component({
  selector: 'app-test-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <div class="page-header">
      <h1>Tests</h1>
      <a routerLink="/tests/new" class="btn btn-primary">+ New Test</a>
    </div>

    <div class="card">
      <div class="filter-bar">
        <input type="text" [(ngModel)]="search" (input)="onSearch()"
          placeholder="Search by test ID or patient name..." class="form-control search-input" />
        <select [(ngModel)]="statusFilter" (change)="loadTests()" class="form-control filter-select">
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="released">Released</option>
        </select>
        <select [(ngModel)]="typeFilter" (change)="loadTests()" class="form-control filter-select">
          <option value="">All Types</option>
          <option value="blood chemistry">Blood Chemistry</option>
          <option value="hematology">Hematology</option>
          <option value="urinalysis">Urinalysis</option>
          <option value="xray">X-Ray</option>
          <option value="ecg">ECG</option>
          <option value="drug test">Drug Test</option>
          <option value="fecalysis">Fecalysis</option>
          <option value="serology">Serology</option>
          <option value="miscellaneous">Miscellaneous</option>
        </select>
      </div>

      <table class="table">
        <thead>
          <tr>
            <th>Test ID</th>
            <th>Patient</th>
            <th>Type</th>
            <th>Status</th>
            <th>Date</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          @for (t of tests(); track t.id) {
            <tr>
              <td><strong>{{ t.test_id }}</strong></td>
              <td>{{ t.patient_name || '—' }}</td>
              <td>{{ t.test_type }}</td>
              <td><span class="badge" [class]="'badge-' + t.status">{{ t.status }}</span></td>
              <td>{{ t.created_at | date:'shortDate' }}</td>
              <td class="action-cell">
                <a [routerLink]="['/tests', t.id]" class="btn btn-sm btn-primary">View</a>
                <a [routerLink]="['/tests', t.id, 'results']" class="btn btn-sm btn-secondary">Enter Result</a>
                @if (t.status === 'Completed' || t.status === 'Released') {
                  <a [routerLink]="['/reports', t.id]" class="btn btn-sm btn-primary">Report</a>
                }
                <button class="btn btn-sm btn-danger" (click)="deleteTest(t)">Delete</button>
              </td>
            </tr>
          } @empty {
            <tr><td colspan="6" class="text-center">No tests found</td></tr>
          }
        </tbody>
      </table>

      <div class="pagination">
        <button class="btn btn-sm" [disabled]="page() <= 1" (click)="changePage(-1)">← Prev</button>
        <span>Page {{ page() }} of {{ totalPages() }}</span>
        <button class="btn btn-sm" [disabled]="page() >= totalPages()" (click)="changePage(1)">Next →</button>
      </div>
    </div>
  `,
  styles: [`
    .filter-bar { display: flex; gap: 0.75rem; margin-bottom: 1rem; flex-wrap: wrap; }
    .search-input { flex: 1; min-width: 200px; }
    .filter-select { width: 160px; }
    .pagination { display: flex; align-items: center; justify-content: center; gap: 1rem; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #e5e7eb; }
    .text-center { text-align: center; color: #6b7280; padding: 2rem !important; }
    .action-cell { display: flex; gap: 0.35rem; flex-wrap: wrap; }
    .btn-danger { background: #ef4444; color: white; border-color: #ef4444; }
    .btn-danger:hover { background: #dc2626; }
    .btn-secondary { background: #6b7280; color: white; border-color: #6b7280; }
    .btn-secondary:hover { background: #4b5563; }
  `]
})
export class TestListComponent implements OnInit {
  private testService = inject(TestService);

  tests = signal<Test[]>([]);
  page = signal(1);
  totalPages = signal(1);
  search = '';
  statusFilter = '';
  typeFilter = '';
  private limit = 20;
  private debounceTimer: any;

  ngOnInit() { this.loadTests(); }

  onSearch() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.page.set(1);
      this.loadTests();
    }, 300);
  }

  changePage(delta: number) {
    this.page.update(p => p + delta);
    this.loadTests();
  }

  loadTests() {
    const params: any = { page: this.page(), limit: this.limit };
    if (this.search) params.search = this.search;
    if (this.statusFilter) params.status = this.statusFilter;
    if (this.typeFilter) params.test_type = this.typeFilter;

    this.testService.getAll(params).subscribe(res => {
      this.tests.set(res.tests);
      this.totalPages.set(res.pagination?.totalPages || 1);
    });
  }

  deleteTest(t: any) {
    if (!confirm(`Delete test "${t.test_id}"? This cannot be undone.`)) return;
    this.testService.delete(t.id).subscribe({
      next: () => this.loadTests(),
      error: (err) => alert(err.error?.error || 'Failed to delete test')
    });
  }
}
