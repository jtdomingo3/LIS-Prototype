import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <header class="header">
      <div class="header-left">
        <h1 class="page-title">{{ pageTitle }}</h1>
      </div>
      <div class="header-right">
        @if (auth.currentUser(); as user) {
          <div class="user-info">
            <p class="user-status">
              Logged in as: <strong class="user-name">{{ user.name }}</strong> ({{ user.role }})
            </p>
            <p class="clinic-sub">Clinic: Gezyne Clinical Laboratory</p>
          </div>
          <a routerLink="/profile" class="profile-btn" title="View Profile">
            <i class="fa fa-user"></i>
          </a>
        }
      </div>
    </header>
  `,
  styles: [`
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 28px;
      background: rgba(255, 255, 255, 0.75);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      padding: 16px 28px;
      border-radius: 16px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.6);
      position: sticky;
      top: 0;
      z-index: 50;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .page-title {
      font-size: 1.8em;
      font-weight: 700;
      color: var(--primary-black);
      letter-spacing: -0.5px;
      margin: 0;
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .user-info {
      text-align: right;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 3px;
    }

    .user-status {
      margin: 0;
      color: var(--primary-black);
      font-weight: 600;
      font-size: 1.05em;
    }

    .user-name {
      color: var(--secondary-green-dark);
    }

    .clinic-sub {
      margin: 0;
      color: var(--text-gray);
      font-size: 0.9em;
      font-weight: 500;
    }

    .profile-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: #ffffff;
      color: var(--text-dark);
      border: 1px solid var(--border-gray);
      font-size: 1.1em;
      transition: all 0.2s ease;
      text-decoration: none;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
    }

    .profile-btn:hover {
      background: var(--secondary-green);
      color: #ffffff;
      border-color: var(--secondary-green-dark);
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.3);
    }
  `]
})
export class HeaderComponent implements OnInit, OnDestroy {
  auth = inject(AuthService);
  private router = inject(Router);

  pageTitle = 'Dashboard';

  ngOnInit() {
    this.updateTitle();
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        this.updateTitle();
      });
  }

  ngOnDestroy() {}

  private updateTitle() {
    const url = this.router.url.split('?')[0];
    if (url.includes('/consultations')) {
      this.pageTitle = 'Clinical Consultations';
    } else if (url.includes('/patients')) {
      this.pageTitle = 'Patients';
    } else if (url.includes('/reception')) {
      this.pageTitle = 'Reception';
    } else if (url.includes('/tests')) {
      this.pageTitle = 'Tests & Results';
    } else if (url.includes('/reports/worksheet')) {
      this.pageTitle = 'Worksheet';
    } else if (url.includes('/reports')) {
      this.pageTitle = 'Reports';
    } else if (url.includes('/inventory')) {
      this.pageTitle = 'Inventory';
    } else if (url.includes('/equipment')) {
      this.pageTitle = 'Equipment & QC';
    } else if (url.includes('/signatures')) {
      this.pageTitle = 'Signatures';
    } else if (url.includes('/templates')) {
      this.pageTitle = 'Templates';
    } else if (url.includes('/users')) {
      this.pageTitle = 'Users';
    } else if (url.includes('/settings')) {
      this.pageTitle = 'Settings';
    } else if (url.includes('/chatbot')) {
      this.pageTitle = 'GezyneBot AI';
    } else if (url.includes('/profile')) {
      this.pageTitle = 'Profile';
    } else {
      this.pageTitle = 'Dashboard';
    }
  }
}
