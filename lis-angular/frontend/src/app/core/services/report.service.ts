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

  getPrintMultipleUrl(ids: string[]): string {
    const token = this.auth.token || '';
    const qs = ids.map(id => `ids[]=${encodeURIComponent(id)}`).join('&');
    return `${this.config.apiUrl}/reports/print-multiple-get?${qs}&token=${encodeURIComponent(token)}`;
  }

  /**
   * Safe multi-report printing via dynamic HTML form POST.
   * This prevents HTTP 431 "Request Header Fields Too Large" errors
   * when trying to print a large list of filtered reports.
   */
  printMultiplePost(ids: string[]): void {
    const token = this.auth.token || '';
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = `${this.config.apiUrl}/reports/print-multiple`;
    form.target = '_blank';

    // Add token parameter for authorization
    const tokenInput = document.createElement('input');
    tokenInput.type = 'hidden';
    tokenInput.name = 'token';
    tokenInput.value = token;
    form.appendChild(tokenInput);

    // Add each ID as an ids[] field
    for (const id of ids) {
      const idInput = document.createElement('input');
      idInput.type = 'hidden';
      idInput.name = 'ids[]';
      idInput.value = id;
      form.appendChild(idInput);
    }

    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
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
