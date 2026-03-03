import { Routes } from '@angular/router';
import { authGuard, guestGuard, permissionGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent),
  },
  {
    path: 'dashboard',
    canActivate: [authGuard, permissionGuard('dashboard')],
    loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
  },
  {
    path: 'patients',
    canActivate: [authGuard, permissionGuard('patients')],
    children: [
      {
        path: '',
        loadComponent: () => import('./features/patients/list/patient-list.component').then(m => m.PatientListComponent),
      },
      {
        path: 'new',
        loadComponent: () => import('./features/patients/form/patient-form.component').then(m => m.PatientFormComponent),
      },
      {
        path: ':id',
        loadComponent: () => import('./features/patients/detail/patient-detail.component').then(m => m.PatientDetailComponent),
      },
      {
        path: ':id/edit',
        loadComponent: () => import('./features/patients/form/patient-form.component').then(m => m.PatientFormComponent),
      },
    ],
  },
  {
    path: 'tests',
    canActivate: [authGuard, permissionGuard('tests')],
    children: [
      {
        path: '',
        loadComponent: () => import('./features/tests/list/test-list.component').then(m => m.TestListComponent),
      },
      {
        path: 'new',
        loadComponent: () => import('./features/tests/form/test-form.component').then(m => m.TestFormComponent),
      },
      {
        path: ':id',
        loadComponent: () => import('./features/tests/detail/test-detail.component').then(m => m.TestDetailComponent),
      },
      {
        path: ':id/results',
        loadComponent: () => import('./features/tests/result-entry/result-entry.component').then(m => m.ResultEntryComponent),
      },
    ],
  },
  {
    path: 'kiosk',
    loadComponent: () => import('./features/reception/kiosk/kiosk.component').then(m => m.KioskComponent),
  },
  {
    path: 'reception',
    canActivate: [authGuard, permissionGuard('reception')],
    children: [
      {
        path: '',
        loadComponent: () => import('./features/reception/overview/reception-overview.component').then(m => m.ReceptionOverviewComponent),
      },
      {
        path: 'area/:name',
        loadComponent: () => import('./features/reception/area-queue/area-queue.component').then(m => m.AreaQueueComponent),
      },
    ],
  },
  {
    path: 'reports',
    canActivate: [authGuard, permissionGuard('reports')],
    children: [
      {
        path: '',
        loadComponent: () => import('./features/reports/report-list/report-list.component').then(m => m.ReportListComponent),
      },
      {
        path: 'worksheet',
        loadComponent: () => import('./features/reports/worksheet/worksheet.component').then(m => m.WorksheetComponent),
      },
    ],
  },
  {
    path: 'signatures',
    canActivate: [authGuard, permissionGuard('reports')],
    loadComponent: () => import('./features/signatures/signature-list.component').then(m => m.SignatureListComponent),
  },
  {
    path: 'templates',
    canActivate: [authGuard, permissionGuard('templates')],
    children: [
      {
        path: '',
        loadComponent: () => import('./features/templates/list/template-list.component').then(m => m.TemplateListComponent),
      },
      {
        path: 'new',
        loadComponent: () => import('./features/templates/form/template-form.component').then(m => m.TemplateFormComponent),
      },
      {
        path: ':id/edit',
        loadComponent: () => import('./features/templates/form/template-form.component').then(m => m.TemplateFormComponent),
      },
    ],
  },
  {
    path: 'users',
    canActivate: [authGuard, permissionGuard('users')],
    children: [
      {
        path: '',
        loadComponent: () => import('./features/users/list/user-list.component').then(m => m.UserListComponent),
      },
      {
        path: 'new',
        loadComponent: () => import('./features/users/form/user-form.component').then(m => m.UserFormComponent),
      },
      {
        path: ':id/edit',
        loadComponent: () => import('./features/users/form/user-form.component').then(m => m.UserFormComponent),
      },
    ],
  },
  {
    path: 'profile',
    canActivate: [authGuard],
    loadComponent: () => import('./features/users/profile/profile.component').then(m => m.ProfileComponent),
  },
  {
    path: 'settings',
    canActivate: [authGuard, permissionGuard('users')],
    loadComponent: () => import('./features/settings/settings.component').then(m => m.SettingsComponent),
  },
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: '**', redirectTo: '/dashboard' },
];
