import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { User } from '../models';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly apiUrl = `${environment.apiUrl}/users`;

  constructor(private http: HttpClient) {}

  getAll(): Observable<{ users: User[] }> {
    return this.http.get<{ users: User[] }>(this.apiUrl);
  }

  getById(id: string): Observable<{ user: User }> {
    return this.http.get<{ user: User }>(`${this.apiUrl}/${id}`);
  }

  create(data: any): Observable<{ user: User }> {
    return this.http.post<{ user: User }>(this.apiUrl, data);
  }

  update(id: string, data: any): Observable<{ user: User }> {
    return this.http.put<{ user: User }>(`${this.apiUrl}/${id}`, data);
  }

  updateProfile(data: any): Observable<{ user: User }> {
    return this.http.put<{ user: User }>(`${this.apiUrl}/profile/me`, data);
  }

  delete(id: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.apiUrl}/${id}`);
  }

  resetPassword(id: string, newPassword?: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiUrl}/${id}/reset-password`, { password: newPassword });
  }
}
