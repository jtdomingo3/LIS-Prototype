import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Test } from '../models';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ReceptionService {
  private readonly apiUrl = `${environment.apiUrl}/reception`;

  constructor(private http: HttpClient) {}

  getOverview(): Observable<{ areas: Record<string, number> }> {
    return this.http.get<any>(this.apiUrl);
  }

  getAreaQueue(areaName: string): Observable<{ queue: any[] }> {
    return this.http.get<any>(`${this.apiUrl}/area/${encodeURIComponent(areaName)}`);
  }

  completeArea(testId: string, area: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/complete`, { testIds: [testId], area });
  }

  subscribeEvents(): EventSource {
    return new EventSource(`${environment.apiUrl}/reception/events`);
  }

  assignTest(data: {
    testId: string;
    area: string;
    specimenNumber?: string;
    doctorId?: string;
    doctorName?: string;
  }): Observable<{ test: Test }> {
    return this.http.post<{ test: Test }>(`${this.apiUrl}/assign`, data);
  }

  completeTests(data: {
    testIds?: string[];
    patientId?: string;
    area: string;
    nextArea?: string;
  }): Observable<{ updated: Test[]; count: number }> {
    return this.http.post<{ updated: Test[]; count: number }>(`${this.apiUrl}/complete`, data);
  }

  getAssignedData(): Observable<{ areas: Record<string, any[]> }> {
    return this.http.get<{ areas: Record<string, any[]> }>(`${this.apiUrl}/assigned-data`);
  }

  /**
   * SSE connection for live updates.
   * Returns an EventSource — caller is responsible for closing it.
   */
  connectSSE(): EventSource {
    const token = localStorage.getItem('lis_token');
    return new EventSource(`${environment.apiUrl}/reception/events`);
  }
}
