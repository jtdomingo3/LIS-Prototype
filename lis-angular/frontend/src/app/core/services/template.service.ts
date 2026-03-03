import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Template } from '../models';
import { AppConfigService } from './app-config.service';

@Injectable({ providedIn: 'root' })
export class TemplateService {
  private get apiUrl() { return `${this.config.apiUrl}/templates`; }

  constructor(private http: HttpClient, private config: AppConfigService) {}

  getAll(includeInactive = false): Observable<{ templates: Template[] }> {
    const url = includeInactive ? `${this.apiUrl}?all=true` : this.apiUrl;
    return this.http.get<{ templates: Template[] }>(url);
  }

  getById(id: string): Observable<{ template: Template }> {
    return this.http.get<{ template: Template }>(`${this.apiUrl}/${id}`);
  }

  create(data: Partial<Template>): Observable<{ template: Template }> {
    return this.http.post<{ template: Template }>(this.apiUrl, data);
  }

  update(id: string, data: Partial<Template>): Observable<{ template: Template }> {
    return this.http.put<{ template: Template }>(`${this.apiUrl}/${id}`, data);
  }

  delete(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/${id}`);
  }
}
