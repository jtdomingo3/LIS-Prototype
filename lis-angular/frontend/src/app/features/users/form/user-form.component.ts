import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { UserService } from '../../../core/services/user.service';

@Component({
  selector: 'app-user-form',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page-header">
      <h1>{{ isEdit() ? 'Edit User' : 'New User' }}</h1>
      <a routerLink="/users" class="btn btn-outline">← Back</a>
    </div>

    <div class="card">
      @if (error()) { <div class="alert alert-error">{{ error() }}</div> }

      <form (ngSubmit)="onSubmit()">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Name *</label>
            <input type="text" class="form-control" [(ngModel)]="form.name" name="name" required />
          </div>
          <div class="form-group">
            <label class="form-label">Email *</label>
            <input type="email" class="form-control" [(ngModel)]="form.email" name="email" required />
          </div>
        </div>

        @if (!isEdit()) {
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Password *</label>
              <input type="password" class="form-control" [(ngModel)]="form.password" name="password" required />
            </div>
            <div class="form-group">
              <label class="form-label">Confirm Password *</label>
              <input type="password" class="form-control" [(ngModel)]="confirmPassword" name="confirmPassword" required />
            </div>
          </div>
        }

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Role *</label>
            <select class="form-control" [(ngModel)]="form.role" name="role" required>
              <option value="">Select role</option>
              <option value="admin">Admin</option>
              <option value="supervisor">Supervisor</option>
              <option value="technologist">Technologist</option>
              <option value="receptionist">Receptionist</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">License Number</label>
            <input type="text" class="form-control" [(ngModel)]="form.license_number" name="license_number" />
          </div>
        </div>

        <div class="form-group">
          <label class="checkbox-label">
            <input type="checkbox" [(ngModel)]="form.active" name="active" />
            Active
          </label>
        </div>

        <div class="form-actions">
          <button type="submit" class="btn btn-primary" [disabled]="saving()">
            {{ saving() ? 'Saving...' : (isEdit() ? 'Update User' : 'Create User') }}
          </button>
          @if (isEdit()) {
            <button type="button" class="btn btn-warning" (click)="resetPassword()">Reset Password</button>
          }
          <a routerLink="/users" class="btn btn-outline">Cancel</a>
        </div>
      </form>
    </div>
  `,
  styles: [`
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .form-actions { margin-top: 1.5rem; display: flex; gap: 0.75rem; }
    .checkbox-label { display: flex; align-items: center; gap: 0.5rem; cursor: pointer; }
    .btn-warning { background: #f59e0b; color: white; }
    .btn-warning:hover { background: #d97706; }
  `]
})
export class UserFormComponent implements OnInit {
  private userService = inject(UserService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  isEdit = signal(false);
  saving = signal(false);
  error = signal('');
  userId = '';
  confirmPassword = '';

  form: any = {
    name: '', email: '', password: '', role: '', license_number: '', active: true
  };

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id && id !== 'new') {
      this.isEdit.set(true);
      this.userId = id;
      this.userService.getById(id).subscribe({
        next: (res) => {
          const u = res.user;
          this.form.name = u.name || '';
          this.form.email = u.email || '';
          this.form.role = u.role || '';
          this.form.license_number = u.license_number || '';
          this.form.active = u.active !== false;
        },
        error: () => this.error.set('Failed to load user')
      });
    }
  }

  onSubmit() {
    if (!this.form.name || !this.form.email || !this.form.role) {
      this.error.set('Name, email, and role are required'); return;
    }
    if (!this.isEdit() && (!this.form.password || this.form.password !== this.confirmPassword)) {
      this.error.set('Passwords do not match'); return;
    }

    this.saving.set(true);
    this.error.set('');

    const data = { ...this.form };
    if (this.isEdit()) delete data.password;

    const obs = this.isEdit()
      ? this.userService.update(this.userId, data)
      : this.userService.create(data);

    obs.subscribe({
      next: () => this.router.navigate(['/users']),
      error: (err) => { this.error.set(err.error?.error || 'Failed to save'); this.saving.set(false); }
    });
  }

  resetPassword() {
    const newPw = prompt('Enter new password:');
    if (!newPw) return;
    this.userService.resetPassword(this.userId, newPw).subscribe({
      next: () => alert('Password reset successfully'),
      error: (err) => alert(err.error?.error || 'Failed to reset password')
    });
  }
}
