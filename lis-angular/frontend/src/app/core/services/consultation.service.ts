import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Consultation } from '../models';
import { AppConfigService } from './app-config.service';

@Injectable({ providedIn: 'root' })
export class ConsultationService {
  private get apiUrl() { return `${this.config.apiUrl}/consultations`; }

  constructor(private http: HttpClient, private config: AppConfigService) {}

  getAll(options: {
    patient_id?: string;
    test_id?: string;
    status?: string;
    limit?: number;
    offset?: number;
  } = {}): Observable<{ consultations: Consultation[]; total: number }> {
    let params = new HttpParams();
    if (options.patient_id) params = params.set('patient_id', options.patient_id);
    if (options.test_id) params = params.set('test_id', options.test_id);
    if (options.status) params = params.set('status', options.status);
    if (options.limit) params = params.set('limit', options.limit.toString());
    if (options.offset) params = params.set('offset', options.offset.toString());

    return this.http.get<{ consultations: Consultation[]; total: number }>(this.apiUrl, { params });
  }

  getById(id: string): Observable<Consultation & { patient?: any; test?: any }> {
    return this.http.get<Consultation & { patient?: any; test?: any }>(`${this.apiUrl}/${id}`);
  }

  getByTestId(testId: string): Observable<Consultation & { patient?: any; test?: any }> {
    return this.http.get<Consultation & { patient?: any; test?: any }>(`${this.apiUrl}/by-test/${testId}`);
  }

  getByPatientId(patientId: string): Observable<Consultation[]> {
    return this.http.get<Consultation[]>(`${this.apiUrl}/by-patient/${patientId}`);
  }

  create(data: Partial<Consultation>): Observable<Consultation> {
    return this.http.post<Consultation>(this.apiUrl, data);
  }

  update(id: string, data: Partial<Consultation>): Observable<Consultation> {
    return this.http.put<Consultation>(`${this.apiUrl}/${id}`, data);
  }

  delete(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/${id}`);
  }

  getPrintData(id: string): Observable<{
    consultation: Consultation;
    patient: any;
    test: any;
    clinic: any;
  }> {
    return this.http.get<any>(`${this.apiUrl}/${id}/print-data`);
  }

  // DOH PhilPEN Asia-Pacific BMI Standard
  calculateBmi(weightKg: number | string | undefined, heightCm: number | string | undefined): { bmi: number | null; category: string } {
    const w = parseFloat(String(weightKg || ''));
    const h = parseFloat(String(heightCm || ''));
    if (!w || !h || isNaN(w) || isNaN(h) || w <= 0 || h <= 0) {
      return { bmi: null, category: '' };
    }
    const hM = h / 100.0;
    const val = +(w / (hM * hM)).toFixed(1);
    let cat = 'Normal';
    if (val < 18.5) cat = 'Underweight';
    else if (val <= 22.9) cat = 'Normal';
    else if (val <= 24.9) cat = 'Overweight';
    else if (val <= 29.9) cat = 'Obese I';
    else cat = 'Obese II';
    return { bmi: val, category: cat };
  }
}
