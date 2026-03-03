import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SignatureService {
  private readonly apiUrl = `${environment.apiUrl}/signatures`;

  constructor(private http: HttpClient) {}

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

  applySignature(testId: string): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/${testId}/sign`, {});
  }
}
