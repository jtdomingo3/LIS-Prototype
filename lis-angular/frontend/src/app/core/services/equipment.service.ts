import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Equipment, EquipmentLog, QcControl, QcEntry, NeqasRecord } from '../models';
import { AppConfigService } from './app-config.service';

@Injectable({ providedIn: 'root' })
export class EquipmentService {
  private get apiUrl() { return `${this.config.apiUrl}/equipment`; }

  constructor(private http: HttpClient, private config: AppConfigService) {}

  getAll(options: { department?: string; status?: string; search?: string } = {}): Observable<Equipment[]> {
    let params = new HttpParams();
    if (options.department) params = params.set('department', options.department);
    if (options.status) params = params.set('status', options.status);
    if (options.search) params = params.set('search', options.search);

    return this.http.get<Equipment[]>(this.apiUrl, { params });
  }

  getById(id: string): Observable<Equipment> {
    return this.http.get<Equipment>(`${this.apiUrl}/${id}`);
  }

  create(data: Partial<Equipment>): Observable<Equipment> {
    return this.http.post<Equipment>(this.apiUrl, data);
  }

  update(id: string, data: Partial<Equipment>): Observable<Equipment> {
    return this.http.put<Equipment>(`${this.apiUrl}/${id}`, data);
  }

  delete(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/${id}`);
  }

  getLogs(id: string): Observable<EquipmentLog[]> {
    return this.http.get<EquipmentLog[]>(`${this.apiUrl}/${id}/logs`);
  }

  addLog(id: string, data: Partial<EquipmentLog>): Observable<EquipmentLog> {
    return this.http.post<EquipmentLog>(`${this.apiUrl}/${id}/logs`, data);
  }

  getQcControls(equipmentId?: string): Observable<QcControl[]> {
    let params = new HttpParams();
    if (equipmentId) params = params.set('equipment_id', equipmentId);
    return this.http.get<QcControl[]>(`${this.apiUrl}/qc/controls`, { params });
  }

  getQcEntries(controlId: string, analyteCode?: string): Observable<QcEntry[]> {
    let params = new HttpParams();
    if (analyteCode) params = params.set('analyte_code', analyteCode);
    return this.http.get<QcEntry[]>(`${this.apiUrl}/qc/entries/${controlId}`, { params });
  }

  addQcEntry(data: any): Observable<QcEntry> {
    return this.http.post<QcEntry>(`${this.apiUrl}/qc/entries`, data);
  }

  getNeqasRecords(year?: string): Observable<NeqasRecord[]> {
    let params = new HttpParams();
    if (year) params = params.set('year', year);
    return this.http.get<NeqasRecord[]>(`${this.apiUrl}/neqas/records`, { params });
  }
}
