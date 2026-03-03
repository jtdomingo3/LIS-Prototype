import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="login-page">
      <div class="login-card">
        <div class="login-header">
          <img src="assets/gezyne-logo.png" alt="Gezyne Clinical Laboratory" class="login-logo" />
          <h2 class="lab-name">Gezyne Clinical Laboratory</h2>
          <p class="lab-subtitle">Laboratory Information System (LIS)</p>
        </div>

        @if (error) {
          <div class="alert alert-error">{{ error }}</div>
        }

        <form (ngSubmit)="onLogin()" class="login-form">
          <div class="form-group">
            <label for="email">Email Address</label>
            <input id="email" type="email" [(ngModel)]="email" name="email"
                   placeholder="Enter your email" required autofocus />
          </div>
          <div class="form-group">
            <label for="password">Password</label>
            <input id="password" type="password" [(ngModel)]="password" name="password"
                   placeholder="Enter password" required />
          </div>
          <button type="submit" class="btn btn-primary login-btn" [disabled]="loading">
            {{ loading ? 'Signing in...' : 'Login to Dashboard' }}
          </button>
        </form>

        <p class="login-footer">Professional Laboratory Information Management System</p>
      </div>
    </div>
  `,
  styles: [`
    .login-page {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: linear-gradient(135deg, #1a1a1a 0%, #0f0f0f 50%, #1a1a1a 100%);
    }

    .login-card {
      background: white;
      border-radius: 12px;
      padding: 2.5rem;
      width: 100%;
      max-width: 420px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
      border-top: 4px solid #10b981;
    }

    .login-header {
      text-align: center;
      margin-bottom: 2rem;
    }

    .login-logo {
      width: 120px;
      height: auto;
      object-fit: contain;
      border-radius: 6px;
      background: white;
      padding: 6px;
      box-shadow: 0 3px 10px rgba(0,0,0,0.12);
    }

    .lab-name {
      margin-top: 10px;
      color: #1a1a1a;
      font-weight: 800;
      font-size: 1.15rem;
    }

    .lab-subtitle {
      margin: 6px 0 0;
      color: #059669;
      font-weight: 700;
      letter-spacing: 0.6px;
      font-size: 0.9rem;
    }

    .login-btn {
      width: 100%;
      padding: 14px;
      font-size: 1rem;
      margin-top: 0.5rem;
    }

    .login-footer {
      text-align: center;
      color: #9ca3af;
      font-size: 0.85em;
      margin: 16px 0 0;
    }
  `]
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  email = '';
  password = '';
  error = '';
  loading = false;

  onLogin() {
    this.loading = true;
    this.error = '';

    this.auth.login(this.email, this.password).subscribe({
      next: () => {
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.error = err.error?.error || 'Login failed. Please try again.';
        this.loading = false;
      },
    });
  }
}
