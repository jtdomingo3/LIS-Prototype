import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PatientService } from '../../../core/services/patient.service';
import { Patient, Test } from '../../../core/models';

@Component({
  selector: 'app-patient-detail',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    @if (loading()) {
      <div class="loading">Loading...</div>
    } @else if (patient()) {
      <div class="page-header">
        <h1>{{ patient()!.first_name }} {{ patient()!.last_name }}</h1>
        <div class="header-actions">
          <a [routerLink]="['/patients', patient()!.id, 'edit']" class="btn btn-sm btn-warning">Edit</a>
          <a routerLink="/patients" class="btn btn-sm btn-outline">← Back</a>
        </div>
      </div>

      <div class="detail-grid">
        <div class="card">
          <h3>Patient Info</h3>
          <dl>
            <dt>Patient ID</dt><dd>{{ patient()!.patient_id }}</dd>
            <dt>Patient Code</dt><dd>{{ patient()!.patient_code }}</dd>
            <dt>Full Name</dt><dd>{{ patient()!.first_name }} {{ patient()!.middle_name || '' }} {{ patient()!.last_name }}</dd>
            <dt>Age / Gender</dt><dd>{{ patient()!.age_manual || patient()!.age || '—' }} / {{ patient()!.gender || patient()!.sex || '—' }}</dd>
            <dt>Date of Birth</dt><dd>{{ patient()!.date_of_birth || patient()!.birthday || '—' }}</dd>
            <dt>Phone</dt><dd>{{ patient()!.phone || '—' }}</dd>
            <dt>Address</dt><dd>{{ patient()!.address || '—' }}</dd>
            <dt>Company</dt><dd>{{ patient()!.company || '—' }}</dd>
            <dt>Physician</dt><dd>{{ patient()!.physician || '—' }}</dd>
            <dt>PhilHealth</dt><dd>{{ patient()!.philhealth_consent ? 'Yes — ' + (patient()!.philhealth_id || 'No ID') : 'No' }}</dd>
            <dt>Registered</dt><dd>{{ patient()!.created_at | date:'medium' }}</dd>
          </dl>
        </div>

        <div class="card">
          <div class="card-header-row">
            <h3>Tests ({{ tests().length }})</h3>
            <a [routerLink]="['/tests/new']" [queryParams]="{ patientId: patient()!.id }" class="btn btn-sm btn-primary">+ New Test</a>
          </div>

          @if (tests().length) {
            <table class="table">
              <thead>
                <tr><th>Test ID</th><th>Type</th><th>Status</th><th>Date</th><th></th></tr>
              </thead>
              <tbody>
                @for (t of tests(); track t.id) {
                  <tr>
                    <td>{{ t.test_id }}</td>
                    <td>{{ t.test_type }}</td>
                    <td><span class="badge" [class]="'badge-' + t.status">{{ t.status }}</span></td>
                    <td>{{ t.created_at | date:'shortDate' }}</td>
                    <td class="action-cell">
                      <a [routerLink]="['/tests', t.id]" class="btn btn-sm btn-primary">View</a>
                      @if (t.status === 'Completed' || t.status === 'Released') {
                        <a [routerLink]="['/reports', t.id]" class="btn btn-sm btn-primary">Report</a>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          } @else {
            <p class="empty">No tests for this patient.</p>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    .detail-grid { display: grid; grid-template-columns: 350px 1fr; gap: 1.5rem; align-items: start; }
    @media (max-width: 900px) { .detail-grid { grid-template-columns: 1fr; } }
    dl { display: grid; grid-template-columns: 120px 1fr; gap: 0.5rem 1rem; margin-top: 1rem; }
    dt { font-size: 0.8rem; color: #6b7280; font-weight: 500; }
    dd { margin: 0; font-size: 0.875rem; }
    .card-header-row { display: flex; justify-content: space-between; align-items: center; }
    h3 { font-size: 1.05rem; font-weight: 600; margin: 0; }
    .empty { text-align: center; padding: 2rem; color: #9ca3af; }
    .header-actions { display: flex; gap: 0.5rem; }
    .loading { text-align: center; padding: 3rem; color: #6b7280; }
    .action-cell { display: flex; gap: 0.35rem; }
  `]
})
export class PatientDetailComponent implements OnInit {
  private patientService = inject(PatientService);
  private route = inject(ActivatedRoute);

  patient = signal<Patient | null>(null);
  tests = signal<Test[]>([]);
  loading = signal(true);

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.patientService.getById(id).subscribe({
      next: (res) => {
        this.patient.set(res.patient);
        this.tests.set(res.tests || []);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }
}
