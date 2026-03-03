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
        <select [(ngModel)]="gender" (change)="loadPatients()" class="form-control filter-select">
          <option value="">All Genders</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
        </select>
      </div>

      <table class="table">
        <thead>
          <tr>
            <th>Patient ID</th>
            <th>Name</th>
            <th>Age/Sex</th>
            <th>Phone</th>
            <th>Created</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          @for (p of patients(); track p.id) {
            <tr>
              <td><strong>{{ p.patient_code }}</strong></td>
              <td>{{ p.first_name }} {{ p.middle_name || '' }} {{ p.last_name }}</td>
              <td>{{ p.age || '—' }} / {{ (p.sex || '—') | uppercase }}</td>
              <td>{{ p.phone || '—' }}</td>
              <td>{{ p.created_at | date:'shortDate' }}</td>
              <td>
                <a [routerLink]="['/patients', p.id]" class="btn btn-sm">View</a>
                <a [routerLink]="['/patients', p.id, 'edit']" class="btn btn-sm">Edit</a>
              </td>
            </tr>
          } @empty {
            <tr><td colspan="6" class="text-center">No patients found</td></tr>
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
    .filter-bar { display: flex; gap: 0.75rem; margin-bottom: 1rem; }
    .search-input { flex: 1; }
    .filter-select { width: 150px; }
    .pagination { display: flex; align-items: center; justify-content: center; gap: 1rem; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #e5e7eb; }
    .text-center { text-align: center; color: #6b7280; padding: 2rem !important; }
  `]
})
export class PatientListComponent implements OnInit {
  private patientService = inject(PatientService);

  patients = signal<Patient[]>([]);
  page = signal(1);
  totalPages = signal(1);
  search = '';
  gender = '';
  private limit = 20;
  private debounceTimer: any;

  ngOnInit() { this.loadPatients(); }

  onSearch() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.page.set(1);
      this.loadPatients();
    }, 300);
  }

  changePage(delta: number) {
    this.page.update(p => p + delta);
    this.loadPatients();
  }

  loadPatients() {
    const params: any = { page: this.page(), limit: this.limit };
    if (this.search) params.search = this.search;
    if (this.gender) params.gender = this.gender;

    this.patientService.getAll(params).subscribe(res => {
      this.patients.set(res.patients);
      this.totalPages.set(res.pagination.totalPages || 1);
    });
  }
}
