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

  getLjAnalyzers(): Observable<Equipment[]> {
    return this.http.get<Equipment[]>(`${this.apiUrl}/api/lj-analyzers`);
  }

  getUpcomingAlerts(): Observable<{
    calibrationDue: Equipment[];
    calibrationOverdue: Equipment[];
    pmDue: Equipment[];
    pmOverdue: Equipment[];
  }> {
    return this.http.get<any>(`${this.apiUrl}/alerts/upcoming`);
  }

  getXrayCompliance(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/xray/compliance`);
  }

  getSignatories(): Observable<{ success: boolean; signatories: any[] }> {
    return this.http.get<any>(`${this.apiUrl}/api/signatories`);
  }

  getDefaultAnalytes(): Observable<{ success: boolean; analytes: any[] }> {
    return this.http.get<any>(`${this.apiUrl}/qc/analytes/default`);
  }

  updateStatus(id: string, status: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/${id}/status`, { status });
  }

  getQcControls(equipmentId?: string): Observable<QcControl[]> {
    let params = new HttpParams();
    if (equipmentId) params = params.set('equipment_id', equipmentId);
    return this.http.get<QcControl[]>(`${this.apiUrl}/qc/controls`, { params });
  }

  getControlsForEquipment(equipmentId: string): Observable<{ success: boolean; controls: QcControl[] }> {
    return this.http.get<any>(`${this.apiUrl}/${equipmentId}/qc/controls`);
  }

  createQcControl(equipmentId: string, data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/${equipmentId}/qc/controls`, data);
  }

  updateQcControl(controlId: string, data: any): Observable<any> {
    return this.http.put(`${this.apiUrl}/qc/controls/${controlId}`, data);
  }

  deleteQcControl(controlId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/qc/controls/${controlId}`);
  }

  preloadBloodChemistry(equipmentId: string, data: any = {}): Observable<any> {
    return this.http.post(`${this.apiUrl}/${equipmentId}/qc/analytes/preload-blood-chemistry`, data);
  }

  saveAnalyte(equipmentId: string, data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/${equipmentId}/qc/analytes`, data);
  }

  getQcEntries(controlId: string, analyteCode?: string): Observable<QcEntry[]> {
    let params = new HttpParams();
    if (analyteCode) params = params.set('analyte_code', analyteCode);
    return this.http.get<QcEntry[]>(`${this.apiUrl}/qc/entries/${controlId}`, { params });
  }

  getEntriesForEquipment(equipmentId: string, paramsObj: { controlId?: string; analyteCode?: string } = {}): Observable<{ success: boolean; entries: QcEntry[] }> {
    let params = new HttpParams();
    if (paramsObj.controlId) params = params.set('controlId', paramsObj.controlId);
    if (paramsObj.analyteCode) params = params.set('analyteCode', paramsObj.analyteCode);
    return this.http.get<any>(`${this.apiUrl}/${equipmentId}/qc/entries`, { params });
  }

  addQcEntry(data: any): Observable<QcEntry> {
    return this.http.post<QcEntry>(`${this.apiUrl}/qc/entries`, data);
  }

  recordQcRun(equipmentId: string, data: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/${equipmentId}/qc/entries`, data);
  }

  deleteLastQcEntry(equipmentId: string, controlId?: string, analyteCode?: string): Observable<any> {
    let params = new HttpParams();
    if (controlId) params = params.set('controlId', controlId);
    if (analyteCode) params = params.set('analyteCode', analyteCode);
    return this.http.delete(`${this.apiUrl}/${equipmentId}/qc/entries/last`, { params });
  }

  recordCorrectiveAction(entryId: string, data: { actionTaken: string; resolved?: boolean; notes?: string }): Observable<any> {
    return this.http.post(`${this.apiUrl}/qc/entries/${entryId}/corrective-action`, data);
  }

  getLeveyJenningsDataset(equipmentId: string, analyteCode: string, options: { controlId?: string; startDate?: string; endDate?: string } = {}): Observable<any> {
    let params = new HttpParams().set('analyteCode', analyteCode);
    if (options.controlId) params = params.set('controlId', options.controlId);
    if (options.startDate) params = params.set('startDate', options.startDate);
    if (options.endDate) params = params.set('endDate', options.endDate);
    return this.http.get<any>(`${this.apiUrl}/${equipmentId}/qc/levey-jennings`, { params });
  }

  getDohReport(equipmentId: string, month?: string): Observable<any> {
    let params = new HttpParams();
    if (month) params = params.set('month', month);
    return this.http.get<any>(`${this.apiUrl}/${equipmentId}/qc/doh-report`, { params });
  }

  getNeqasRecords(year?: string): Observable<NeqasRecord[]> {
    let params = new HttpParams();
    if (year) params = params.set('year', year);
    return this.http.get<NeqasRecord[]>(`${this.apiUrl}/neqas/records`, { params });
  }

  getNrlList(): Observable<{ success: boolean; list: any[] }> {
    return this.http.get<any>(`${this.apiUrl}/neqas/nrl-list`);
  }

  getNeqasReport(year?: string): Observable<any> {
    let params = new HttpParams();
    if (year) params = params.set('year', year);
    return this.http.get<any>(`${this.apiUrl}/neqas/report`, { params });
  }
}
