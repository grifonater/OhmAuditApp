import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class OrganisationContextService {
  private readonly storageKey = 'ohmaudit.activeOrganisationId';
  readonly activeOrganisationId = signal<string | null>(localStorage.getItem(this.storageKey));

  select(organisationId: string): void {
    localStorage.setItem(this.storageKey, organisationId);
    this.activeOrganisationId.set(organisationId);
  }

  clear(): void {
    localStorage.removeItem(this.storageKey);
    this.activeOrganisationId.set(null);
  }
}
