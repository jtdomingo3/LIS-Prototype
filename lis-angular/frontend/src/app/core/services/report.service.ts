import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AppConfigService } from './app-config.service';

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

  constructor(private http: HttpClient, private config: AppConfigService) {}

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
