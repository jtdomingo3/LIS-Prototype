import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <header class="top-header">
      <div class="header-left">
        <h1 class="page-title">{{ getPageTitle() }}</h1>
      </div>
      <div class="header-right">
        @if (auth.currentUser(); as user) {
          <div class="user-info">
            <div class="user-details">
              <p class="welcome-text">Welcome, <a routerLink="/profile" class="user-link">{{ user.name }}</a></p>
              <p class="datetime">{{ currentDate }} {{ currentTime }}</p>
            </div>
            <a routerLink="/profile" class="profile-btn" title="Profile">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M12 12c2.761 0 5-2.239 5-5s-2.239-5-5-5-5 2.239-5 5 2.239 5 5 5z" fill="currentColor" opacity="0.9" />
                <path d="M2.5 21c0-3.59 3.91-6.5 8.5-6.5s8.5 2.91 8.5 6.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none" opacity="0.9" />
              </svg>
            </a>
          </div>
        }
      </div>
    </header>
  `,
  styles: [`
    .top-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 20px 25px;
      background: #fff;
      border-radius: 0;
      box-shadow: 0 2px 10px rgba(0,0,0,0.08);
      border-left: 5px solid #10b981;
      min-height: 60px;
    }

    .page-title {
      font-size: 1.6em;
      font-weight: 700;
      background: linear-gradient(135deg, #1a1a1a 0%, #10b981 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .user-info {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .user-details {
      text-align: right;
    }

    .welcome-text {
      margin: 0;
      color: #10b981;
      font-weight: 600;
      font-size: 1em;
    }

    .user-link {
      color: inherit;
      text-decoration: none;
      font-weight: 600;
    }

    .user-link:hover {
      text-decoration: underline;
    }

    .datetime {
      margin: 2px 0 0;
      color: #9ca3af;
      font-size: 0.85em;
    }

    .profile-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 6px 8px;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: white;
      border-radius: 6px;
      transition: all 0.3s;
    }

    .profile-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
    }
  `]
})
export class HeaderComponent {
  auth = inject(AuthService);
  currentDate = '';
  currentTime = '';
  private intervalId: any;

  ngOnInit() {
    this.updateDateTime();
    this.intervalId = setInterval(() => this.updateDateTime(), 1000);
  }

  ngOnDestroy() {
    if (this.intervalId) clearInterval(this.intervalId);
  }

  updateDateTime() {
    const now = new Date();
    this.currentDate = now.toLocaleDateString();
    this.currentTime = now.toLocaleTimeString();
  }

  getPageTitle(): string {
    // Simple title from URL
    const path = window.location.pathname.split('/').filter(Boolean);
    if (path.length === 0) return 'Dashboard';
    return path[0].charAt(0).toUpperCase() + path[0].slice(1);
  }
}
