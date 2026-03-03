import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Test, Patient } from '../models';
import { AppConfigService } from './app-config.service';

@Injectable({ providedIn: 'root' })
export class TestService {
  private get apiUrl() { return `${this.config.apiUrl}/tests`; }

  constructor(private http: HttpClient, private config: AppConfigService) {}

  getAll(options: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    test_type?: string;
    date?: string;
    patientId?: string;
    sortBy?: string;
    sortOrder?: string;
  } = {}): Observable<{ tests: Test[]; total: number; page: number; limit: number; pagination?: { totalPages: number } }> {
    let params = new HttpParams();
    Object.entries(options).forEach(([key, value]) => {
      if (value) params = params.set(key, value.toString());
    });

    return this.http.get<{ tests: Test[]; total: number; page: number; limit: number }>(this.apiUrl, { params });
  }

  getById(id: string): Observable<{ test: Test; patient: Patient }> {
    return this.http.get<{ test: Test; patient: Patient }>(`${this.apiUrl}/${id}`);
  }

  create(data: { patient_id: string; test_type?: string; test_types?: string[]; tests?: any[]; physician?: string }): Observable<{ tests: Test[] }> {
    return this.http.post<{ tests: Test[] }>(this.apiUrl, data);
  }

  update(id: string, data: Partial<Test>): Observable<{ test: Test }> {
    return this.http.put<{ test: Test }>(`${this.apiUrl}/${id}`, data);
  }

  updateResults(id: string, results: Record<string, any>): Observable<{ test: Test }> {
    return this.http.put<{ test: Test }>(`${this.apiUrl}/${id}/results`, { results });
  }

  updateStatus(id: string, status: string): Observable<{ test: Test }> {
    return this.http.put<{ test: Test }>(`${this.apiUrl}/${id}/status`, { status });
  }

  delete(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/${id}`);
  }
}
