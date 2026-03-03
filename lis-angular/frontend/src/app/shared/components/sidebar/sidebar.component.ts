import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  template: `
    <aside class="sidebar">
      <div class="brand">
        <img src="assets/gezyne-logo.png" alt="Gezyne Clinical Laboratory" class="brand-logo" />
        <div class="brand-text">Gezyne Clinical<br/>Laboratory</div>
      </div>

      <nav class="sidebar-nav">
        @if (auth.hasPermission('dashboard')) {
          <a routerLink="/dashboard" routerLinkActive="active" class="nav-item">
            <span class="nav-emoji">📊</span><span class="nav-text">Dashboard</span>
          </a>
        }
        @if (auth.hasPermission('patients')) {
          <a routerLink="/patients" routerLinkActive="active" class="nav-item">
            <span class="nav-emoji">👥</span><span class="nav-text">Patients</span>
          </a>
        }
        @if (auth.hasPermission('reception')) {
          <a routerLink="/reception" routerLinkActive="active" class="nav-item">
            <span class="nav-emoji">🏥</span><span class="nav-text">Reception</span>
          </a>
        }
        @if (auth.hasPermission('tests')) {
          <a routerLink="/tests" routerLinkActive="active" class="nav-item">
            <span class="nav-emoji">🧪</span><span class="nav-text">Tests & Results</span>
          </a>
        }
        @if (auth.hasPermission('reports')) {
          <a routerLink="/reports" routerLinkActive="active" class="nav-item">
            <span class="nav-emoji">📋</span><span class="nav-text">Reports</span>
          </a>
        }
        @if (auth.hasPermission('templates')) {
          <a routerLink="/templates" routerLinkActive="active" class="nav-item">
            <span class="nav-emoji">📄</span><span class="nav-text">Templates</span>
          </a>
        }
        @if (auth.hasPermission('users')) {
          <a routerLink="/users" routerLinkActive="active" class="nav-item">
            <span class="nav-emoji">👤</span><span class="nav-text">Users</span>
          </a>
        }
      </nav>

      <div class="sidebar-footer">
        <a routerLink="/settings" routerLinkActive="active" class="nav-item">
          <span class="nav-emoji">⚙️</span><span class="nav-text">Settings</span>
        </a>
        <button class="logout-btn" (click)="auth.logout()">
          <i class="fa fa-power-off"></i>
          <span>Logout</span>
        </button>
      </div>
    </aside>
  `,
  styles: [`
    .sidebar {
      width: 260px;
      min-width: 260px;
      background: linear-gradient(135deg, #1a1a1a 0%, #0f0f0f 100%);
      color: #fff;
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow-y: auto;
      padding: 20px;
      box-shadow: 4px 0 15px rgba(0,0,0,0.3);
      z-index: 100;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      justify-content: center;
      margin-bottom: 18px;
      padding-bottom: 14px;
      border-bottom: 3px solid #10b981;
    }

    .brand-logo {
      width: 48px;
      height: 48px;
      object-fit: contain;
      border-radius: 6px;
      background: white;
      padding: 4px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.12);
    }

    .brand-text {
      color: #f97316;
      font-weight: 700;
      font-size: 1.05em;
      text-align: left;
      line-height: 1.2;
    }

    .sidebar-nav {
      flex: 1;
      padding: 0.5rem 0;
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 16px;
      margin: 6px 0;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.3s ease;
      font-weight: 500;
      border-left: 4px solid transparent;
      color: #e5e7eb;
      text-decoration: none;
    }

    .nav-item:hover {
      background-color: rgba(16, 185, 129, 0.15);
      border-left-color: #10b981;
      transform: translateX(5px);
      color: #10b981;
    }

    .nav-item.active {
      background-color: #10b981;
      border-left-color: #f97316;
      color: #fff;
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
    }

    .nav-emoji {
      font-size: 1.1em;
      width: 28px;
      text-align: center;
    }

    .nav-text {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .sidebar-footer {
      padding-top: 10px;
      border-top: 1px solid rgba(255,255,255,0.1);
    }

    .logout-btn {
      margin-top: 8px;
      padding: 12px;
      background: #f97316;
      color: #fff;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      width: 100%;
      font-weight: 600;
      transition: all 0.3s;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      font-size: 0.95em;
    }

    .logout-btn:hover {
      background: #fb923c;
      transform: scale(1.02);
      box-shadow: 0 4px 12px rgba(249, 115, 22, 0.3);
    }
  `]
})
export class SidebarComponent {
  auth = inject(AuthService);
}
