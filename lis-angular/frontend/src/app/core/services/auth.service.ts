import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, catchError, of } from 'rxjs';
import { User, LoginResponse, UserPermissions } from '../models';
import { AppConfigService } from './app-config.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private get apiUrl() { return `${this.config.apiUrl}/auth`; }

  // Reactive signals for auth state
  private currentUserSignal = signal<User | null>(null);
  private tokenSignal = signal<string | null>(null);

  readonly currentUser = this.currentUserSignal.asReadonly();
  readonly isAuthenticated = computed(() => !!this.tokenSignal());

  constructor(private http: HttpClient, private router: Router, private config: AppConfigService) {
    // Restore from localStorage on init
    const savedToken = localStorage.getItem('lis_token');
    const savedUser = localStorage.getItem('lis_user');
    if (savedToken && savedUser) {
      try {
        this.tokenSignal.set(savedToken);
        this.currentUserSignal.set(JSON.parse(savedUser));
      } catch {
        this.clearAuth();
      }
    }
  }

  get token(): string | null {
    return this.tokenSignal();
  }

  get user(): User | null {
    return this.currentUserSignal();
  }

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.apiUrl}/login`, { email, password }).pipe(
      tap(response => {
        this.tokenSignal.set(response.token);
        this.currentUserSignal.set(response.user);
        localStorage.setItem('lis_token', response.token);
        localStorage.setItem('lis_user', JSON.stringify(response.user));
      })
    );
  }

  logout(): void {
    this.clearAuth();
    this.router.navigate(['/login']);
  }

  refreshProfile(): Observable<{ user: User }> {
    return this.http.get<{ user: User }>(`${this.apiUrl}/me`).pipe(
      tap(response => {
        this.currentUserSignal.set(response.user);
        localStorage.setItem('lis_user', JSON.stringify(response.user));
      })
    );
  }

  hasPermission(perm: keyof UserPermissions): boolean {
    const user = this.currentUserSignal();
    if (!user) return false;
    if (user.role === 'Admin') return true;
    return !!(user.permissions && user.permissions[perm]);
  }

  hasRole(...roles: string[]): boolean {
    const user = this.currentUserSignal();
    if (!user) return false;
    if (user.role === 'Admin') return true;
    return roles.includes(user.role);
  }

  private clearAuth(): void {
    this.tokenSignal.set(null);
    this.currentUserSignal.set(null);
    localStorage.removeItem('lis_token');
    localStorage.removeItem('lis_user');
  }
}
