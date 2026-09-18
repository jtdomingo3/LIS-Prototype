import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AppConfigService } from '../../core/services/app-config.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-header">
      <h1>Settings</h1>
    </div>

    @if (loading()) {
      <div class="loading">Loading settings...</div>
    } @else {
      <div class="settings-grid">
        <div class="card">
          <h3>Laboratory Info</h3>
          <div class="form-group">
            <label class="form-label">Lab Name</label>
            <input type="text" class="form-control" [(ngModel)]="settings['lab_name']" />
          </div>
          <div class="form-group">
            <label class="form-label">Address</label>
            <input type="text" class="form-control" [(ngModel)]="settings['lab_address']" />
          </div>
          <div class="form-group">
            <label class="form-label">Phone</label>
            <input type="text" class="form-control" [(ngModel)]="settings['lab_phone']" />
          </div>
          <div class="form-group">
            <label class="form-label">License Number</label>
            <input type="text" class="form-control" [(ngModel)]="settings['lab_license']" />
          </div>
          <button class="btn btn-primary" (click)="save()" [disabled]="saving()">
            {{ saving() ? 'Saving...' : 'Save Settings' }}
          </button>
        </div>

        <div class="card">
          <h3>Database</h3>
          <div class="db-actions">
            <button class="btn" (click)="backup()" [disabled]="backingUp()">
              {{ backingUp() ? 'Creating...' : 'Create Backup' }}
            </button>
            <button class="btn" (click)="exportData()">Export Data (JSON)</button>
          </div>

          @if (backupMessage()) {
            <div class="alert alert-success" style="margin-top: 1rem;">{{ backupMessage() }}</div>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    .settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; align-items: start; }
    @media (max-width: 768px) { .settings-grid { grid-template-columns: 1fr; } }
    h3 { font-size: 1.1rem; font-weight: 600; margin-bottom: 1rem; }
    .db-actions { display: flex; gap: 0.75rem; flex-wrap: wrap; }
    .loading { text-align: center; padding: 3rem; color: #6b7280; }
    .alert-success { background: #d1fae5; color: #065f46; padding: 0.75rem; border-radius: 6px; }
  `]
})
export class SettingsComponent implements OnInit {
  private http = inject(HttpClient);
  private cfg = inject(AppConfigService);
  private get api() { return this.cfg.apiUrl + '/settings'; }

  settings: Record<string, string> = {};
  loading = signal(true);
  saving = signal(false);
  backingUp = signal(false);
  backupMessage = signal('');

  ngOnInit() {
    this.http.get<any>(this.api).subscribe({
      next: (res) => {
        this.settings = res.settings || {};
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  save() {
    this.saving.set(true);
    this.http.put(this.api, this.settings).subscribe({
      next: () => this.saving.set(false),
      error: () => this.saving.set(false)
    });
  }

  backup() {
    this.backingUp.set(true);
    this.backupMessage.set('');
    this.http.post<any>(this.api + '/backup', {}).subscribe({
      next: (res) => {
        this.backupMessage.set(res.message || 'Backup created');
        this.backingUp.set(false);
      },
      error: () => this.backingUp.set(false)
    });
  }

  exportData() {
    window.open(this.api + '/export', '_blank');
  }
}
