import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AppConfigService } from './app-config.service';
import { AuthService } from './auth.service';

export interface NavItem {
  id: string;
  testId: string;
  testType: string;
  testDate: string;
  patientName: string;
  patientCode: string;
}

@Injectable({ providedIn: 'root' })
export class ReportService {
  private get apiUrl() { return `${this.config.apiUrl}/reports`; }

  constructor(
    private http: HttpClient,
    private config: AppConfigService,
    private auth: AuthService
  ) {}

  getAll(options: {
    search?: string;
    testType?: string;
    date?: string;
    page?: number;
    limit?: number;
  } = {}): Observable<any> {
    let params = new HttpParams();
    if (options.search) params = params.set('search', options.search);
    if (options.testType) params = params.set('testType', options.testType);
    if (options.date) params = params.set('date', options.date);
    if (options.page) params = params.set('page', options.page.toString());
    if (options.limit) params = params.set('limit', options.limit.toString());
    return this.http.get<any>(this.apiUrl, { params });
  }

  getById(id: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/${id}`);
  }

  getReportHtml(id: string, print = false): Observable<string> {
    const url = `${this.apiUrl}/${id}/html${print ? '?print=1' : ''}`;
    return this.http.get(url, { responseType: 'text' });
  }

  /**
   * Returns a direct URL to open in a new tab for print/PDF.
   * The server adds window.print() auto-trigger when print=1.
   * No blob creation needed — the tab loads the report and auto-prints.
   */
  getPrintUrl(id: string): string {
    const token = this.auth.token || '';
    return `${this.config.apiUrl}/reports/${id}/html?print=1&token=${encodeURIComponent(token)}`;
  }

  /**
   * Returns a direct URL that loads multiple reports for printing.
   * Requires the ids as a query param (GET version, server must support it)
   * or falls back to blob for the POST version.
   */
  getPrintMultipleUrl(ids: string[]): string {
    const token = this.auth.token || '';
    const qs = ids.map(id => `ids[]=${encodeURIComponent(id)}`).join('&');
    return `${this.config.apiUrl}/reports/print-multiple-get?${qs}&token=${encodeURIComponent(token)}`;
  }

  /** Lightweight nav list — all completed tests for client-side filtering */
  getNav(): Observable<{ items: NavItem[]; patients: string[]; testTypes: string[]; total: number }> {
    return this.http.get<any>(`${this.apiUrl}/nav`);
  }

  /** Concatenated HTML for printing multiple reports */
  printMultiple(ids: string[]): Observable<string> {
    return this.http.post(`${this.apiUrl}/print-multiple`, { ids }, { responseType: 'text' });
  }

  getWorksheetTypes(): Observable<{ types: string[]; companies: string[] }> {
    return this.http.get<{ types: string[]; companies: string[] }>(`${this.apiUrl}/worksheet/types`);
  }

  worksheetPreview(data: { testType: string; dateFrom?: string; dateTo?: string }): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/worksheet/preview`, data);
  }

  worksheetDownload(data: { testType: string; dateFrom?: string; dateTo?: string }): Observable<Blob> {
    return this.http.post(`${this.apiUrl}/worksheet/download`, data, { responseType: 'blob' });
  }

  // include optional company/philhealth fields for patient export filters
  patientExportPreview(data: { dateFrom?: string; dateTo?: string; company?: string; philhealth?: string; }): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/patient-export/preview`, data);
  }

  patientExportDownload(data: { dateFrom?: string; dateTo?: string; company?: string; philhealth?: string; }): Observable<Blob> {
    return this.http.post(`${this.apiUrl}/patient-export/download`, data, { responseType: 'blob' });
  }
}
