import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PatientService } from '../../../core/services/patient.service';
import { Patient } from '../../../core/models';

@Component({
  selector: 'app-patient-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  template: `
    <div class="page-header">
      <h1>Patients</h1>
      <a routerLink="/patients/new" class="btn btn-primary">+ New Patient</a>
    </div>

    <div class="card">
      <div class="filter-bar">
        <input type="text" [(ngModel)]="search" (input)="onSearch()"
          placeholder="Search by name, ID, or phone..." class="form-control search-input" />
        <input type="date" [(ngModel)]="dateFilter" (change)="loadPatients()" class="form-control date-input" />
        <select [(ngModel)]="philhealthFilter" (change)="loadPatients()" class="form-control filter-select">
          <option value="">PhilHealth</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
        <select [(ngModel)]="companyFilter" (change)="loadPatients()" class="form-control filter-select">
          <option value="">All Companies</option>
          @for (c of availableCompanies(); track c) {
            <option [value]="c">{{ c }}</option>
          }
        </select>
        <button class="btn btn-sm" (click)="clearFilters()">Clear</button>
      </div>

      <table class="table">
        <thead>
          <tr>
            <th>Patient ID</th>
            <th>Name</th>
            <th>Age</th>
            <th>Gender</th>
            <th>Phone</th>
            <th>Company</th>
            <th>PhilHealth</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          @for (p of patients(); track p.id) {
            <tr>
              <td><strong>{{ p.patient_id || '—' }}</strong></td>
              <td>{{ p.last_name }}, {{ p.first_name }} {{ p.middle_name || '' }}</td>
              <td>{{ getAge(p) }}</td>
              <td>{{ (p.gender || p.sex || '—') | uppercase }}</td>
              <td>{{ p.phone || '—' }}</td>
              <td>{{ p.company || '—' }}</td>
              <td>
                @if (p.philhealth_consent) {
                  <span class="badge badge-green">Yes</span>
                } @else {
                  <span class="badge badge-gray">No</span>
                }
              </td>
              <td class="actions-cell">
                <a [routerLink]="['/patients', p.id]" class="btn btn-sm">View</a>
                <a [routerLink]="['/tests/new']" [queryParams]="{patientId: p.id}" class="btn btn-sm btn-primary">Assign Test</a>
                <a [routerLink]="['/patients', p.id, 'edit']" class="btn btn-sm">Edit</a>
                <button class="btn btn-sm btn-danger" (click)="deletePatient(p)">Delete</button>
              </td>
            </tr>
          } @empty {
            <tr><td colspan="8" class="text-center">No patients found</td></tr>
          }
        </tbody>
      </table>

      <div class="pagination">
        <button class="btn btn-sm" [disabled]="page() <= 1" (click)="goToPage(1)">First</button>
        <button class="btn btn-sm" [disabled]="page() <= 1" (click)="changePage(-1)">← Prev</button>
        @for (p of getPageNumbers(); track p) {
          <button class="btn btn-sm" [class.active]="p === page()" (click)="goToPage(p)">{{ p }}</button>
        }
        <button class="btn btn-sm" [disabled]="page() >= totalPages()" (click)="changePage(1)">Next →</button>
        <button class="btn btn-sm" [disabled]="page() >= totalPages()" (click)="goToPage(totalPages())">Last</button>
      </div>
    </div>
  `,
  styles: [`
    .filter-bar { display: flex; gap: 0.75rem; margin-bottom: 1rem; flex-wrap: wrap; }
    .search-input { flex: 1; min-width: 200px; }
    .date-input { width: 160px; }
    .filter-select { width: 150px; }
    .pagination { display: flex; align-items: center; justify-content: center; gap: 0.25rem; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #e5e7eb; flex-wrap: wrap; }
    .pagination .btn { background: none; border: none; color: #374151; cursor: pointer; padding: 4px 10px; font-size: 0.85rem; }
    .pagination .btn:hover:not([disabled]) { color: #10b981; text-decoration: underline; }
    .pagination .btn.active { background: #10b981; color: white; border-radius: 4px; font-weight: 700; }
    .pagination .btn[disabled] { color: #d1d5db; cursor: default; }
    .text-center { text-align: center; color: #6b7280; padding: 2rem !important; }
    .badge { padding: 2px 8px; border-radius: 10px; font-size: 0.75rem; font-weight: 600; }
    .badge-green { background: #d1fae5; color: #065f46; }
    .badge-gray { background: #f3f4f6; color: #6b7280; }
    .btn-danger { background: #ef4444; color: white; border-color: #ef4444; }
    .btn-danger:hover { background: #dc2626; }
    .actions-cell { white-space: nowrap; }
  `]
})
export class PatientListComponent implements OnInit {
  private patientService = inject(PatientService);

  patients = signal<Patient[]>([]);
  page = signal(1);
  totalPages = signal(1);
  availableCompanies = signal<string[]>([]);
  search = '';
  dateFilter = '';
  philhealthFilter = '';
  companyFilter = '';
  private limit = 10;
  private debounceTimer: any;

  ngOnInit() { this.loadPatients(); }

  onSearch() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.page.set(1);
      this.loadPatients();
    }, 300);
  }

  clearFilters() {
    this.search = '';
    this.dateFilter = '';
    this.philhealthFilter = '';
    this.companyFilter = '';
    this.page.set(1);
    this.loadPatients();
  }

  changePage(delta: number) {
    this.page.update(p => p + delta);
    this.loadPatients();
  }

  goToPage(p: number) {
    this.page.set(p);
    this.loadPatients();
  }

  getPageNumbers(): number[] {
    const total = this.totalPages();
    const current = this.page();
    const maxDisplay = 10;
    const half = Math.floor(maxDisplay / 2);
    let start = Math.max(1, current - half);
    let end = Math.min(total, start + maxDisplay - 1);
    start = Math.max(1, end - maxDisplay + 1);
    const pages: number[] = [];
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  getAge(p: Patient): string {
    if (p.date_of_birth) {
      const today = new Date();
      const birth = new Date(p.date_of_birth);
      if (!isNaN(birth.getTime())) {
        let age = today.getFullYear() - birth.getFullYear();
        const m = today.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
        return String(age);
      }
    }
    return p.age_manual || p.age || '—';
  }

  deletePatient(p: Patient) {
    const name = `${p.first_name} ${p.last_name}`;
    if (!confirm(`Are you sure you want to delete patient "${name}"?`)) return;
    this.patientService.delete(p.id).subscribe({
      next: () => this.loadPatients(),
      error: (err) => alert(err?.error?.error || 'Failed to delete patient. They may have existing tests.'),
    });
  }

  loadPatients() {
    const params: any = { page: this.page(), limit: this.limit };
    if (this.search) params.search = this.search;
    if (this.dateFilter) params.date = this.dateFilter;
    if (this.philhealthFilter) params.philhealth = this.philhealthFilter;
    if (this.companyFilter) params.company = this.companyFilter;

    this.patientService.getAll(params).subscribe(res => {
      this.patients.set(res.patients);
      this.totalPages.set(res.pagination?.totalPages || 1);
      if ((res as any).availableCompanies) {
        this.availableCompanies.set((res as any).availableCompanies);
      }
    });
  }
}
