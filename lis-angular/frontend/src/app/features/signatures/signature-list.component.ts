import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SignatureService } from '../../core/services/signature.service';

@Component({
  selector: 'app-signature-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <div class="page-header">
      <h1>Signatures</h1>
    </div>

    <!-- Filters -->
    <div class="card filter-bar">
      <input type="text" [(ngModel)]="search" placeholder="Search patient or test ID..." class="form-control" (keyup.enter)="load()" />
      <select [(ngModel)]="testTypeFilter" class="form-control" (change)="load()">
        <option value="">All Test Types</option>
        @for (t of availableTestTypes(); track t) {
          <option [value]="t">{{ t }}</option>
        }
      </select>
      <input type="date" [(ngModel)]="dateFilter" class="form-control" (change)="load()" />
      <button class="btn btn-secondary" (click)="clearFilters()">Clear</button>
    </div>

    @if (loading()) {
      <div class="loading">Loading...</div>
    } @else {
      <div class="card">
        <table class="table">
          <thead>
            <tr>
              <th>Test ID</th>
              <th>Patient</th>
              <th>Type</th>
              <th>Date</th>
              <th>Doctor</th>
              <th>Signature</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (t of tests(); track t.id) {
              <tr>
                <td>{{ t.test_id || t.id?.substring(0, 8) }}</td>
                <td>{{ t.patient_name || '—' }}</td>
                <td>{{ t.test_type }}</td>
                <td>{{ t.test_date | date:'mediumDate' }}</td>
                <td>{{ t.assigned_doctor_name || '—' }}</td>
                <td>
                  @if (t.has_signature) {
                    <span class="sig-yes">✓ Signed</span>
                  } @else {
                    <span class="sig-no">—</span>
                  }
                </td>
                <td class="actions-cell">
                  <div class="table-actions">
                    @if (!t.has_signature) {
                      <button class="btn btn-sm btn-primary" (click)="applySignature(t)">Apply Signature</button>
                    }
                    <a [routerLink]="['/reports', t.id]" class="btn btn-sm btn-outline">View Report</a>
                  </div>
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="7" class="text-center">
                  <div class="empty-state">
                    <i class="fa fa-pen-nib empty-icon"></i>
                    <p>No tests requiring your signature</p>
                    <span>All caught up!</span>
                  </div>
                </td>
              </tr>
            }
          </tbody>
        </table>

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
    /* match search input width/height from tests list */
    .filter-bar input, .filter-bar select { height: 2.8rem; }
    .filter-bar input[type="text"] { flex: 1; min-width: 200px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 0.75rem; text-align: left; border-bottom: 1px solid #e5e7eb; }
    th { background: #f9fafb; font-weight: 600; color: #374151; }
    .sig-yes { color: #10b981; font-weight: 700; }
    .sig-no { color: #9ca3af; }
    .actions-cell { display: flex; gap: 0.5rem; }
    .pagination { display: flex; gap: 0.5rem; align-items: center; justify-content: center; padding: 1rem 0; }
    .page-info { font-weight: 500; color: #374151; }
    .loading { text-align: center; padding: 3rem; color: #6b7280; }
    .text-center { text-align: center; }
    .btn-sm { padding: 4px 12px; font-size: 0.85rem; }
  `]
})
export class SignatureListComponent implements OnInit {
  private signatureService = inject(SignatureService);

  tests = signal<any[]>([]);
  availableTestTypes = signal<string[]>([]);
  loading = signal(true);
  page = signal(1);
  totalPages = signal(1);

  search = '';
  testTypeFilter = '';
  dateFilter = '';

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.signatureService.getAll({
      search: this.search || undefined,
      testType: this.testTypeFilter || undefined,
      date: this.dateFilter || undefined,
      page: this.page(),
      limit: 25,
    }).subscribe({
      next: (res: any) => {
        this.tests.set(res.tests || []);
        if (res.availableTestTypes) this.availableTestTypes.set(res.availableTestTypes);
        this.totalPages.set(res.pagination?.totalPages || 1);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  goToPage(p: number) {
    this.page.set(p);
    this.load();
  }

  clearFilters() {
    this.search = '';
    this.testTypeFilter = '';
    this.dateFilter = '';
    this.page.set(1);
    this.load();
  }

  applySignature(test: any) {
    if (!confirm(`Apply your signature to test ${test.test_id || test.id?.substring(0, 8)}?`)) return;
    this.signatureService.applySignature(test.id).subscribe({
      next: () => this.load(),
      error: (err) => alert(err.error?.error || 'Failed to apply signature'),
    });
  }
}
