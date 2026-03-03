import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Patient, Test } from '../models';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class PatientService {
  private readonly apiUrl = `${environment.apiUrl}/patients`;

  constructor(private http: HttpClient) {}

  getAll(options: {
    page?: number;
    limit?: number;
    search?: string;
    date?: string;
    company?: string;
    sortBy?: string;
    sortOrder?: string;
  }): Observable<{ patients: Patient[]; total: number; page: number; limit: number; pagination: { totalPages: number } }> {
    let params = new HttpParams();
    if (options.page) params = params.set('page', options.page.toString());
    if (options.limit) params = params.set('limit', options.limit.toString());
    if (options.search) params = params.set('search', options.search);
    if (options.date) params = params.set('date', options.date);
    if (options.company) params = params.set('company', options.company);
    if (options.sortBy) params = params.set('sortBy', options.sortBy);
    if (options.sortOrder) params = params.set('sortOrder', options.sortOrder);

    return this.http.get<any>(this.apiUrl, { params });
  }

  getById(id: string): Observable<{ patient: Patient; tests: Test[] }> {
    return this.http.get<{ patient: Patient; tests: Test[] }>(`${this.apiUrl}/${id}`);
  }

  create(data: Partial<Patient>): Observable<{ patient: Patient }> {
    return this.http.post<{ patient: Patient }>(this.apiUrl, data);
  }

  update(id: string, data: Partial<Patient>): Observable<{ patient: Patient }> {
    return this.http.put<{ patient: Patient }>(`${this.apiUrl}/${id}`, data);
  }

  delete(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/${id}`);
  }
}
