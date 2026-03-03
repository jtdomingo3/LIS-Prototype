import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { UserService } from '../../../core/services/user.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-header">
      <h1>My Profile</h1>
    </div>

    <div class="card" style="max-width: 600px;">
      @if (error()) { <div class="alert alert-error">{{ error() }}</div> }
      @if (success()) { <div class="alert alert-success">{{ success() }}</div> }

      <form (ngSubmit)="onSubmit()">
        <div class="form-group">
          <label class="form-label">Name</label>
          <input type="text" class="form-control" [(ngModel)]="name" name="name" required />
        </div>
        <div class="form-group">
          <label class="form-label">Email</label>
          <input type="email" class="form-control" [value]="auth.currentUser()?.email" disabled />
          <small class="hint">Email cannot be changed</small>
        </div>
        <div class="form-group">
          <label class="form-label">Role</label>
          <input type="text" class="form-control" [value]="auth.currentUser()?.role" disabled />
        </div>

        <h3 style="margin-top: 1.5rem;">Change Password</h3>
        <div class="form-group">
          <label class="form-label">Current Password</label>
          <input type="password" class="form-control" [(ngModel)]="currentPassword" name="currentPassword" />
        </div>
        <div class="form-group">
          <label class="form-label">New Password</label>
          <input type="password" class="form-control" [(ngModel)]="newPassword" name="newPassword" />
        </div>
        <div class="form-group">
          <label class="form-label">Confirm New Password</label>
          <input type="password" class="form-control" [(ngModel)]="confirmPassword" name="confirmPassword" />
        </div>

        <div class="form-actions">
          <button type="submit" class="btn btn-primary" [disabled]="saving()">
            {{ saving() ? 'Saving...' : 'Update Profile' }}
          </button>
        </div>
      </form>
    </div>
  `,
  styles: [`
    .form-actions { margin-top: 1.5rem; }
    .hint { font-size: 0.75rem; color: #9ca3af; }
    .alert-success { background: #d1fae5; color: #065f46; padding: 0.75rem; border-radius: 6px; margin-bottom: 1rem; }
  `]
})
export class ProfileComponent implements OnInit {
  auth = inject(AuthService);
  private userService = inject(UserService);

  name = '';
  currentPassword = '';
  newPassword = '';
  confirmPassword = '';
  saving = signal(false);
  error = signal('');
  success = signal('');

  ngOnInit() {
    this.name = this.auth.currentUser()?.name || '';
  }

  onSubmit() {
    this.error.set('');
    this.success.set('');

    if (this.newPassword && this.newPassword !== this.confirmPassword) {
      this.error.set('New passwords do not match'); return;
    }

    this.saving.set(true);
    const data: any = { name: this.name };
    if (this.newPassword) {
      data.currentPassword = this.currentPassword;
      data.newPassword = this.newPassword;
    }

    this.userService.updateProfile(data).subscribe({
      next: () => {
        this.success.set('Profile updated successfully');
        this.saving.set(false);
        this.currentPassword = '';
        this.newPassword = '';
        this.confirmPassword = '';
      },
      error: (err) => {
        this.error.set(err.error?.error || 'Failed to update profile');
        this.saving.set(false);
      }
    });
  }
}
