import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { InventoryItem, InventoryBatch } from '../models';
import { AppConfigService } from './app-config.service';

@Injectable({ providedIn: 'root' })
export class InventoryService {
  private get apiUrl() { return `${this.config.apiUrl}/inventory`; }

  constructor(private http: HttpClient, private config: AppConfigService) {}

  getAll(options: {
    search?: string;
    category?: string;
    area?: string;
    is_active?: number;
  } = {}): Observable<InventoryItem[]> {
    let params = new HttpParams();
    if (options.search) params = params.set('search', options.search);
    if (options.category) params = params.set('category', options.category);
    if (options.area) params = params.set('area', options.area);
    if (options.is_active !== undefined) params = params.set('is_active', options.is_active.toString());

    return this.http.get<InventoryItem[]>(this.apiUrl, { params });
  }

  getById(id: string): Observable<InventoryItem> {
    return this.http.get<InventoryItem>(`${this.apiUrl}/${id}`);
  }

  checkCriticalStock(): Observable<{
    hasCritical: boolean;
    items: Array<{
      id: string;
      name: string;
      sku: string;
      area: string;
      location: string | null;
      unit: string;
      totalStock: number;
      criticalThreshold: number;
    }>;
  }> {
    return this.http.get<any>(`${this.apiUrl}/critical-check`);
  }

  create(data: Partial<InventoryItem>): Observable<InventoryItem> {
    return this.http.post<InventoryItem>(this.apiUrl, data);
  }

  update(id: string, data: Partial<InventoryItem>): Observable<InventoryItem> {
    return this.http.put<InventoryItem>(`${this.apiUrl}/${id}`, data);
  }

  delete(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/${id}`);
  }

  addBatch(inventoryId: string, data: Partial<InventoryBatch>): Observable<InventoryBatch> {
    return this.http.post<InventoryBatch>(`${this.apiUrl}/${inventoryId}/batches`, data);
  }

  updateBatch(batchId: string, data: Partial<InventoryBatch>): Observable<InventoryBatch> {
    return this.http.put<InventoryBatch>(`${this.apiUrl}/batches/${batchId}`, data);
  }

  deleteBatch(inventoryId: string, batchId: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${inventoryId}/batch/${batchId}`);
  }

  openBatch(inventoryId: string, batchId: string, data: { dateOpened?: string; reason?: string }): Observable<any> {
    return this.http.post(`${this.apiUrl}/${inventoryId}/batch/${batchId}/open`, data);
  }

  updateBatchQc(inventoryId: string, batchId: string, data: { qcStatus: string; notes?: string }): Observable<any> {
    return this.http.post(`${this.apiUrl}/${inventoryId}/batch/${batchId}/qc`, data);
  }

  adjustBatch(inventoryId: string, batchId: string, data: { newQuantity: number; reason: string; notes?: string }): Observable<any> {
    return this.http.post(`${this.apiUrl}/${inventoryId}/batch/${batchId}/adjust`, data);
  }

  discardBatch(inventoryId: string, batchId: string, data: { discardQuantity: number; reason?: string; notes?: string }): Observable<any> {
    return this.http.post(`${this.apiUrl}/${inventoryId}/batch/${batchId}/discard`, data);
  }

  getTransactions(inventoryId: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/${inventoryId}/transactions`);
  }

  getAlerts(): Observable<{
    lowStock: any[];
    expiringBatches: any[];
    expiredBatches: any[];
    openVials: any[];
    quarantined: any[];
  }> {
    return this.http.get<any>(`${this.apiUrl}/alerts`);
  }

  downloadExportCsv(): Observable<Blob> {
    return this.http.get(`${this.apiUrl}/export`, { responseType: 'blob' });
  }

  consume(inventoryId: string, data: { quantity: number; batch_id?: string; test_id?: string; notes?: string }): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/${inventoryId}/consume`, data);
  }
}
