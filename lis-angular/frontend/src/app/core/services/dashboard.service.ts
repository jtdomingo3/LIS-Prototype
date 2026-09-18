import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { DashboardStats } from '../models';
import { AppConfigService } from './app-config.service';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private get apiUrl() { return `${this.config.apiUrl}/dashboard`; }

  constructor(private http: HttpClient, private config: AppConfigService) {}

  getStats(date?: string): Observable<DashboardStats> {
    const url = date ? `${this.apiUrl}?date=${date}` : this.apiUrl;
    return this.http.get<DashboardStats>(url);
  }
}
