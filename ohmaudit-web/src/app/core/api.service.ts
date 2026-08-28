import { Injectable, inject } from '@angular/core';
import { AppConfigService } from './app-config.service';
import { AuthService } from './auth.service';

export interface CurrentUserResponse {
  user: {
    id: string;
    email: string;
    displayName?: string;
    platformRole: 'USER' | 'PLATFORM_ADMIN';
  };
  assuranceLevel: 'aal1' | 'aal2';
  memberships: Array<{
    id: string;
    organisation: {
      id: string;
      name: string;
      slug: string;
      requireMfaForPrivilegedRoles: boolean;
      logoMediaId?: string | null;
    };
    role: { key: string; name: string; privileged: boolean; capabilities: string[] };
  }>;
  supportSession?: {
    sessionId: string;
    organisationId: string;
    targetUserId: string;
    expiresAt: string;
  };
}

export interface OrganisationMember {
  id: string;
  user: { id: string; email: string; displayName?: string };
  role: { key: string; name: string };
  status: 'ACTIVE' | 'INACTIVE';
}

export interface CapabilityDefinition {
  key: string;
  group: string;
  name: string;
  description: string;
  sensitive?: boolean;
}

export interface OrganisationRole {
  id: string;
  key: string;
  name: string;
  description?: string | null;
  isSystem: boolean;
  isPrivileged: boolean;
  capabilityKeys: string[];
  memberCount: number;
  invitationCount: number;
}

export interface AccessMember extends OrganisationMember {
  role: { id: string; key: string; name: string };
  isCurrentUser: boolean;
}

export interface AccessOverview {
  capabilities: CapabilityDefinition[];
  assignableCapabilityKeys: string[];
  roles: OrganisationRole[];
  members: AccessMember[];
  invitations: Array<{
    id: string;
    email: string;
    role: { key: string; name: string };
    status: string;
    expiresAt: string;
  }>;
}

export interface Entitlement {
  module: { key: string; name: string; description: string; capabilities: string[] };
  status: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELLED' | 'EXPIRED';
  trialEndsAt?: string;
  currentPeriodEndsAt?: string;
  expiresAt?: string;
  daysRemaining: number;
  entitled: boolean;
}

export type PlatformEntitlementStatus =
  'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELLED' | 'EXPIRED';

export interface PlatformOrganisationSummary {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  brandProfile?: { tradingName?: string | null; registeredName?: string | null } | null;
  moduleEntitlements: Array<{
    id: string;
    status: PlatformEntitlementStatus;
    trialEndsAt?: string | null;
    currentPeriodEndsAt?: string | null;
    module: { key: string; name: string };
  }>;
  _count: { memberships: number; customers: number; sites: number; assets: number };
}

export interface PlatformOrganisationDetail extends PlatformOrganisationSummary {
  roles: Array<{ id: string; key: string; name: string; isSystem: boolean }>;
  memberships: Array<{
    id: string;
    status: 'ACTIVE' | 'INACTIVE';
    user: { id: string; email: string; displayName?: string | null; status: string };
    role: { id: string; key: string; name: string };
  }>;
  modules: Array<{
    id: string;
    key: string;
    name: string;
    description: string;
    entitlement?: {
      id: string;
      status: PlatformEntitlementStatus;
      trialEndsAt?: string | null;
      currentPeriodEndsAt?: string | null;
    } | null;
  }>;
}

export interface OnboardingState {
  profile?: Record<string, string | null>;
  accreditations: Array<{ id: string; scheme: string; registrationNumber: string }>;
  invitations: Array<{
    id: string;
    email: string;
    role: { key: string; name: string };
    status: string;
    expiresAt: string;
  }>;
  checklist: Record<string, boolean>;
}

export interface CustomerSummary {
  id: string;
  name: string;
  reference?: string;
  status: string;
  _count: { sites: number; assets: number };
  logoMediaId?: string | null;
  logoMedia?: AssetMedia | null;
}
export interface CustomerDetail extends CustomerSummary {
  sites: SiteSummary[];
  contacts: Array<{
    id: string;
    name: string;
    role?: string;
    email?: string;
    telephone?: string;
    mobile?: string;
    primary?: boolean;
    notes?: string;
  }>;
  internalNotes?: string;
  createdAt?: string;
  updatedAt?: string;
  reports: ReportSummary[];
}
export interface SiteSummary {
  id: string;
  customerId: string;
  name: string;
  reference?: string;
  postcode?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  county?: string;
  countryCode?: string;
  mainPhotoMediaId?: string | null;
  parkingInformation?: string;
  accessInstructions?: string;
  openingTimes?: string;
  ppeRequirements?: string;
  inductionInformation?: string;
  internalNotes?: string;
  status: string;
  _count?: { assets: number };
  customer?: { id: string; name: string };
}
export interface SiteDetail extends SiteSummary {
  customer: { id: string; name: string };
  assets: AssetSummary[];
  contacts: Array<{ id: string; name: string; role?: string }>;
  reference?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  county?: string;
  parkingInformation?: string;
  accessInstructions?: string;
  openingTimes?: string;
  ppeRequirements?: string;
  inductionInformation?: string;
  internalNotes?: string;
  reports: ReportSummary[];
  media?: AssetMedia[];
}
export interface AssetSummary {
  id: string;
  assetType: string;
  assetReference: string;
  displayName: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  status: string;
  notes?: string;
  media?: AssetMedia[];
}
export interface AssetMedia {
  id: string;
  category: string;
  caption?: string;
  originalFilename?: string;
  tags?: string[];
  sortOrder?: number;
  isPrimary?: boolean;
  mimeType: string;
  createdAt?: string;
}
export interface OrganisationEquipment {
  id: string;
  organisationId: string;
  name: string;
  equipmentType: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  calibrationDueAt?: string;
  notes?: string;
  status: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
}
export interface PlatformUser {
  id: string;
  email: string;
  displayName?: string | null;
  platformRole: 'USER' | 'PLATFORM_ADMIN';
  status: 'ACTIVE' | 'DISABLED';
  createdAt: string;
  _count: { memberships: number };
}
export interface EvStockModel {
  id: string;
  manufacturer: string;
  model: string;
  count: number;
}
export interface EvStockImage {
  mediaId: string;
  mimeType: string;
  createdAt: string;
  models: EvStockModel[];
}
export interface ReportSummary {
  id: string;
  entityType: string;
  entityId: string;
  title: string;
  category: string;
  mediaId?: string | null;
  inspectionRevisionId?: string | null;
  issuedAt?: string;
  expiresAt?: string;
  createdAt: string;
  reportType?: 'VISIT';
  visitId?: string;
  documentCount?: number;
}

export interface ScheduleOccurrence {
  id: string;
  dueDate: string;
  status: string;
  scheduleRule: {
    id: string;
    title: string;
    moduleKey: string;
    frequencyMonths: number;
    site: { id: string; name: string };
    customer?: { id: string; name: string };
    asset?: { id: string; displayName: string };
  };
}
export interface VisitSummary {
  id: string;
  organisationId: string;
  title: string;
  scheduledStart: string;
  scheduledEnd?: string;
  status: string;
  assignedUserId?: string;
  guestEngineerName?: string;
  guestEmail?: string;
  engineerNotes?: string;
  submittedAt?: string;
  completedAt?: string;
  customer: { id: string; name: string };
  site: { id: string; name: string; postcode?: string };
  tasks: VisitTask[];
}
export interface VisitTask {
  id: string;
  title: string;
  moduleKey: string;
  status: string;
  asset?: AssetSummary & { evChargePoint?: EvChargePoint };
  inspection?: {
    id: string;
    status: string;
    revisions?: Array<{ id: string; data: Record<string, unknown> }>;
    defects?: unknown[];
  };
}
export interface InspectionSummary {
  id: string;
  moduleKey: string;
  inspectionType: string;
  status: string;
  currentRevisionNumber: number;
  submittedAt?: string;
  approvedAt?: string;
  customer: { id: string; name: string };
  site: { id: string; name: string };
  asset?: AssetSummary & { evChargePoint?: EvChargePoint };
  visit?: { id: string; title: string; scheduledStart: string };
  revisions: Array<{
    id: string;
    revisionNumber: number;
    data: Record<string, unknown>;
    validation: Record<string, unknown>;
    snapshots?: Record<string, unknown>;
    createdAt: string;
    signatures?: Array<{
      signerName: string;
      signerRole?: string;
      signedAt?: string;
      signatureData?: string;
    }>;
    documents?: ReportSummary[];
    evData?: {
      stableDetails: Record<string, unknown>;
      supplyTests: unknown[];
      connectorTests: unknown[];
      functionalChecks: Record<string, unknown>;
      engineerObservations?: string;
    } | null;
  }>;
  defects: Array<{
    id: string;
    title: string;
    description?: string;
    severity: string;
    status: string;
    photoMediaIds?: string[];
  }>;
  evidenceMedia?: AssetMedia[];
  proposedAssetChanges?: Array<{
    id: string;
    proposedData: Record<string, unknown>;
    status: string;
    createdAt: string;
  }>;
}
export interface EvChargePoint {
  id: string;
  chargePointId?: string;
  operatorName?: string;
  firmwareVersion?: string;
  installationDate?: string;
  nominalVoltage?: number;
  phaseCount?: number;
  maximumPowerKw?: number;
  dcRcdType?: 'TYPE_B' | 'RDC_DD' | 'NONE';
  locationNotes?: string;
  supplies: Array<{
    id: string;
    label: string;
    phaseCount: number;
    protectiveDeviceType?: string;
    protectiveDeviceRating?: number;
    earthingArrangement?: string;
  }>;
  connectors: Array<{
    id: string;
    label: string;
    connectorType: string;
    status: string;
    supplyMappings: Array<{ supplyId: string; supply?: { label: string } }>;
  }>;
}
export type ChargerDataPlateField =
  'manufacturer' | 'model' | 'serialNumber' | 'maximumPowerKw' | 'connectorTypes';
export interface ChargerDataPlateCandidate {
  field: ChargerDataPlateField;
  value: string;
  confidence?: number;
  requiresHumanConfirmation: true;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly config = inject(AppConfigService);
  private readonly auth = inject(AuthService);

  private async request<T>(
    path: string,
    init: RequestInit = {},
    includeSupportSession = true,
  ): Promise<T> {
    const accessToken = this.auth.session()?.access_token;
    if (accessToken === undefined) throw new Error('Sign in to continue.');
    const headers = new Headers(init.headers);
    headers.set('authorization', `Bearer ${accessToken}`);
    const supportToken = sessionStorage.getItem('ohmaudit.supportSession');
    if (includeSupportSession && supportToken)
      headers.set('x-ohmaudit-support-session', supportToken);
    if (typeof init.body === 'string' && !headers.has('content-type'))
      headers.set('content-type', 'application/json');
    const response = await fetch(`${this.config.config.apiBaseUrl}${path}`, {
      ...init,
      headers,
      cache: 'no-store',
    });
    const body = await this.readJson<T>(response);
    if (!response.ok) throw new Error(body?.message ?? 'The request failed.');
    if (body === undefined && response.status !== 204)
      throw new Error('The service returned an empty response.');
    return body as T;
  }

  private async publicRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (typeof init.body === 'string' && !headers.has('content-type'))
      headers.set('content-type', 'application/json');
    const response = await fetch(`${this.config.config.apiBaseUrl}${path}`, { ...init, headers });
    const body = await this.readJson<T>(response);
    if (!response.ok) throw new Error(body?.message ?? 'The request failed.');
    if (body === undefined) throw new Error('The service returned an empty response.');
    return body;
  }

  private async readJson<T>(response: Response): Promise<(T & { message?: string }) | undefined> {
    if (response.status === 204) return undefined;
    const text = await response.text();
    if (text.trim() === '') return undefined;
    try {
      return JSON.parse(text) as T & { message?: string };
    } catch {
      throw new Error(
        response.ok ? 'The service returned an invalid response.' : 'The request failed.',
      );
    }
  }

  private authenticatedHeaders(accessToken: string): Headers {
    const headers = new Headers({ authorization: `Bearer ${accessToken}` });
    const supportToken = sessionStorage.getItem('ohmaudit.supportSession');
    if (supportToken) headers.set('x-ohmaudit-support-session', supportToken);
    return headers;
  }

  currentUser(): Promise<CurrentUserResponse> {
    return this.request('/me');
  }

  createOrganisation(name: string): Promise<{ organisation: { id: string; name: string } }> {
    return this.request('/organisations', { method: 'POST', body: JSON.stringify({ name }) });
  }

  listMembers(organisationId: string): Promise<{ members: OrganisationMember[] }> {
    return this.request(`/organisations/${organisationId}/members`);
  }

  accessOverview(organisationId: string): Promise<AccessOverview> {
    return this.request(`/organisations/${organisationId}/access`);
  }

  createRole(
    organisationId: string,
    input: { name: string; description?: string | undefined; capabilityKeys: string[] },
  ) {
    return this.request(`/organisations/${organisationId}/roles`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  updateRole(
    organisationId: string,
    roleId: string,
    input: { name: string; description?: string | undefined; capabilityKeys: string[] },
  ) {
    return this.request(`/organisations/${organisationId}/roles/${roleId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }

  deleteRole(organisationId: string, roleId: string) {
    return this.request(`/organisations/${organisationId}/roles/${roleId}`, { method: 'DELETE' });
  }

  setMemberRole(organisationId: string, membershipId: string, roleId: string) {
    return this.request(`/organisations/${organisationId}/members/${membershipId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ roleId }),
    });
  }

  setMemberStatus(organisationId: string, membershipId: string, status: 'ACTIVE' | 'INACTIVE') {
    return this.request(`/organisations/${organisationId}/members/${membershipId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  setMfaPolicy(organisationId: string, required: boolean): Promise<void> {
    return this.request(`/organisations/${organisationId}/mfa-policy`, {
      method: 'PATCH',
      body: JSON.stringify({ requireMfaForPrivilegedRoles: required }),
    });
  }

  entitlements(organisationId: string): Promise<{ entitlements: Entitlement[] }> {
    return this.request(`/organisations/${organisationId}/entitlements`);
  }
  portfolioSummary(organisationId: string) {
    return this.request<{ summary: { customers: number; sites: number; assets: number } }>(
      `/organisations/${organisationId}/portfolio-summary`,
    );
  }
  listEquipment(organisationId: string) {
    return this.request<{ equipment: OrganisationEquipment[] }>(
      `/organisations/${organisationId}/equipment`,
    );
  }
  createEquipment(
    organisationId: string,
    input: Omit<
      OrganisationEquipment,
      'id' | 'organisationId' | 'status' | 'createdAt' | 'updatedAt'
    >,
  ) {
    return this.request<{ equipment: OrganisationEquipment }>(
      `/organisations/${organisationId}/equipment`,
      { method: 'POST', body: JSON.stringify(input) },
    );
  }
  updateEquipment(
    organisationId: string,
    equipmentId: string,
    input: Partial<
      Omit<OrganisationEquipment, 'id' | 'organisationId' | 'status' | 'createdAt' | 'updatedAt'>
    >,
  ) {
    return this.request<{ equipment: OrganisationEquipment }>(
      `/organisations/${organisationId}/equipment/${equipmentId}`,
      { method: 'PATCH', body: JSON.stringify(input) },
    );
  }
  archiveEquipment(organisationId: string, equipmentId: string) {
    return this.request(`/organisations/${organisationId}/equipment/${equipmentId}`, {
      method: 'DELETE',
    });
  }

  onboarding(organisationId: string): Promise<OnboardingState> {
    return this.request(`/organisations/${organisationId}/onboarding`);
  }

  saveBrandProfile(organisationId: string, profile: Record<string, string>): Promise<void> {
    return this.request(`/organisations/${organisationId}/brand-profile`, {
      method: 'PUT',
      body: JSON.stringify(profile),
    });
  }
  setBrandLogo(organisationId: string, mediaId: string): Promise<void> {
    return this.request(`/organisations/${organisationId}/brand-profile/logo`, {
      method: 'PATCH',
      body: JSON.stringify({ mediaId }),
    });
  }

  addAccreditation(organisationId: string, input: { scheme: string; registrationNumber: string }) {
    return this.request(`/organisations/${organisationId}/accreditations`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  inviteMember(organisationId: string, input: { email: string; roleKey: string }) {
    return this.request<{ inviteUrl: string }>(`/organisations/${organisationId}/invitations`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  revokeInvitation(organisationId: string, invitationId: string) {
    return this.request(`/organisations/${organisationId}/invitations/${invitationId}`, {
      method: 'DELETE',
    });
  }

  acceptInvitation(token: string) {
    return this.request<{ organisation: { id: string; name: string } }>('/invitations/accept', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  }

  listCustomers(
    organisationId: string,
    query = '',
  ): Promise<{ items: CustomerSummary[]; total: number }> {
    return this.request(
      `/customers?organisationId=${encodeURIComponent(organisationId)}&q=${encodeURIComponent(query)}`,
    );
  }
  createCustomer(
    organisationId: string,
    input: { name: string; reference?: string; internalNotes?: string },
  ) {
    return this.request<{ customer: CustomerSummary }>('/customers', {
      method: 'POST',
      body: JSON.stringify({ organisationId, ...input }),
    });
  }
  getCustomer(organisationId: string, customerId: string) {
    return this.request<{ customer: CustomerDetail }>(
      `/customers/${customerId}?organisationId=${encodeURIComponent(organisationId)}`,
    );
  }
  updateCustomer(
    organisationId: string,
    customerId: string,
    input: { name?: string; reference?: string; internalNotes?: string },
  ) {
    return this.request<{ customer: CustomerSummary }>(
      `/customers/${customerId}?organisationId=${encodeURIComponent(organisationId)}`,
      { method: 'PATCH', body: JSON.stringify(input) },
    );
  }
  setCustomerLogo(organisationId: string, customerId: string, mediaId: string | null) {
    return this.request(
      `/customers/${customerId}/logo?organisationId=${encodeURIComponent(organisationId)}`,
      { method: 'PATCH', body: JSON.stringify({ mediaId }) },
    );
  }
  archiveCustomer(organisationId: string, customerId: string) {
    return this.request(
      `/customers/${customerId}?organisationId=${encodeURIComponent(organisationId)}`,
      {
        method: 'DELETE',
      },
    );
  }
  createSite(
    organisationId: string,
    input: {
      customerId: string;
      name: string;
      addressLine1?: string;
      city?: string;
      postcode?: string;
      accessInstructions?: string;
    },
  ) {
    return this.request<{ site: SiteSummary }>('/sites', {
      method: 'POST',
      body: JSON.stringify({ organisationId, ...input }),
    });
  }
  getSite(organisationId: string, siteId: string) {
    return this.request<{ site: SiteDetail }>(
      `/sites/${siteId}?organisationId=${encodeURIComponent(organisationId)}`,
    );
  }
  updateSite(
    organisationId: string,
    siteId: string,
    input: {
      name?: string;
      reference?: string;
      addressLine1?: string;
      city?: string;
      postcode?: string;
      parkingInformation?: string;
      accessInstructions?: string;
      internalNotes?: string;
    },
  ) {
    return this.request<{ site: SiteSummary }>(
      `/sites/${siteId}?organisationId=${encodeURIComponent(organisationId)}`,
      { method: 'PATCH', body: JSON.stringify(input) },
    );
  }
  createAsset(
    organisationId: string,
    input: {
      siteId: string;
      assetType: string;
      assetReference: string;
      displayName: string;
      manufacturer?: string;
      model?: string;
      serialNumber?: string;
      notes?: string;
    },
  ) {
    return this.request<{ asset: AssetSummary }>('/assets', {
      method: 'POST',
      body: JSON.stringify({ organisationId, ...input }),
    });
  }
  updateAssetLifecycle(organisationId: string, assetId: string, status: string) {
    return this.request(
      `/assets/${assetId}/lifecycle?organisationId=${encodeURIComponent(organisationId)}`,
      { method: 'PATCH', body: JSON.stringify({ status }) },
    );
  }
  updateAsset(
    organisationId: string,
    assetId: string,
    input: {
      assetType?: string;
      assetReference?: string;
      displayName?: string;
      manufacturer?: string;
      model?: string;
      serialNumber?: string;
      notes?: string;
    },
  ) {
    return this.request<{ asset: AssetSummary }>(
      `/assets/${assetId}?organisationId=${encodeURIComponent(organisationId)}`,
      { method: 'PATCH', body: JSON.stringify(input) },
    );
  }
  registerMedia(
    organisationId: string,
    input: {
      entityType: 'Organisation' | 'Customer' | 'Site' | 'Asset' | 'Inspection';
      entityId: string;
      category: string;
      caption?: string;
      originalFilename?: string;
      tags?: string[];
      sortOrder?: number;
      mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
      size: number;
    },
  ) {
    return this.request<{ media: AssetMedia }>('/media', {
      method: 'POST',
      body: JSON.stringify({ organisationId, ...input }),
    });
  }
  uploadMedia(organisationId: string, mediaId: string, file: Blob) {
    return this.request<{ media: AssetMedia }>(
      `/media/${mediaId}/content?organisationId=${encodeURIComponent(organisationId)}`,
      { method: 'PUT', headers: { 'content-type': file.type }, body: file },
    );
  }
  updateMedia(
    organisationId: string,
    mediaId: string,
    input: Partial<Pick<AssetMedia, 'caption' | 'category' | 'tags' | 'sortOrder'>>,
  ) {
    return this.request<{ media: AssetMedia }>(
      `/media/${mediaId}?organisationId=${encodeURIComponent(organisationId)}`,
      { method: 'PATCH', body: JSON.stringify(input) },
    );
  }
  deleteMedia(organisationId: string, mediaId: string) {
    return this.request(`/media/${mediaId}?organisationId=${encodeURIComponent(organisationId)}`, {
      method: 'DELETE',
    });
  }
  setSitePhotoPrimary(organisationId: string, siteId: string, mediaId: string | null) {
    return this.request(
      `/sites/${siteId}/photos/primary?organisationId=${encodeURIComponent(organisationId)}`,
      { method: 'PATCH', body: JSON.stringify({ mediaId }) },
    );
  }
  async downloadMedia(organisationId: string, mediaId: string): Promise<Blob> {
    const accessToken = this.auth.session()?.access_token;
    if (accessToken === undefined) throw new Error('Sign in to continue.');
    const response = await fetch(
      `${this.config.config.apiBaseUrl}/media/${mediaId}/content?organisationId=${encodeURIComponent(organisationId)}`,
      { headers: this.authenticatedHeaders(accessToken) },
    );
    if (!response.ok) {
      const body: { message?: string } = await response.json();
      throw new Error(body.message ?? 'The media could not be opened.');
    }
    return response.blob();
  }
  async downloadAssetDisplayImage(organisationId: string, assetId: string): Promise<Blob | null> {
    const accessToken = this.auth.session()?.access_token;
    if (accessToken === undefined) throw new Error('Sign in to continue.');
    const response = await fetch(
      `${this.config.config.apiBaseUrl}/assets/${assetId}/display-image?organisationId=${encodeURIComponent(organisationId)}`,
      { headers: this.authenticatedHeaders(accessToken) },
    );
    if (response.status === 404) return null;
    if (!response.ok) {
      const body: { message?: string } = await response.json();
      throw new Error(body.message ?? 'The charger image could not be opened.');
    }
    return response.blob();
  }
  platformStatus() {
    return this.request<{
      status: {
        platformRole: 'USER' | 'PLATFORM_ADMIN';
        bootstrapAvailable: boolean;
        bootstrapToken?: string;
      };
    }>('/platform/status');
  }
  bootstrapSuperadmin(token: string) {
    return this.request('/platform/bootstrap', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });
  }
  listPlatformUsers(query = '') {
    return this.request<{ users: PlatformUser[] }>(
      `/platform/users?q=${encodeURIComponent(query)}`,
    );
  }
  setPlatformRole(userId: string, platformRole: 'USER' | 'PLATFORM_ADMIN') {
    return this.request(`/platform/users/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ platformRole }),
    });
  }
  listPlatformOrganisations(query = '') {
    return this.request<{ organisations: PlatformOrganisationSummary[] }>(
      `/platform/organisations?q=${encodeURIComponent(query)}`,
    );
  }
  platformOrganisation(organisationId: string) {
    return this.request<{ organisation: PlatformOrganisationDetail }>(
      `/platform/organisations/${organisationId}`,
    );
  }
  setPlatformOrganisationModule(
    organisationId: string,
    moduleKey: string,
    status: PlatformEntitlementStatus,
    expiresAt?: string | null,
  ) {
    return this.request(`/platform/organisations/${organisationId}/modules/${moduleKey}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, expiresAt: expiresAt || null }),
    });
  }
  setPlatformOrganisationMember(
    organisationId: string,
    membershipId: string,
    input: { roleId?: string; status?: 'ACTIVE' | 'INACTIVE' },
  ) {
    return this.request(`/platform/organisations/${organisationId}/members/${membershipId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }
  requestPlatformPasswordReset(organisationId: string, userId: string) {
    return this.request<{ reset: { email: string } }>(
      `/platform/organisations/${organisationId}/users/${userId}/password-reset`,
      { method: 'POST' },
    );
  }
  startPlatformSupportSession(organisationId: string, targetUserId: string, reason: string) {
    return this.request<{
      supportSession: {
        id: string;
        token: string;
        expiresAt: string;
        target: { id: string; email: string; displayName?: string };
        organisation: { id: string; name: string };
      };
    }>(`/platform/organisations/${organisationId}/support-sessions`, {
      method: 'POST',
      body: JSON.stringify({ targetUserId, reason }),
    });
  }
  endPlatformSupportSession(sessionId: string) {
    return this.request(
      `/platform/support-sessions/${sessionId}/revoke`,
      { method: 'POST' },
      false,
    );
  }
  evStockCatalogue(query = '', limit = 20) {
    return this.request<{
      unmatched: Array<{ manufacturer: string; model: string; count: number }>;
      stocked: EvStockImage[];
      totalMatchedModels: number;
      availableImageCount: number;
    }>(`/platform/ev-stock-images?q=${encodeURIComponent(query)}&limit=${limit}`);
  }
  registerEvStockImage(organisationId: string, manufacturer: string, models: string[], file: Blob) {
    return this.request<{ media: { id: string } }>('/platform/ev-stock-images', {
      method: 'POST',
      body: JSON.stringify({
        organisationId,
        manufacturer,
        models,
        mimeType: file.type,
        size: file.size,
      }),
    });
  }
  uploadEvStockImage(mediaId: string, file: Blob) {
    return this.request(`/platform/ev-stock-images/${mediaId}/content`, {
      method: 'PUT',
      headers: { 'content-type': file.type, 'x-file-size': String(file.size) },
      body: file,
    });
  }
  addEvStockModels(mediaId: string, manufacturer: string, models: string[]) {
    return this.request(`/platform/ev-stock-images/${mediaId}/models`, {
      method: 'POST',
      body: JSON.stringify({ manufacturer, models }),
    });
  }
  unlinkEvStockModel(assetModelId: string) {
    return this.request(`/platform/ev-stock-images/models/${assetModelId}`, { method: 'DELETE' });
  }
  deleteEvStockImage(mediaId: string) {
    return this.request(`/platform/ev-stock-images/${mediaId}`, { method: 'DELETE' });
  }
  evStockImageUrl(mediaId: string, version: string): string {
    return `${this.config.config.apiBaseUrl}/stock-images/${mediaId}/content?v=${encodeURIComponent(version)}`;
  }
  async downloadDocumentPdf(organisationId: string, documentId: string): Promise<Blob> {
    const accessToken = this.auth.session()?.access_token;
    if (accessToken === undefined) throw new Error('Sign in to continue.');
    const response = await fetch(
      `${this.config.config.apiBaseUrl}/documents/${documentId}/pdf?organisationId=${encodeURIComponent(organisationId)}`,
      { headers: this.authenticatedHeaders(accessToken) },
    );
    if (!response.ok) {
      const body: { message?: string } = await response.json();
      throw new Error(body.message ?? 'The PDF could not be generated.');
    }
    return response.blob();
  }
  async previewDocumentHtml(organisationId: string, documentId: string): Promise<Blob> {
    const accessToken = this.auth.session()?.access_token;
    if (accessToken === undefined) throw new Error('Sign in to continue.');
    const response = await fetch(
      `${this.config.config.apiBaseUrl}/documents/${documentId}/html?organisationId=${encodeURIComponent(organisationId)}`,
      { headers: this.authenticatedHeaders(accessToken) },
    );
    if (!response.ok) {
      const body = (await response.json().catch(() => undefined)) as
        { message?: string } | undefined;
      throw new Error(body?.message ?? 'The report preview could not be generated.');
    }
    return response.blob();
  }
  async downloadVisitReportPdf(organisationId: string, visitId: string): Promise<Blob> {
    const accessToken = this.auth.session()?.access_token;
    if (accessToken === undefined) throw new Error('Sign in to continue.');
    const response = await fetch(
      `${this.config.config.apiBaseUrl}/visits/${visitId}/report.pdf?organisationId=${encodeURIComponent(organisationId)}`,
      { headers: this.authenticatedHeaders(accessToken) },
    );
    if (!response.ok) {
      const body: { message?: string } = await response.json();
      throw new Error(body.message ?? 'The visit report could not be generated.');
    }
    return response.blob();
  }
  search(organisationId: string, query: string) {
    return this.request<{
      customers: CustomerSummary[];
      sites: SiteSummary[];
      assets: AssetSummary[];
      documents: Array<{ id: string; title: string }>;
    }>(
      `/search?organisationId=${encodeURIComponent(organisationId)}&q=${encodeURIComponent(query)}`,
    );
  }

  listSites(organisationId: string, query = '') {
    return this.request<{ sites: SiteSummary[] }>(
      `/sites?organisationId=${encodeURIComponent(organisationId)}&q=${encodeURIComponent(query)}`,
    );
  }
  listSchedules(organisationId: string) {
    return this.request<{ schedules: unknown[] }>(
      `/schedules?organisationId=${encodeURIComponent(organisationId)}`,
    );
  }
  createSchedule(
    organisationId: string,
    input: {
      siteId: string;
      assetId?: string;
      title: string;
      moduleKey: string;
      frequencyMonths: number;
      startDate: string;
      notificationLeadDays: number;
    },
  ) {
    return this.request('/schedules', {
      method: 'POST',
      body: JSON.stringify({ organisationId, ...input }),
    });
  }
  calendar(organisationId: string, from: string, to: string) {
    return this.request<{ occurrences: ScheduleOccurrence[] }>(
      `/calendar?organisationId=${encodeURIComponent(organisationId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    );
  }
  notificationPreferences(organisationId: string) {
    return this.request<{
      preferences: {
        inAppEnabled: boolean;
        emailEnabled: boolean;
        defaultLeadDays: number;
        overdueReminders: boolean;
        inspectionSubmitted: boolean;
      };
    }>(`/notifications/preferences?organisationId=${encodeURIComponent(organisationId)}`);
  }
  updateNotificationPreferences(
    organisationId: string,
    input: {
      inAppEnabled: boolean;
      emailEnabled: boolean;
      defaultLeadDays: number;
      overdueReminders: boolean;
      inspectionSubmitted: boolean;
    },
  ) {
    return this.request(
      `/notifications/preferences?organisationId=${encodeURIComponent(organisationId)}`,
      { method: 'PUT', body: JSON.stringify(input) },
    );
  }
  listVisits(
    organisationId: string,
    filters: {
      query?: string;
      status?: string;
      dateField?: 'scheduled' | 'completed';
      from?: string;
      to?: string;
      sort?: 'scheduled' | 'completed' | 'title' | 'status';
      direction?: 'asc' | 'desc';
      page?: number;
      pageSize?: number;
    } = {},
  ) {
    const query = new URLSearchParams({ organisationId });
    if (filters.query) query.set('q', filters.query);
    if (filters.status) query.set('status', filters.status);
    if (filters.dateField) query.set('dateField', filters.dateField);
    if (filters.from) query.set('from', filters.from);
    if (filters.to) query.set('to', filters.to);
    if (filters.sort) query.set('sort', filters.sort);
    if (filters.direction) query.set('direction', filters.direction);
    if (filters.page) query.set('page', String(filters.page));
    if (filters.pageSize) query.set('pageSize', String(filters.pageSize));
    return this.request<{
      visits: VisitSummary[];
      pagination: { page: number; pageSize: number; total: number; pageCount: number };
    }>(`/visits?${query.toString()}`);
  }
  getVisit(organisationId: string, visitId: string) {
    return this.request<{ visit: VisitSummary }>(
      `/visits/${visitId}?organisationId=${encodeURIComponent(organisationId)}`,
    );
  }
  addVisitEvAsset(
    organisationId: string,
    visitId: string,
    input: {
      assetReference: string;
      displayName: string;
      manufacturer?: string;
      model?: string;
      serialNumber?: string;
      maximumPowerKw?: number;
      dcRcdType: 'TYPE_B' | 'RDC_DD' | 'NONE';
    },
  ) {
    return this.request<{ asset: AssetSummary; task: VisitTask; inspection: InspectionSummary }>(
      `/visits/${visitId}/ev-assets?organisationId=${encodeURIComponent(organisationId)}`,
      { method: 'POST', body: JSON.stringify(input) },
    );
  }
  createVisit(
    organisationId: string,
    input: {
      siteId: string;
      title: string;
      scheduledStart: string;
      scheduledEnd?: string;
      assignedUserId?: string;
      guestEngineerName?: string;
      guestEmail?: string;
      guestMobile?: string;
      engineerNotes?: string;
      tasks: Array<{ assetId?: string; moduleKey: string; title: string }>;
    },
  ) {
    return this.request<{ visit: VisitSummary }>('/visits', {
      method: 'POST',
      body: JSON.stringify({ organisationId, ...input }),
    });
  }
  createGuestLink(organisationId: string, visitId: string, validDays = 7) {
    return this.request<{ token: string; expiresAt: string; guestUrl: string }>(
      `/visits/${visitId}/guest-link?organisationId=${encodeURIComponent(organisationId)}`,
      { method: 'POST', body: JSON.stringify({ validDays }) },
    );
  }
  guestVisit(token: string) {
    return this.publicRequest<{ visit: VisitSummary }>(
      `/guest/visits/${encodeURIComponent(token)}`,
    );
  }
  getGuestInspection(token: string, inspectionId: string) {
    return this.publicRequest<{ inspection: InspectionSummary }>(
      `/guest/visits/${encodeURIComponent(token)}/inspections/${inspectionId}`,
    );
  }
  addGuestVisitEvAsset(
    token: string,
    input: {
      assetReference: string;
      displayName: string;
      manufacturer?: string;
      model?: string;
      serialNumber?: string;
      maximumPowerKw?: number;
      dcRcdType: 'TYPE_B' | 'RDC_DD' | 'NONE';
    },
  ) {
    return this.publicRequest<{
      asset: AssetSummary;
      task: VisitTask;
      inspection: InspectionSummary;
    }>(`/guest/visits/${encodeURIComponent(token)}/ev-assets`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }
  async downloadGuestMedia(token: string, mediaId: string): Promise<Blob> {
    const response = await fetch(
      `${this.config.config.apiBaseUrl}/guest/visits/${encodeURIComponent(token)}/media/${mediaId}/content`,
    );
    if (!response.ok) throw new Error('The asset image could not be loaded.');
    return response.blob();
  }
  async downloadGuestAssetDisplayImage(token: string, assetId: string): Promise<Blob | null> {
    const response = await fetch(
      `${this.config.config.apiBaseUrl}/guest/visits/${encodeURIComponent(token)}/assets/${assetId}/display-image`,
    );
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('The charger image could not be loaded.');
    return response.blob();
  }
  uploadGuestInspectionPhoto(token: string, inspectionId: string, photo: Blob) {
    return this.publicRequest<{ media: { id: string } }>(
      `/guest/visits/${encodeURIComponent(token)}/inspections/${inspectionId}/media`,
      {
        method: 'POST',
        headers: { 'content-type': photo.type, 'x-file-size': String(photo.size) },
        body: photo,
      },
    );
  }
  uploadGuestThermalImage(
    token: string,
    inspectionId: string,
    kind: 'unclassified' | 'thermal' | 'standard',
    image: Blob,
    originalFilename?: string,
  ) {
    return this.publicRequest<{ media: AssetMedia }>(
      `/guest/visits/${encodeURIComponent(token)}/inspections/${inspectionId}/thermal-media?kind=${kind}${originalFilename ? `&name=${encodeURIComponent(originalFilename)}` : ''}`,
      {
        method: 'POST',
        headers: { 'content-type': image.type, 'x-file-size': String(image.size) },
        body: image,
      },
    );
  }
  listGuestEquipment(token: string) {
    return this.publicRequest<{ equipment: OrganisationEquipment[] }>(
      `/guest/visits/${encodeURIComponent(token)}/equipment`,
    );
  }
  updateGuestMedia(
    token: string,
    mediaId: string,
    input: Partial<Pick<AssetMedia, 'caption' | 'category' | 'tags' | 'sortOrder'>>,
  ) {
    return this.publicRequest<{ media: AssetMedia }>(
      `/guest/visits/${encodeURIComponent(token)}/media/${mediaId}`,
      { method: 'PATCH', body: JSON.stringify(input) },
    );
  }
  startInspection(organisationId: string, visitTaskId: string) {
    return this.request<{ inspection: InspectionSummary }>('/inspections/start', {
      method: 'POST',
      body: JSON.stringify({ organisationId, visitTaskId }),
    });
  }
  startGuestInspection(token: string, taskId: string) {
    return this.publicRequest<{ inspection: InspectionSummary }>(
      `/guest/visits/${encodeURIComponent(token)}/tasks/${taskId}/start`,
      { method: 'POST' },
    );
  }
  analyseChargerDataPlate(organisationId: string, inspectionId: string, image: Blob) {
    return this.request<{
      candidates: ChargerDataPlateCandidate[];
      missingFields: ChargerDataPlateField[];
    }>(
      `/inspections/${inspectionId}/data-plate-analysis?organisationId=${encodeURIComponent(organisationId)}`,
      { method: 'POST', headers: { 'content-type': image.type }, body: image },
    );
  }
  analyseGuestChargerDataPlate(token: string, inspectionId: string, image: Blob) {
    return this.publicRequest<{
      candidates: ChargerDataPlateCandidate[];
      missingFields: ChargerDataPlateField[];
    }>(
      `/guest/visits/${encodeURIComponent(token)}/inspections/${inspectionId}/data-plate-analysis`,
      { method: 'POST', headers: { 'content-type': image.type }, body: image },
    );
  }
  listInspections(organisationId: string, status = '') {
    return this.request<{ inspections: InspectionSummary[] }>(
      `/inspections?organisationId=${encodeURIComponent(organisationId)}${status ? `&status=${encodeURIComponent(status)}` : ''}`,
    );
  }
  getInspection(organisationId: string, inspectionId: string) {
    return this.request<{ inspection: InspectionSummary }>(
      `/inspections/${inspectionId}?organisationId=${encodeURIComponent(organisationId)}`,
    );
  }
  submitInspection(organisationId: string, inspectionId: string, input: Record<string, unknown>) {
    return this.request(
      `/inspections/${inspectionId}/submit?organisationId=${encodeURIComponent(organisationId)}`,
      { method: 'POST', body: JSON.stringify(input) },
    );
  }
  submitGuestInspection(
    token: string,
    inspectionId: string,
    input: Record<string, unknown>,
    clientMutationId?: string,
  ) {
    return this.publicRequest(
      `/guest/visits/${encodeURIComponent(token)}/inspections/${inspectionId}/submit`,
      {
        method: 'POST',
        ...(clientMutationId === undefined
          ? {}
          : { headers: { 'x-client-mutation-id': clientMutationId } }),
        body: JSON.stringify(input),
      },
    );
  }
  reviewInspection(organisationId: string, inspectionId: string, approved: boolean) {
    return this.request<{
      inspection: {
        id: string;
        status: string;
        reviewedAt?: string;
        approvedAt?: string;
      };
    }>(`/inspections/${inspectionId}/review?organisationId=${encodeURIComponent(organisationId)}`, {
      method: 'POST',
      body: JSON.stringify({ approved }),
    });
  }
  overrideInspection(
    organisationId: string,
    inspectionId: string,
    input: {
      reason: string;
      data: Record<string, unknown>;
      evData?: {
        stableDetails: Record<string, unknown>;
        supplyTests: unknown[];
        connectorTests: unknown[];
        functionalChecks: Record<string, unknown>;
        engineerObservations?: string;
      };
      defects?: Array<{
        id: string;
        title: string;
        description?: string;
        severity: string;
        status: string;
      }>;
    },
  ) {
    return this.request(
      '/inspections/' +
        inspectionId +
        '/override?organisationId=' +
        encodeURIComponent(organisationId),
      { method: 'POST', body: JSON.stringify(input) },
    );
  }
  reviewProposedAssetChange(
    organisationId: string,
    changeId: string,
    approved: boolean,
    resolvedData?: Record<string, unknown>,
  ) {
    return this.request<{
      change: { id: string; status: string; reviewedAt?: string };
    }>(
      `/proposed-asset-changes/${changeId}/review?organisationId=${encodeURIComponent(organisationId)}`,
      {
        method: 'POST',
        body: JSON.stringify({
          approved,
          ...(resolvedData === undefined ? {} : { resolvedData }),
        }),
      },
    );
  }
  issueInspectionDocument(organisationId: string, inspectionId: string) {
    return this.request<{ document: ReportSummary }>(
      `/inspections/${inspectionId}/documents?organisationId=${encodeURIComponent(organisationId)}`,
      { method: 'POST' },
    );
  }
  issueVisitDocuments(organisationId: string, visitId: string) {
    return this.request<{ documents: ReportSummary[] }>(
      `/visits/${visitId}/documents?organisationId=${encodeURIComponent(organisationId)}`,
      { method: 'POST' },
    );
  }
  syncVisitMutation(
    organisationId: string,
    visitId: string,
    input: {
      clientMutationId: string;
      entityType: string;
      operation: string;
      payload: Record<string, unknown>;
    },
  ) {
    return this.request(
      `/visits/${visitId}/sync?organisationId=${encodeURIComponent(organisationId)}`,
      { method: 'POST', body: JSON.stringify(input) },
    );
  }
  getEvAsset(organisationId: string, assetId: string) {
    return this.request<{
      asset: AssetSummary & {
        customer: { id: string; name: string };
        site: { id: string; name: string };
        evChargePoint?: EvChargePoint;
      };
    }>(`/modules/ev/assets/${assetId}?organisationId=${encodeURIComponent(organisationId)}`);
  }
  saveEvChargePoint(organisationId: string, assetId: string, input: Record<string, unknown>) {
    return this.request(
      `/modules/ev/assets/${assetId}?organisationId=${encodeURIComponent(organisationId)}`,
      { method: 'PUT', body: JSON.stringify(input) },
    );
  }
  addEvSupply(organisationId: string, assetId: string, input: Record<string, unknown>) {
    return this.request(
      `/modules/ev/assets/${assetId}/supplies?organisationId=${encodeURIComponent(organisationId)}`,
      { method: 'POST', body: JSON.stringify(input) },
    );
  }
  updateEvSupply(
    organisationId: string,
    assetId: string,
    supplyId: string,
    input: Record<string, unknown>,
  ) {
    return this.request(
      `/modules/ev/assets/${assetId}/supplies/${supplyId}?organisationId=${encodeURIComponent(organisationId)}`,
      { method: 'PUT', body: JSON.stringify(input) },
    );
  }
  deleteEvSupply(organisationId: string, assetId: string, supplyId: string) {
    return this.request(
      `/modules/ev/assets/${assetId}/supplies/${supplyId}?organisationId=${encodeURIComponent(organisationId)}`,
      { method: 'DELETE' },
    );
  }
  addEvConnector(organisationId: string, assetId: string, input: Record<string, unknown>) {
    return this.request(
      `/modules/ev/assets/${assetId}/connectors?organisationId=${encodeURIComponent(organisationId)}`,
      { method: 'POST', body: JSON.stringify(input) },
    );
  }
  updateEvConnector(
    organisationId: string,
    assetId: string,
    connectorId: string,
    input: Record<string, unknown>,
  ) {
    return this.request(
      `/modules/ev/assets/${assetId}/connectors/${connectorId}?organisationId=${encodeURIComponent(organisationId)}`,
      { method: 'PUT', body: JSON.stringify(input) },
    );
  }
  deleteEvConnector(organisationId: string, assetId: string, connectorId: string) {
    return this.request(
      `/modules/ev/assets/${assetId}/connectors/${connectorId}?organisationId=${encodeURIComponent(organisationId)}`,
      { method: 'DELETE' },
    );
  }
}
