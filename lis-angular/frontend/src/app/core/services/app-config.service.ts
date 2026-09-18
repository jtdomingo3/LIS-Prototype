import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface AppConfig {
  apiUrl: string;
  appName?: string;
  kioskRefreshInterval?: number;
}

/**
 * Runtime configuration service.
 *
 * Reads `assets/config.json` at app startup so you can change the backend
 * URL / port without rebuilding. Just edit the JSON file and reload.
 */
@Injectable({ providedIn: 'root' })
export class AppConfigService {
  private config: AppConfig = { apiUrl: '/api' }; // safe fallback

  get apiUrl(): string {
    return this.config.apiUrl;
  }

  get appName(): string {
    return this.config.appName || 'Gezyne Clinical Laboratory';
  }

  get kioskRefreshInterval(): number {
    return this.config.kioskRefreshInterval || 15000;
  }

  /** Called once via APP_INITIALIZER before the app bootstraps. */
  load(): Promise<void> {
    // Use fetch (not HttpClient) because interceptors aren't ready yet.
    return fetch('assets/config.json')
      .then(res => {
        if (!res.ok) throw new Error(`config.json ${res.status}`);
        return res.json();
      })
      .then((cfg: AppConfig) => {
        this.config = cfg;
        console.log('[config] Loaded — API:', cfg.apiUrl);
      })
      .catch(err => {
        console.warn('[config] Could not load config.json, using defaults:', err.message);
      });
  }
}
