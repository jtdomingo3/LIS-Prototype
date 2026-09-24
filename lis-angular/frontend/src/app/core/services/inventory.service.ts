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

  consume(inventoryId: string, data: { quantity: number; batch_id?: string; test_id?: string; notes?: string }): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/${inventoryId}/consume`, data);
  }
}
