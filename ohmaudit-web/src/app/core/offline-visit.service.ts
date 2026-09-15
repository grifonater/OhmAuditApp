import { Injectable, inject, signal } from '@angular/core';
import Dexie, { type Table } from 'dexie';
import {
  ApiService,
  type AssetMedia,
  type InspectionSummary,
  type OrganisationEquipment,
  type VisitSummary,
  type VisitTask,
} from './api.service';
import { AuthService } from './auth.service';
import {
  buildMediaMetadataUpdateBody,
  remapThermalSubmissionIds,
} from '../operations/thermal-inspection.helpers';
import {
  authenticatedPackIsReadyForOwner,
  buildOptimisticEvTask,
  canRestoreLegacyPack,
  attachFindingPhotoIds,
  type FindingPhotoMappings,
  idReplacements,
  offlineRecordIsVisible,
  remapLocalIds,
  unsupportedOfflineModule,
  type EvChargerInput,
  type LocalEvChargerIds,
  type VisitIdMap,
} from './offline-visit.helpers';

export interface StoredVisitPack {
  visitId: string;
  organisationId: string;
  guestToken?: string;
  ownerUserId?: string;
  visit: VisitSummary;
  downloadedAt: string;
  ready: boolean;
}
interface InspectionDraft {
  inspectionId: string;
  visitId: string;
  organisationId: string;
  data: Record<string, unknown>;
  updatedAt: string;
  serverSyncedAt?: string;
  ownerUserId?: string;
  guestToken?: string;
}
interface OutboxMutation {
  id: string;
  visitId: string;
  organisationId: string;
  taskId?: string;
  guestToken?: string;
  entityType: string;
  operation: string;
  payload: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  ownerUserId?: string;
  lastAttemptAt?: string;
  lastError?: string;
}
interface OfflinePhoto {
  id: string;
  organisationId: string;
  visitId: string;
  inspectionId: string;
  assetId: string;
  guestToken?: string;
  blob: Blob;
  mimeType: string;
  kind: 'fault' | 'normal-state' | 'data-plate';
  findingId?: string;
  description: string;
  serverMediaId?: string;
  createdAt: string;
  ownerUserId?: string;
}
export type OwnedOfflinePhoto = Pick<
  OfflinePhoto,
  'id' | 'inspectionId' | 'kind' | 'findingId' | 'description' | 'serverMediaId' | 'createdAt'
>;
interface StoredAssetImage {
  mediaId: string;
  blob: Blob;
  cachedAt: string;
  ownerUserId?: string;
  guestToken?: string;
}
interface StoredThermalContext {
  inspectionId: string;
  inspection: InspectionSummary;
  equipment: OrganisationEquipment[];
  cachedAt: string;
  guestToken?: string;
  ownerUserId?: string;
}
interface OfflineThermalImage {
  id: string;
  organisationId: string;
  visitId: string;
  inspectionId: string;
  guestToken?: string;
  media: AssetMedia;
  blob: Blob;
  serverMediaId?: string;
  metadataDirty?: boolean;
  createdAt: string;
  ownerUserId?: string;
}

class OhmAuditOfflineDatabase extends Dexie {
  visitPacks!: Table<StoredVisitPack, string>;
  drafts!: Table<InspectionDraft, string>;
  outbox!: Table<OutboxMutation, string>;
  photos!: Table<OfflinePhoto, string>;
  assetImages!: Table<StoredAssetImage, string>;
  thermalContexts!: Table<StoredThermalContext, string>;
  thermalImages!: Table<OfflineThermalImage, string>;
  constructor() {
    super('ohmaudit-offline');
    this.version(1).stores({
      visitPacks: 'visitId, organisationId, downloadedAt',
      drafts: 'inspectionId, visitId, organisationId, updatedAt',
      outbox: 'id, visitId, organisationId, createdAt',
    });
    this.version(2).stores({
      visitPacks: 'visitId, organisationId, downloadedAt',
      drafts: 'inspectionId, visitId, organisationId, updatedAt',
      outbox: 'id, visitId, organisationId, createdAt',
      photos: 'id, visitId, inspectionId, createdAt',
    });
    this.version(3).stores({
      visitPacks: 'visitId, organisationId, downloadedAt',
      drafts: 'inspectionId, visitId, organisationId, updatedAt',
      outbox: 'id, visitId, organisationId, createdAt',
      photos: 'id, visitId, inspectionId, organisationId, assetId, createdAt',
    });
    this.version(4).stores({
      visitPacks: 'visitId, organisationId, downloadedAt',
      drafts: 'inspectionId, visitId, organisationId, updatedAt',
      outbox: 'id, visitId, organisationId, createdAt',
      photos: 'id, visitId, inspectionId, organisationId, assetId, createdAt',
      assetImages: 'mediaId, cachedAt',
    });
    this.version(5).stores({
      visitPacks: 'visitId, organisationId, guestToken, downloadedAt',
      drafts: 'inspectionId, visitId, organisationId, updatedAt',
      outbox: 'id, visitId, organisationId, createdAt',
      photos: 'id, visitId, inspectionId, organisationId, assetId, createdAt',
      assetImages: 'mediaId, cachedAt',
    });
    this.version(6)
      .stores({
        visitPacks: 'visitId, organisationId, guestToken, downloadedAt',
        drafts: 'inspectionId, visitId, organisationId, updatedAt',
        outbox: 'id, visitId, organisationId, createdAt',
        photos: 'id, visitId, inspectionId, organisationId, assetId, kind, createdAt',
        assetImages: 'mediaId, cachedAt',
      })
      .upgrade(async (transaction) => {
        await transaction
          .table<OfflinePhoto, string>('photos')
          .toCollection()
          .modify((photo) => {
            photo.kind = photo.kind ?? 'fault';
            photo.description = photo.description ?? 'Engineer inspection evidence';
          });
      });
    this.version(7).stores({
      visitPacks: 'visitId, organisationId, guestToken, downloadedAt',
      drafts: 'inspectionId, visitId, organisationId, updatedAt',
      outbox: 'id, visitId, organisationId, createdAt',
      photos: 'id, visitId, inspectionId, organisationId, assetId, kind, createdAt',
      assetImages: 'mediaId, cachedAt',
      thermalContexts: 'inspectionId, cachedAt',
      thermalImages: 'id, inspectionId, visitId, organisationId, createdAt',
    });
    this.version(8).stores({
      visitPacks: 'visitId, organisationId, guestToken, ownerUserId, downloadedAt',
      drafts: 'inspectionId, visitId, organisationId, updatedAt',
      outbox: 'id, visitId, organisationId, createdAt',
      photos: 'id, visitId, inspectionId, organisationId, assetId, kind, createdAt',
      assetImages: 'mediaId, cachedAt',
      thermalContexts: 'inspectionId, cachedAt',
      thermalImages: 'id, inspectionId, visitId, organisationId, createdAt',
    });
    this.version(9)
      .stores({
        visitPacks: 'visitId, organisationId, guestToken, ownerUserId, ready, downloadedAt',
        drafts: 'inspectionId, visitId, organisationId, ownerUserId, guestToken, updatedAt',
        outbox: 'id, visitId, organisationId, ownerUserId, createdAt',
        photos: 'id, visitId, inspectionId, organisationId, ownerUserId, assetId, kind, createdAt',
        assetImages: 'mediaId, ownerUserId, guestToken, cachedAt',
        thermalContexts: 'inspectionId, ownerUserId, guestToken, cachedAt',
        thermalImages: 'id, inspectionId, visitId, organisationId, ownerUserId, createdAt',
      })
      .upgrade(async (transaction) => {
        // Ownership cannot be inferred safely. Keep token-owned guest data, but never claim legacy
        // authenticated data for whichever user happens to open this database next.
        for (const tableName of [
          'visitPacks',
          'drafts',
          'outbox',
          'photos',
          'thermalContexts',
          'thermalImages',
        ]) {
          await transaction
            .table<{ ownerUserId?: string; guestToken?: string }, string>(tableName)
            .filter((row) => row.ownerUserId === undefined && row.guestToken === undefined)
            .delete();
        }
        await transaction.table('assetImages').clear();
        await transaction
          .table<StoredVisitPack, string>('visitPacks')
          .toCollection()
          .modify((pack) => {
            pack.ready = false;
          });
      });
    this.version(10)
      .stores({
        visitPacks: 'visitId, organisationId, guestToken, ownerUserId, ready, downloadedAt',
        drafts: 'inspectionId, visitId, organisationId, ownerUserId, guestToken, updatedAt',
        outbox: 'id, visitId, organisationId, ownerUserId, createdAt',
        photos: 'id, visitId, inspectionId, organisationId, ownerUserId, assetId, kind, createdAt',
        assetImages: 'mediaId, ownerUserId, guestToken, cachedAt',
        thermalContexts: 'inspectionId, ownerUserId, guestToken, cachedAt',
        thermalImages: 'id, inspectionId, visitId, organisationId, ownerUserId, createdAt',
      })
      .upgrade(async (transaction) => {
        await transaction
          .table<StoredVisitPack, string>('visitPacks')
          .filter(
            (pack) =>
              pack.ready !== true &&
              pack.ownerUserId !== undefined &&
              pack.guestToken === undefined &&
              canRestoreLegacyPack(pack.visit.tasks),
          )
          .modify((pack) => {
            pack.ready = true;
          });
      });
    this.version(11).stores({
      visitPacks: 'visitId, organisationId, guestToken, ownerUserId, ready, downloadedAt',
      drafts: 'inspectionId, visitId, organisationId, ownerUserId, guestToken, updatedAt',
      outbox: 'id, visitId, organisationId, ownerUserId, operation, createdAt',
      photos: 'id, visitId, inspectionId, organisationId, ownerUserId, assetId, kind, createdAt',
      assetImages: 'mediaId, ownerUserId, guestToken, cachedAt',
      thermalContexts: 'inspectionId, ownerUserId, guestToken, cachedAt',
      thermalImages: 'id, inspectionId, visitId, organisationId, ownerUserId, createdAt',
    });
    this.version(12).stores({
      visitPacks: 'visitId, organisationId, guestToken, ownerUserId, ready, downloadedAt',
      drafts: 'inspectionId, visitId, organisationId, ownerUserId, guestToken, updatedAt',
      outbox: 'id, visitId, organisationId, ownerUserId, operation, createdAt',
      photos:
        'id, visitId, inspectionId, organisationId, ownerUserId, assetId, kind, findingId, createdAt',
      assetImages: 'mediaId, ownerUserId, guestToken, cachedAt',
      thermalContexts: 'inspectionId, ownerUserId, guestToken, cachedAt',
      thermalImages: 'id, inspectionId, visitId, organisationId, ownerUserId, createdAt',
    });
  }
}

@Injectable({ providedIn: 'root' })
export class OfflineVisitService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly database = new OhmAuditOfflineDatabase();
  readonly online = signal(navigator.onLine);
  readonly syncing = signal(false);
  readonly syncComplete = signal('');
  readonly notificationPermission = signal<NotificationPermission>(
    typeof Notification === 'undefined' ? 'denied' : Notification.permission,
  );
  private syncRequested = false;
  constructor() {
    window.addEventListener('online', () => {
      this.online.set(true);
      void this.syncOutbox();
    });
    window.addEventListener('offline', () => this.online.set(false));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void this.syncOutbox();
    });
    if (this.online()) setTimeout(() => void this.syncOutbox(), 0);
  }
  async storePack(organisationId: string, visit: VisitSummary, guestToken?: string): Promise<void> {
    const visitId = guestToken === undefined ? visit.id : this.guestPackKey(guestToken);
    const existing = await this.database.visitPacks.get(visitId);
    await this.database.visitPacks.put({
      visitId,
      organisationId,
      ...(guestToken === undefined ? {} : { guestToken }),
      ...this.ownerFields(guestToken),
      visit,
      downloadedAt: new Date().toISOString(),
      ready: existing?.ready ?? false,
    });
    if ((await this.database.visitPacks.get(visitId)) === undefined)
      throw new Error('The offline job could not be verified on this device.');
  }
  async pack(visitId: string, guestToken?: string): Promise<VisitSummary | undefined> {
    if (guestToken === undefined) {
      const stored = await this.database.visitPacks.get(visitId);
      return stored !== undefined &&
        authenticatedPackIsReadyForOwner(stored, this.auth.lastAuthenticatedUserId())
        ? stored.visit
        : undefined;
    }
    const stored =
      (await this.database.visitPacks.get(this.guestPackKey(guestToken))) ??
      (await this.database.visitPacks.where('guestToken').equals(guestToken).first());
    return stored?.ready === true && stored.guestToken === guestToken ? stored.visit : undefined;
  }
  async packs(organisationId: string): Promise<StoredVisitPack[]> {
    const packs = await this.database.visitPacks
      .where('organisationId')
      .equals(organisationId)
      .toArray();
    return packs
      .filter((pack) => this.canAccessPack(pack))
      .sort((left, right) => right.downloadedAt.localeCompare(left.downloadedAt));
  }
  async allPacks(): Promise<StoredVisitPack[]> {
    const packs = await this.database.visitPacks.toArray();
    return packs
      .filter((pack) => this.canAccessPack(pack))
      .sort((left, right) => right.downloadedAt.localeCompare(left.downloadedAt));
  }
  async hasPack(organisationId: string, visitId?: string): Promise<boolean> {
    if (visitId !== undefined) {
      const stored = await this.database.visitPacks.get(visitId);
      return stored?.organisationId === organisationId && this.canAccessPack(stored);
    }
    return (await this.packs(organisationId)).length > 0;
  }

  async packMetadata(
    visitId: string,
    guestToken?: string,
  ): Promise<Pick<StoredVisitPack, 'downloadedAt' | 'ready'> | undefined> {
    const key = guestToken === undefined ? visitId : this.guestPackKey(guestToken);
    const stored = await this.database.visitPacks.get(key);
    if (stored === undefined || !stored.ready) return undefined;
    const visible =
      guestToken === undefined ? this.canAccessPackOwner(stored) : stored.guestToken === guestToken;
    return visible ? { downloadedAt: stored.downloadedAt, ready: stored.ready } : undefined;
  }

  async updateCachedVisit(visit: VisitSummary, guestToken?: string): Promise<void> {
    const key = guestToken === undefined ? visit.id : this.guestPackKey(guestToken);
    const stored = await this.database.visitPacks.get(key);
    const owner = guestToken === undefined ? this.ownerFields() : { guestToken };
    if (stored !== undefined && stored.ready && this.sameOwner(stored, owner))
      await this.database.visitPacks.update(key, { visit });
  }

  private canAccessPack(pack: StoredVisitPack): boolean {
    if (!pack.ready) return false;
    if (pack.guestToken !== undefined) return pack.guestToken === this.activeGuestToken();
    return authenticatedPackIsReadyForOwner(pack, this.auth.lastAuthenticatedUserId());
  }

  private ownerFields(guestToken?: string): { ownerUserId?: string } {
    if (guestToken !== undefined) return {};
    const ownerUserId = this.auth.lastAuthenticatedUserId();
    if (ownerUserId === undefined)
      throw new Error('Authentication is required for offline storage.');
    return { ownerUserId };
  }

  private canAccessOwned(row: { ownerUserId?: string; guestToken?: string }): boolean {
    return offlineRecordIsVisible(
      row,
      this.auth.lastAuthenticatedUserId(),
      this.activeGuestToken(),
    );
  }

  private canDrainOwned(row: { ownerUserId?: string; guestToken?: string }): boolean {
    return (
      row.guestToken !== undefined ||
      (row.ownerUserId !== undefined && row.ownerUserId === this.auth.lastAuthenticatedUserId())
    );
  }

  private activeGuestToken(): string | undefined {
    const match = /^\/guest\/(?:job|visit)\/([^/]+)/.exec(globalThis.location?.pathname ?? '');
    return match?.[1] === undefined ? undefined : decodeURIComponent(match[1]);
  }

  private sameOwner(
    row: { ownerUserId?: string; guestToken?: string },
    owner: { ownerUserId?: string; guestToken?: string },
  ): boolean {
    return owner.guestToken !== undefined
      ? row.guestToken === owner.guestToken
      : row.guestToken === undefined && row.ownerUserId === owner.ownerUserId;
  }

  private draftOwnerFields(): { ownerUserId?: string; guestToken?: string } {
    const guestToken = this.activeGuestToken();
    return guestToken === undefined ? this.ownerFields() : { guestToken };
  }

  private guestPackKey(guestToken: string): string {
    return `guest:${guestToken}`;
  }
  async saveDraft(
    organisationId: string,
    visitId: string,
    inspectionId: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const owner = this.draftOwnerFields();
    const draft: InspectionDraft = {
      organisationId,
      visitId,
      inspectionId,
      data,
      updatedAt: new Date().toISOString(),
      ...owner,
    };
    await this.database.drafts.put(draft);
    if (this.online()) {
      try {
        await this.syncDraft(draft);
      } catch {
        // The local copy remains authoritative until the next online retry.
      }
    }
  }
  async draft(inspectionId: string): Promise<Record<string, unknown> | undefined> {
    const draft = await this.database.drafts.get(inspectionId);
    return draft !== undefined && this.canAccessOwned(draft) ? draft.data : undefined;
  }
  async discardDraft(inspectionId: string): Promise<void> {
    const draft = await this.database.drafts.get(inspectionId);
    if (draft !== undefined && this.canAccessOwned(draft))
      await this.database.drafts.delete(inspectionId);
  }
  async queue(
    organisationId: string,
    visitId: string,
    entityType: string,
    operation: string,
    payload: Record<string, unknown>,
    taskId?: string,
  ): Promise<void> {
    await this.database.outbox.put({
      id: crypto.randomUUID(),
      organisationId,
      visitId,
      ...(taskId === undefined ? {} : { taskId }),
      entityType,
      operation,
      payload,
      createdAt: new Date().toISOString(),
      attempts: 0,
      ...this.ownerFields(),
    });
    if (this.online()) await this.syncOutbox();
  }
  async queueGuest(
    guestToken: string,
    organisationId: string,
    visitId: string,
    taskId: string,
    inspectionId: string,
    submission: Record<string, unknown>,
  ): Promise<void> {
    await this.database.outbox.put({
      id: crypto.randomUUID(),
      organisationId,
      visitId,
      taskId,
      guestToken,
      entityType: 'Inspection',
      operation: 'SUBMIT_INSPECTION',
      payload: { inspectionId, submission },
      createdAt: new Date().toISOString(),
      attempts: 0,
    });
    if (this.online()) await this.syncOutbox();
  }

  async queueAddEvCharger(
    visit: VisitSummary,
    asset: EvChargerInput,
    guestToken?: string,
    localIds: LocalEvChargerIds = {
      assetId: crypto.randomUUID(),
      chargePointId: crypto.randomUUID(),
      taskId: crypto.randomUUID(),
      inspectionId: crypto.randomUUID(),
    },
  ): Promise<{ visit: VisitSummary; task: VisitTask; inspection: InspectionSummary }> {
    const owner = guestToken === undefined ? this.ownerFields() : { guestToken };
    const optimistic = buildOptimisticEvTask(asset, localIds);
    const task = optimistic.task as unknown as VisitTask;
    const inspection = optimistic.inspection as unknown as InspectionSummary;
    const updatedVisit = { ...visit, tasks: [...visit.tasks, task] };
    const mutation: OutboxMutation = {
      id: crypto.randomUUID(),
      organisationId: visit.organisationId,
      visitId: visit.id,
      taskId: localIds.taskId,
      ...(guestToken === undefined ? {} : { guestToken }),
      entityType: 'EvCharger',
      operation: 'ADD_EV_CHARGER',
      payload: { localIds, asset },
      createdAt: new Date().toISOString(),
      attempts: 0,
      ...owner,
    };
    const packKey = guestToken === undefined ? visit.id : this.guestPackKey(guestToken);
    await this.database.transaction(
      'rw',
      this.database.visitPacks,
      this.database.outbox,
      async () => {
        const pack = await this.database.visitPacks.get(packKey);
        if (!this.online() && (pack === undefined || !pack.ready || !this.sameOwner(pack, owner)))
          throw new Error('Download this job before adding a charger offline.');
        if (pack !== undefined && this.sameOwner(pack, owner))
          await this.database.visitPacks.update(packKey, { visit: updatedVisit });
        else if (pack === undefined && this.online())
          await this.database.visitPacks.put({
            visitId: packKey,
            organisationId: visit.organisationId,
            ...(guestToken === undefined ? {} : { guestToken }),
            ...owner,
            visit: updatedVisit,
            downloadedAt: new Date().toISOString(),
            ready: false,
          });
        await this.database.outbox.put(mutation);
      },
    );
    if (this.online()) await this.syncOutbox();
    const syncedVisit = (await this.database.visitPacks.get(packKey))?.visit ?? updatedVisit;
    const syncedTask =
      [...syncedVisit.tasks]
        .reverse()
        .find((item) => item.asset?.assetReference === asset.assetReference) ?? task;
    return {
      visit: syncedVisit,
      task: syncedTask,
      inspection: (syncedTask.inspection as InspectionSummary | undefined) ?? inspection,
    };
  }
  async pendingCount(): Promise<number> {
    return (await this.database.outbox.toArray()).filter((row) => this.canAccessOwned(row)).length;
  }
  async pendingTaskIds(visit: VisitSummary): Promise<Set<string>> {
    const taskIds = (await this.database.outbox.where('visitId').equals(visit.id).toArray())
      .filter((row) => row.operation === 'SUBMIT_INSPECTION' && this.canAccessOwned(row))
      .map((mutation) => {
        if (mutation.taskId !== undefined) return mutation.taskId;
        const inspectionId = mutation.payload['inspectionId'];
        if (typeof inspectionId !== 'string') return undefined;
        return visit.tasks.find((task) => task.inspection?.id === inspectionId)?.id;
      })
      .filter((taskId): taskId is string => taskId !== undefined);
    return new Set(taskIds);
  }
  async pendingAddTaskIdsForVisit(visitId: string): Promise<Set<string>> {
    return new Set(
      (await this.database.outbox.where('visitId').equals(visitId).toArray())
        .filter(
          (row) => row.operation === 'ADD_EV_CHARGER' && this.canAccessOwned(row) && row.taskId,
        )
        .map((row) => row.taskId!),
    );
  }
  async storePhoto(
    organisationId: string,
    visitId: string,
    inspectionId: string,
    assetId: string,
    guestToken: string | undefined,
    file: Blob,
    kind: 'fault' | 'normal-state' | 'data-plate' = 'fault',
    description = 'Engineer inspection evidence',
    findingId?: string,
  ): Promise<string> {
    const id = crypto.randomUUID();
    await this.database.photos.put({
      id,
      organisationId,
      visitId,
      inspectionId,
      assetId,
      ...(guestToken === undefined ? {} : { guestToken }),
      blob: file,
      mimeType: file.type,
      kind,
      ...(findingId === undefined ? {} : { findingId }),
      description,
      createdAt: new Date().toISOString(),
      ...this.ownerFields(guestToken),
    });
    return id;
  }
  async photos(
    inspectionId: string,
    kind?: OfflinePhoto['kind'],
    findingId?: string,
  ): Promise<OwnedOfflinePhoto[]> {
    return (await this.database.photos.where('inspectionId').equals(inspectionId).toArray())
      .filter(
        (photo) =>
          this.canAccessOwned(photo) &&
          (kind === undefined || photo.kind === kind) &&
          (findingId === undefined || photo.findingId === findingId),
      )
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((photo) => ({
        id: photo.id,
        inspectionId: photo.inspectionId,
        kind: photo.kind,
        ...(photo.findingId === undefined ? {} : { findingId: photo.findingId }),
        description: photo.description,
        ...(photo.serverMediaId === undefined ? {} : { serverMediaId: photo.serverMediaId }),
        createdAt: photo.createdAt,
      }));
  }
  async photoBlob(id: string): Promise<Blob | undefined> {
    const photo = await this.database.photos.get(id);
    return photo !== undefined && this.canAccessOwned(photo) ? photo.blob : undefined;
  }
  async deletePhoto(id: string): Promise<void> {
    const photo = await this.database.photos.get(id);
    if (photo === undefined || !this.canAccessOwned(photo)) return;
    if (photo.serverMediaId !== undefined && this.online()) {
      if (photo.guestToken === undefined)
        await this.api.deleteInspectionAssetPhoto(
          photo.organisationId,
          photo.inspectionId,
          photo.serverMediaId,
        );
      else
        await this.api.deleteGuestInspectionAssetPhoto(
          photo.guestToken,
          photo.inspectionId,
          photo.serverMediaId,
        );
    }
    await this.database.photos.delete(id);
  }
  async photoCount(
    inspectionId: string,
    kind?: 'fault' | 'normal-state' | 'data-plate',
  ): Promise<number> {
    const photos = (
      await this.database.photos.where('inspectionId').equals(inspectionId).toArray()
    ).filter((photo) => this.canAccessOwned(photo));
    return kind === undefined
      ? photos.length
      : photos.filter((photo) => photo.kind === kind).length;
  }
  async storeAssetImage(mediaId: string, blob: Blob): Promise<void> {
    const guestToken = this.activeGuestToken();
    await this.database.assetImages.put({
      mediaId,
      blob,
      cachedAt: new Date().toISOString(),
      ...(guestToken === undefined ? this.ownerFields() : { guestToken }),
    });
  }
  async assetImage(mediaId: string): Promise<Blob | undefined> {
    const image = await this.database.assetImages.get(mediaId);
    return image !== undefined && this.canAccessOwned(image) ? image.blob : undefined;
  }
  async cacheThermalPack(visit: VisitSummary, guestToken?: string): Promise<void> {
    const unsupported = unsupportedOfflineModule(visit.tasks);
    if (unsupported !== undefined)
      throw new Error(
        `${unsupported} tasks are not yet supported offline; this job was not marked ready.`,
      );
    const thermalTasks = visit.tasks.filter(({ moduleKey }) => moduleKey === 'thermal-imaging');
    if (thermalTasks.length === 0) {
      await this.markPackReady(visit.id, guestToken);
      return;
    }
    const equipment = guestToken
      ? (await this.api.listGuestEquipment(guestToken)).equipment
      : (await this.api.listEquipment(visit.organisationId)).equipment;
    for (const task of thermalTasks) {
      const inspectionId = task.inspection?.id;
      if (!inspectionId) throw new Error('Start thermal tasks before downloading the job.');
      const inspection = guestToken
        ? (await this.api.getGuestInspection(guestToken, inspectionId)).inspection
        : (await this.api.getInspection(visit.organisationId, inspectionId)).inspection;
      await this.database.thermalContexts.put({
        inspectionId,
        inspection,
        equipment,
        cachedAt: new Date().toISOString(),
        ...(guestToken === undefined ? this.ownerFields() : { guestToken }),
      });
      for (const media of inspection.evidenceMedia ?? []) {
        const blob = guestToken
          ? await this.api.downloadGuestMedia(guestToken, media.id)
          : await this.api.downloadMedia(visit.organisationId, media.id);
        await this.database.thermalImages.put({
          id: media.id,
          organisationId: visit.organisationId,
          visitId: visit.id,
          inspectionId,
          ...(guestToken === undefined ? {} : { guestToken }),
          media,
          blob,
          serverMediaId: media.id,
          createdAt: media.createdAt ?? new Date().toISOString(),
          ...this.ownerFields(guestToken),
        });
      }
    }
    await this.markPackReady(visit.id, guestToken);
  }

  private async markPackReady(visitId: string, guestToken?: string): Promise<void> {
    const key = guestToken === undefined ? visitId : this.guestPackKey(guestToken);
    const pack = await this.database.visitPacks.get(key);
    if (
      pack === undefined ||
      (guestToken === undefined ? !this.canAccessPackOwner(pack) : pack.guestToken !== guestToken)
    )
      throw new Error('The offline job could not be finalized on this device.');
    await this.database.visitPacks.update(key, { ready: true });
  }

  private canAccessPackOwner(pack: StoredVisitPack): boolean {
    return (
      pack.ownerUserId !== undefined && pack.ownerUserId === this.auth.lastAuthenticatedUserId()
    );
  }
  async thermalContext(
    inspectionId: string,
  ): Promise<{ inspection: InspectionSummary; equipment: OrganisationEquipment[] } | undefined> {
    const context = await this.database.thermalContexts.get(inspectionId);
    return context === undefined || !this.canAccessOwned(context)
      ? undefined
      : { inspection: context.inspection, equipment: context.equipment };
  }
  async thermalImages(inspectionId: string): Promise<AssetMedia[]> {
    return (await this.database.thermalImages.where('inspectionId').equals(inspectionId).toArray())
      .filter((image) => this.canAccessOwned(image))
      .sort((left, right) => (left.media.sortOrder ?? 0) - (right.media.sortOrder ?? 0))
      .map(({ media }) => media);
  }
  async thermalImageBlob(id: string): Promise<Blob | undefined> {
    const image = await this.database.thermalImages.get(id);
    return image !== undefined && this.canAccessOwned(image) ? image.blob : undefined;
  }
  async storeThermalImage(
    organisationId: string,
    visitId: string,
    inspectionId: string,
    guestToken: string | undefined,
    blob: Blob,
    filename: string,
    sortOrder: number,
  ): Promise<AssetMedia> {
    const id = `offline:${crypto.randomUUID()}`;
    const media: AssetMedia = {
      id,
      category: 'unclassified-image',
      caption: filename,
      originalFilename: filename,
      sortOrder,
      mimeType: blob.type,
      createdAt: new Date().toISOString(),
    };
    await this.database.thermalImages.put({
      id,
      organisationId,
      visitId,
      inspectionId,
      ...(guestToken === undefined ? {} : { guestToken }),
      media,
      blob,
      createdAt: media.createdAt ?? new Date().toISOString(),
      ...this.ownerFields(guestToken),
    });
    return media;
  }
  async cacheThermalImage(
    organisationId: string,
    visitId: string,
    inspectionId: string,
    guestToken: string | undefined,
    media: AssetMedia,
    blob: Blob,
  ): Promise<void> {
    await this.database.thermalImages.put({
      id: media.id,
      organisationId,
      visitId,
      inspectionId,
      ...(guestToken === undefined ? {} : { guestToken }),
      media,
      blob,
      serverMediaId: media.id,
      createdAt: media.createdAt ?? new Date().toISOString(),
      ...this.ownerFields(guestToken),
    });
  }
  async updateThermalImages(updates: Array<{ id: string; media: AssetMedia }>): Promise<void> {
    await this.database.transaction('rw', this.database.thermalImages, async () => {
      for (const update of updates) {
        const stored = await this.database.thermalImages.get(update.id);
        if (stored !== undefined && this.canAccessOwned(stored))
          await this.database.thermalImages.update(update.id, {
            media: update.media,
            metadataDirty: true,
          });
      }
    });
  }
  async markThermalImageMetadataClean(
    updates: Array<{ id: string; media: AssetMedia }>,
  ): Promise<void> {
    await this.database.transaction('rw', this.database.thermalImages, async () => {
      for (const update of updates) {
        const stored = await this.database.thermalImages.get(update.id);
        if (stored !== undefined && this.canAccessOwned(stored))
          await this.database.thermalImages.update(update.id, {
            media: update.media,
            metadataDirty: false,
          });
      }
    });
  }
  async uploadInspectionPhotos(
    inspectionId: string,
    owner?: { ownerUserId?: string; guestToken?: string },
  ): Promise<FindingPhotoMappings> {
    const mappings: FindingPhotoMappings = { byFindingId: {}, legacyUnassigned: [] };
    if (!this.online()) return mappings;
    const photos = await this.database.photos.where('inspectionId').equals(inspectionId).toArray();
    for (const photo of photos.filter((row) =>
      owner === undefined ? this.canAccessOwned(row) : this.sameOwner(row, owner),
    )) {
      let mediaId = photo.serverMediaId;
      if (mediaId === undefined) {
        const result =
          photo.guestToken === undefined
            ? await this.api.uploadInspectionAssetPhoto(
                photo.organisationId,
                inspectionId,
                photo.blob,
                photo.kind,
                photo.description,
                photo.id,
                photo.findingId,
              )
            : await this.api.uploadGuestInspectionAssetPhoto(
                photo.guestToken,
                inspectionId,
                photo.blob,
                photo.kind,
                photo.description,
                photo.id,
                photo.findingId,
              );
        mediaId = result.media.id;
        await this.database.photos.update(photo.id, { serverMediaId: mediaId });
      }
      if (photo.kind === 'fault') {
        if (photo.findingId === undefined) mappings.legacyUnassigned.push(mediaId);
        else (mappings.byFindingId[photo.findingId] ??= []).push(mediaId);
      }
    }
    return mappings;
  }
  async uploadThermalImages(
    inspectionId: string,
    owner?: { ownerUserId?: string; guestToken?: string },
  ): Promise<Record<string, string>> {
    if (!this.online()) return {};
    const ids: Record<string, string> = {};
    const images = await this.database.thermalImages
      .where('inspectionId')
      .equals(inspectionId)
      .toArray();
    const pendingMetadata: Array<{
      localId: string;
      mediaId: string;
      media: AssetMedia;
      guestToken?: string;
      organisationId: string;
    }> = [];
    for (const image of images.filter((row) =>
      owner === undefined ? this.canAccessOwned(row) : this.sameOwner(row, owner),
    )) {
      let serverMediaId = image.serverMediaId;
      if (serverMediaId === undefined) {
        const kind =
          image.media.category === 'thermal-image'
            ? 'thermal'
            : image.media.category === 'standard-image'
              ? 'standard'
              : 'unclassified';
        if (image.guestToken !== undefined) {
          const uploaded = await this.api.uploadGuestThermalImage(
            image.guestToken,
            inspectionId,
            kind,
            image.blob,
            image.media.originalFilename,
            image.id,
          );
          serverMediaId = uploaded.media.id;
          pendingMetadata.push({
            localId: image.id,
            mediaId: serverMediaId,
            media: image.media,
            guestToken: image.guestToken,
            organisationId: image.organisationId,
          });
        } else {
          const registered = await this.api.registerMedia(image.organisationId, {
            entityType: 'Inspection',
            entityId: inspectionId,
            category: image.media.category,
            ...(image.media.caption === undefined ? {} : { caption: image.media.caption }),
            ...(image.media.originalFilename === undefined
              ? {}
              : { originalFilename: image.media.originalFilename }),
            ...(image.media.tags === undefined ? {} : { tags: image.media.tags }),
            ...(image.media.sortOrder === undefined ? {} : { sortOrder: image.media.sortOrder }),
            mimeType: image.blob.type as 'image/jpeg' | 'image/png' | 'image/webp',
            size: image.blob.size,
            ...(image.media.tags === undefined ? {} : { tags: image.media.tags }),
            clientUploadId: image.id,
          });
          serverMediaId = registered.media.id;
          await this.api.uploadMedia(image.organisationId, serverMediaId, image.blob);
        }
        await this.database.thermalImages.update(image.id, {
          serverMediaId,
          metadataDirty: image.guestToken !== undefined,
        });
      } else if (image.metadataDirty) {
        pendingMetadata.push({
          localId: image.id,
          mediaId: serverMediaId,
          media: image.media,
          ...(image.guestToken === undefined ? {} : { guestToken: image.guestToken }),
          organisationId: image.organisationId,
        });
      }
      ids[image.id] = serverMediaId;
    }
    if (pendingMetadata.length) {
      const context = pendingMetadata[0]!;
      const updates = buildMediaMetadataUpdateBody(pendingMetadata).updates;
      const result = context.guestToken
        ? await this.api.updateGuestInspectionMediaBulk(context.guestToken, inspectionId, updates)
        : await this.api.updateInspectionMediaBulk(context.organisationId, inspectionId, updates);
      await this.markThermalImageMetadataClean(
        pendingMetadata.map((item, index) => ({
          id: item.localId,
          media: { ...(result.media[index] ?? item.media), id: item.media.id },
        })),
      );
    }
    return ids;
  }
  async syncOutbox(): Promise<void> {
    this.syncRequested = true;
    if (!this.online() || this.syncing()) return;
    this.syncing.set(true);
    let completed = 0;
    let failed = false;
    try {
      this.syncRequested = false;
      completed += await this.syncStructuralMutations();
      const structuralPending = (await this.database.outbox.toArray()).some(
        (row) => row.operation === 'ADD_EV_CHARGER' && this.canDrainOwned(row),
      );
      if (structuralPending) {
        failed = true;
        return;
      }
      completed += await this.syncDrafts();
      await this.syncEvidencePhotos();
      do {
        this.syncRequested = false;
        const mutation = (await this.database.outbox.orderBy('createdAt').toArray()).find(
          (row) => row.operation !== 'ADD_EV_CHARGER' && this.canDrainOwned(row),
        );
        if (mutation === undefined) break;
        try {
          if (mutation.guestToken !== undefined && mutation.operation === 'SUBMIT_INSPECTION') {
            const inspectionId = mutation.payload['inspectionId'];
            if (typeof inspectionId !== 'string') throw new Error('Inspection ID is missing.');
            const submission = mutation.payload['submission'] as Record<string, unknown>;
            const mediaIds = await this.uploadInspectionPhotos(inspectionId, mutation);
            const thermalIds = await this.uploadThermalImages(inspectionId, mutation);
            await this.api.submitGuestInspection(
              mutation.guestToken,
              inspectionId,
              this.withPhotoIds(this.withThermalIds(submission, thermalIds), mediaIds),
              mutation.id,
            );
          } else {
            const inspectionId = mutation.payload['inspectionId'];
            const mediaIds =
              typeof inspectionId === 'string'
                ? await this.uploadInspectionPhotos(inspectionId, mutation)
                : { byFindingId: {}, legacyUnassigned: [] };
            const thermalIds =
              typeof inspectionId === 'string'
                ? await this.uploadThermalImages(inspectionId, mutation)
                : {};
            const payload =
              typeof inspectionId === 'string' &&
              typeof mutation.payload['submission'] === 'object' &&
              mutation.payload['submission'] !== null
                ? {
                    ...mutation.payload,
                    submission: this.withPhotoIds(
                      this.withThermalIds(
                        mutation.payload['submission'] as Record<string, unknown>,
                        thermalIds,
                      ),
                      mediaIds,
                    ),
                  }
                : mutation.payload;
            await this.api.syncVisitMutation(mutation.organisationId, mutation.visitId, {
              clientMutationId: mutation.id,
              entityType: mutation.entityType,
              operation: mutation.operation,
              payload,
            });
          }
          await this.database.outbox.delete(mutation.id);
          completed += 1;
          const inspectionId = mutation.payload['inspectionId'];
          if (typeof inspectionId === 'string') {
            const photos = await this.database.photos
              .where('inspectionId')
              .equals(inspectionId)
              .toArray();
            await this.database.photos.bulkDelete(
              photos.filter((row) => this.sameOwner(row, mutation)).map(({ id }) => id),
            );
            const images = await this.database.thermalImages
              .where('inspectionId')
              .equals(inspectionId)
              .toArray();
            await this.database.thermalImages.bulkDelete(
              images.filter((row) => this.sameOwner(row, mutation)).map(({ id }) => id),
            );
          }
          if (typeof inspectionId === 'string') {
            const draft = await this.database.drafts.get(inspectionId);
            if (draft !== undefined && this.sameOwner(draft, mutation))
              await this.database.drafts.delete(inspectionId);
          }
        } catch (error: unknown) {
          await this.database.outbox.update(mutation.id, {
            attempts: mutation.attempts + 1,
            lastAttemptAt: new Date().toISOString(),
            lastError: error instanceof Error ? error.message : 'Synchronization failed.',
          });
          failed = true;
          break;
        }
      } while (this.online());
      if (completed > 0 && !failed) this.announceSyncComplete(completed);
    } finally {
      this.syncing.set(false);
      if (this.syncRequested && this.online()) void this.syncOutbox();
    }
  }

  private async syncStructuralMutations(): Promise<number> {
    let completed = 0;
    while (this.online()) {
      const mutation = (await this.database.outbox.orderBy('createdAt').toArray()).find(
        (row) => row.operation === 'ADD_EV_CHARGER' && this.canDrainOwned(row),
      );
      if (mutation === undefined) break;
      try {
        const input = {
          clientMutationId: mutation.id,
          entityType: mutation.entityType,
          operation: mutation.operation,
          payload: mutation.payload,
        };
        const response = mutation.guestToken
          ? await this.api.syncGuestVisitMutation(mutation.guestToken, input)
          : await this.api.syncVisitMutation(mutation.organisationId, mutation.visitId, input);
        const result = response.mutation.result;
        const idMap = result?.idMap ?? {};
        await this.applyStructuralResult(mutation, idMap, result);
        const localIds = mutation.payload['localIds'] as Partial<LocalEvChargerIds> | undefined;
        const inspectionId =
          localIds?.inspectionId === undefined
            ? undefined
            : idReplacements(idMap)[localIds.inspectionId];
        if (inspectionId) await this.uploadInspectionPhotos(inspectionId, mutation);
        completed += 1;
      } catch (error: unknown) {
        await this.database.outbox.update(mutation.id, {
          attempts: mutation.attempts + 1,
          lastAttemptAt: new Date().toISOString(),
          lastError: error instanceof Error ? error.message : 'Synchronization failed.',
        });
        break;
      }
    }
    return completed;
  }

  private async applyStructuralResult(
    mutation: OutboxMutation,
    idMap: VisitIdMap,
    result:
      | {
          asset?: VisitTask['asset'];
          task?: VisitTask;
          inspection?: InspectionSummary;
        }
      | undefined,
  ): Promise<void> {
    const replacements = idReplacements(idMap);
    const localIds = mutation.payload['localIds'] as Partial<LocalEvChargerIds> | undefined;
    await this.database.transaction(
      'rw',
      [
        this.database.visitPacks,
        this.database.drafts,
        this.database.photos,
        this.database.thermalContexts,
        this.database.thermalImages,
        this.database.outbox,
      ],
      async () => {
        const packKey =
          mutation.guestToken === undefined
            ? mutation.visitId
            : this.guestPackKey(mutation.guestToken);
        const pack = await this.database.visitPacks.get(packKey);
        if (pack !== undefined && this.sameOwner(pack, mutation)) {
          const visit = remapLocalIds(pack.visit, replacements);
          const serverTask =
            result?.task === undefined
              ? undefined
              : {
                  ...result.task,
                  ...(result.asset === undefined ? {} : { asset: result.asset }),
                  ...(result.inspection === undefined ? {} : { inspection: result.inspection }),
                };
          await this.database.visitPacks.update(packKey, {
            visit:
              serverTask === undefined
                ? visit
                : {
                    ...visit,
                    tasks: visit.tasks.map((task) =>
                      task.id === serverTask.id || task.id === replacements[localIds?.taskId ?? '']
                        ? serverTask
                        : task,
                    ),
                  },
          });
        }
        for (const draft of (await this.database.drafts.toArray()).filter((row) =>
          this.sameOwner(row, mutation),
        )) {
          const remapped = remapLocalIds(draft, replacements);
          if (remapped.inspectionId !== draft.inspectionId) {
            await this.database.drafts.delete(draft.inspectionId);
            await this.database.drafts.put(remapped);
          } else await this.database.drafts.put(remapped);
        }
        for (const photo of (await this.database.photos.toArray()).filter((row) =>
          this.sameOwner(row, mutation),
        ))
          await this.database.photos.put(remapLocalIds(photo, replacements));
        for (const image of (await this.database.thermalImages.toArray()).filter((row) =>
          this.sameOwner(row, mutation),
        ))
          await this.database.thermalImages.put(remapLocalIds(image, replacements));
        for (const context of (await this.database.thermalContexts.toArray()).filter((row) =>
          this.sameOwner(row, mutation),
        )) {
          const remapped = remapLocalIds(context, replacements);
          if (remapped.inspectionId !== context.inspectionId)
            await this.database.thermalContexts.delete(context.inspectionId);
          await this.database.thermalContexts.put(remapped);
        }
        for (const queued of (await this.database.outbox.toArray()).filter((row) =>
          this.sameOwner(row, mutation),
        )) {
          if (queued.id === mutation.id) continue;
          await this.database.outbox.put(remapLocalIds(queued, replacements));
        }
        await this.database.outbox.delete(mutation.id);
      },
    );
  }

  private async syncDrafts(): Promise<number> {
    let completed = 0;
    for (const draft of (await this.database.drafts.toArray()).filter(
      (row) => this.canDrainOwned(row) && row.serverSyncedAt !== row.updatedAt,
    )) {
      try {
        await this.syncDraft(draft);
        completed += 1;
      } catch {
        // A later online or visibility event retries without losing the device copy.
      }
    }
    return completed;
  }

  private async syncEvidencePhotos(): Promise<void> {
    const photos = (await this.database.photos.toArray()).filter(
      (row) => this.canDrainOwned(row) && row.serverMediaId === undefined,
    );
    for (const inspectionId of new Set(photos.map((photo) => photo.inspectionId)))
      await this.uploadInspectionPhotos(inspectionId);
  }

  private async syncDraft(draft: InspectionDraft): Promise<void> {
    const photoMappings = await this.uploadInspectionPhotos(draft.inspectionId, draft);
    const thermalMediaIds = await this.uploadThermalImages(draft.inspectionId, draft);
    const payload = this.withPhotoIds(
      this.withThermalIds(draft.data, thermalMediaIds),
      photoMappings,
    );
    if (draft.guestToken === undefined)
      await this.api.saveInspectionDraft(draft.organisationId, draft.inspectionId, payload);
    else await this.api.saveGuestInspectionDraft(draft.guestToken, draft.inspectionId, payload);
    const current = await this.database.drafts.get(draft.inspectionId);
    if (current?.updatedAt === draft.updatedAt)
      await this.database.drafts.update(draft.inspectionId, { serverSyncedAt: draft.updatedAt });
  }

  async requestNotificationPermission(): Promise<NotificationPermission> {
    if (typeof Notification === 'undefined') return 'denied';
    const permission = await Notification.requestPermission();
    this.notificationPermission.set(permission);
    return permission;
  }

  private announceSyncComplete(count: number): void {
    const message = `${count} offline change${count === 1 ? '' : 's'} synced successfully.`;
    this.syncComplete.set(message);
    if (
      typeof Notification !== 'undefined' &&
      Notification.permission === 'granted' &&
      globalThis.matchMedia?.('(display-mode: standalone)').matches
    )
      new Notification('OhmAudit sync complete', { body: message });
  }

  withPhotoIds(
    submission: Record<string, unknown>,
    mappings: FindingPhotoMappings,
  ): Record<string, unknown> {
    return attachFindingPhotoIds(submission, mappings);
  }
  withThermalIds(
    submission: Record<string, unknown>,
    mediaIds: Record<string, string>,
  ): Record<string, unknown> {
    return remapThermalSubmissionIds(submission, mediaIds);
  }
}
