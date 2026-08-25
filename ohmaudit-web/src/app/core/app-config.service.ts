import { Injectable, signal } from '@angular/core';

const runtimeConfigStorageKey = 'ohmaudit.runtime-config.v1';

export interface RuntimeConfig {
  apiBaseUrl: string;
  supabaseUrl: string;
  supabasePublishableKey: string;
  authRedirectUrl: string;
}

@Injectable({ providedIn: 'root' })
export class AppConfigService {
  private readonly value = signal<RuntimeConfig | undefined>(undefined);

  async load(): Promise<void> {
    try {
      const response = await fetch('/config.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error('Unable to load application configuration.');
      const config = await this.readResponse(response);
      this.value.set(config);
      this.store(config);
    } catch (error: unknown) {
      const cached = this.readStored();
      if (cached === undefined) throw error;
      this.value.set(cached);
    }
  }

  get config(): RuntimeConfig {
    const config = this.value();
    if (config === undefined) throw new Error('Application configuration has not loaded.');
    return config;
  }

  private async readResponse(response: Response): Promise<RuntimeConfig> {
    const value: unknown = await response.json();
    if (!this.isRuntimeConfig(value)) throw new Error('Application configuration is invalid.');
    return value;
  }

  private store(config: RuntimeConfig): void {
    try {
      localStorage.setItem(runtimeConfigStorageKey, JSON.stringify(config));
    } catch {
      // The service-worker cache remains the primary offline source when storage is unavailable.
    }
  }

  private readStored(): RuntimeConfig | undefined {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(runtimeConfigStorageKey) ?? 'null');
      return this.isRuntimeConfig(value) ? value : undefined;
    } catch {
      return undefined;
    }
  }

  private isRuntimeConfig(value: unknown): value is RuntimeConfig {
    if (typeof value !== 'object' || value === null) return false;
    const candidate = value as Partial<Record<keyof RuntimeConfig, unknown>>;
    return (
      typeof candidate.apiBaseUrl === 'string' &&
      typeof candidate.supabaseUrl === 'string' &&
      typeof candidate.supabasePublishableKey === 'string' &&
      typeof candidate.authRedirectUrl === 'string'
    );
  }
}
