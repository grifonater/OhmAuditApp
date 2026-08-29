import { Injectable, inject, signal } from '@angular/core';
import Dexie, { type Table } from 'dexie';
import {
  ApiService,
  type AssetMedia,
  type InspectionSummary,
  type OrganisationEquipment,
  type VisitSummary,
} from './api.service';
import { AuthService } from './auth.service';

export interface StoredVisitPack {
  visitId: string;
  organisationId: string;
  guestToken?: string;
  ownerUserId?: string;
  visit: VisitSummary;
  downloadedAt: string;
}
interface InspectionDraft {
  inspectionId: string;
  visitId: string;
  organisationId: string;
  data: Record<string, unknown>;
  updatedAt: string;
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
  kind: 'fault' | 'normal-state';
  description: string;
  serverMediaId?: string;
  createdAt: string;
}
interface StoredAssetImage {
  mediaId: string;
  blob: Blob;
  cachedAt: string;
}
interface StoredThermalContext {
  inspectionId: string;
  inspection: InspectionSummary;
  equipment: OrganisationEquipment[];
  cachedAt: string;
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
  }
}

@Injectable({ providedIn: 'root' })
export class OfflineVisitService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly database = new OhmAuditOfflineDatabase();
  readonly online = signal(navigator.onLine);
  readonly syncing = signal(false);
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
    await this.database.visitPacks.put({
      visitId,
      organisationId,
      ...(guestToken === undefined ? {} : { guestToken }),
      ...(guestToken !== undefined || this.auth.session() === null
        ? {}
        : { ownerUserId: this.auth.session()!.user.id }),
      visit,
      downloadedAt: new Date().toISOString(),
    });
    if ((await this.database.visitPacks.get(visitId)) === undefined)
      throw new Error('The offline visit could not be verified on this device.');
  }
  async pack(visitId: string, guestToken?: string): Promise<VisitSummary | undefined> {
    if (guestToken === undefined) return (await this.database.visitPacks.get(visitId))?.visit;
    const stored =
      (await this.database.visitPacks.get(this.guestPackKey(guestToken))) ??
      (await this.database.visitPacks.where('guestToken').equals(guestToken).first());
    return stored?.visit;
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

  private canAccessPack(pack: StoredVisitPack): boolean {
    if (pack.guestToken !== undefined) return true;
    return pack.ownerUserId !== undefined && pack.ownerUserId === this.auth.session()?.user.id;
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
    await this.database.drafts.put({
      organisationId,
      visitId,
      inspectionId,
      data,
      updatedAt: new Date().toISOString(),
    });
  }
  async draft(inspectionId: string): Promise<Record<string, unknown> | undefined> {
    return (await this.database.drafts.get(inspectionId))?.data;
  }
  async discardDraft(inspectionId: string): Promise<void> {
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
  async pendingCount(): Promise<number> {
    return this.database.outbox.count();
  }
  async pendingTaskIds(visit: VisitSummary): Promise<Set<string>> {
    const taskIds = (await this.database.outbox.where('visitId').equals(visit.id).toArray())
      .map((mutation) => {
        if (mutation.taskId !== undefined) return mutation.taskId;
        const inspectionId = mutation.payload['inspectionId'];
        if (typeof inspectionId !== 'string') return undefined;
        return visit.tasks.find((task) => task.inspection?.id === inspectionId)?.id;
      })
      .filter((taskId): taskId is string => taskId !== undefined);
    return new Set(taskIds);
  }
  async storePhoto(
    organisationId: string,
    visitId: string,
    inspectionId: string,
    assetId: string,
    guestToken: string | undefined,
    file: Blob,
    kind: 'fault' | 'normal-state' = 'fault',
    description = 'Engineer inspection evidence',
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
      description,
      createdAt: new Date().toISOString(),
    });
    return id;
  }
  async photoCount(inspectionId: string, kind?: 'fault' | 'normal-state'): Promise<number> {
    const photos = await this.database.photos.where('inspectionId').equals(inspectionId).toArray();
    return kind === undefined
      ? photos.length
      : photos.filter((photo) => photo.kind === kind).length;
  }
  async storeAssetImage(mediaId: string, blob: Blob): Promise<void> {
    await this.database.assetImages.put({ mediaId, blob, cachedAt: new Date().toISOString() });
  }
  async assetImage(mediaId: string): Promise<Blob | undefined> {
    return (await this.database.assetImages.get(mediaId))?.blob;
  }
  async cacheThermalPack(visit: VisitSummary, guestToken?: string): Promise<void> {
    const equipment = guestToken
      ? (await this.api.listGuestEquipment(guestToken)).equipment
      : (await this.api.listEquipment(visit.organisationId)).equipment;
    for (const task of visit.tasks.filter(({ moduleKey }) => moduleKey === 'thermal-imaging')) {
      const inspectionId = task.inspection?.id;
      if (!inspectionId) throw new Error('Start thermal tasks before downloading the visit.');
      const inspection = guestToken
        ? (await this.api.getGuestInspection(guestToken, inspectionId)).inspection
        : (await this.api.getInspection(visit.organisationId, inspectionId)).inspection;
      await this.database.thermalContexts.put({
        inspectionId,
        inspection,
        equipment,
        cachedAt: new Date().toISOString(),
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
        });
      }
    }
  }
  async thermalContext(
    inspectionId: string,
  ): Promise<{ inspection: InspectionSummary; equipment: OrganisationEquipment[] } | undefined> {
    const context = await this.database.thermalContexts.get(inspectionId);
    return context === undefined
      ? undefined
      : { inspection: context.inspection, equipment: context.equipment };
  }
  async thermalImages(inspectionId: string): Promise<AssetMedia[]> {
    return (await this.database.thermalImages.where('inspectionId').equals(inspectionId).toArray())
      .sort((left, right) => (left.media.sortOrder ?? 0) - (right.media.sortOrder ?? 0))
      .map(({ media }) => media);
  }
  async thermalImageBlob(id: string): Promise<Blob | undefined> {
    return (await this.database.thermalImages.get(id))?.blob;
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
    });
  }
  async updateThermalImages(updates: Array<{ id: string; media: AssetMedia }>): Promise<void> {
    await this.database.transaction('rw', this.database.thermalImages, async () => {
      for (const update of updates) {
        const stored = await this.database.thermalImages.get(update.id);
        if (stored !== undefined)
          await this.database.thermalImages.update(update.id, {
            media: update.media,
            metadataDirty: true,
          });
      }
    });
  }
  async uploadInspectionPhotos(inspectionId: string): Promise<string[]> {
    if (!this.online()) return [];
    const faultMediaIds: string[] = [];
    for (const photo of await this.database.photos
      .where('inspectionId')
      .equals(inspectionId)
      .toArray()) {
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
              )
            : await this.api.uploadGuestInspectionAssetPhoto(
                photo.guestToken,
                inspectionId,
                photo.blob,
                photo.kind,
                photo.description,
                photo.id,
              );
        mediaId = result.media.id;
        await this.database.photos.update(photo.id, { serverMediaId: mediaId });
      }
      if (photo.kind === 'fault') faultMediaIds.push(mediaId);
    }
    return faultMediaIds;
  }
  async uploadThermalImages(inspectionId: string): Promise<Record<string, string>> {
    if (!this.online()) return {};
    const ids: Record<string, string> = {};
    for (const image of await this.database.thermalImages
      .where('inspectionId')
      .equals(inspectionId)
      .toArray()) {
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
          await this.api.updateGuestMedia(image.guestToken, serverMediaId, {
            category: image.media.category,
            ...(image.media.caption === undefined ? {} : { caption: image.media.caption }),
            ...(image.media.tags === undefined ? {} : { tags: image.media.tags }),
            ...(image.media.sortOrder === undefined ? {} : { sortOrder: image.media.sortOrder }),
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
          metadataDirty: false,
        });
      } else if (image.metadataDirty) {
        const metadata = {
          category: image.media.category,
          ...(image.media.caption === undefined ? {} : { caption: image.media.caption }),
          ...(image.media.tags === undefined ? {} : { tags: image.media.tags }),
          ...(image.media.sortOrder === undefined ? {} : { sortOrder: image.media.sortOrder }),
        };
        if (image.guestToken !== undefined)
          await this.api.updateGuestMedia(image.guestToken, serverMediaId, metadata);
        else await this.api.updateMedia(image.organisationId, serverMediaId, metadata);
        await this.database.thermalImages.update(image.id, { metadataDirty: false });
      }
      ids[image.id] = serverMediaId;
    }
    return ids;
  }
  async syncOutbox(): Promise<void> {
    if (!this.online() || this.syncing()) return;
    this.syncing.set(true);
    try {
      for (const mutation of await this.database.outbox.orderBy('createdAt').toArray()) {
        try {
          if (mutation.guestToken !== undefined && mutation.operation === 'SUBMIT_INSPECTION') {
            const inspectionId = mutation.payload['inspectionId'];
            if (typeof inspectionId !== 'string') throw new Error('Inspection ID is missing.');
            const submission = mutation.payload['submission'] as Record<string, unknown>;
            const mediaIds = await this.uploadInspectionPhotos(inspectionId);
            const thermalIds = await this.uploadThermalImages(inspectionId);
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
                ? await this.uploadInspectionPhotos(inspectionId)
                : [];
            const thermalIds =
              typeof inspectionId === 'string' ? await this.uploadThermalImages(inspectionId) : {};
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
          const inspectionId = mutation.payload['inspectionId'];
          if (typeof inspectionId === 'string')
            await this.database.photos.where('inspectionId').equals(inspectionId).delete();
          if (typeof inspectionId === 'string')
            await this.database.thermalImages.where('inspectionId').equals(inspectionId).delete();
          if (typeof inspectionId === 'string') await this.database.drafts.delete(inspectionId);
        } catch {
          await this.database.outbox.update(mutation.id, { attempts: mutation.attempts + 1 });
        }
      }
    } finally {
      this.syncing.set(false);
    }
  }

  withPhotoIds(submission: Record<string, unknown>, mediaIds: string[]): Record<string, unknown> {
    if (mediaIds.length === 0 || !Array.isArray(submission['defects'])) return submission;
    const defects = submission['defects'] as unknown[];
    return {
      ...submission,
      defects: defects.map((defect) =>
        typeof defect === 'object' && defect !== null
          ? { ...defect, photoMediaIds: mediaIds }
          : defect,
      ),
    };
  }
  withThermalIds(
    submission: Record<string, unknown>,
    mediaIds: Record<string, string>,
  ): Record<string, unknown> {
    if (Object.keys(mediaIds).length === 0) return submission;
    const replace = (value: unknown): unknown => {
      if (typeof value === 'string') return mediaIds[value] ?? value;
      if (Array.isArray(value)) return value.map(replace);
      if (typeof value === 'object' && value !== null)
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replace(item)]));
      return value;
    };
    return replace(submission) as Record<string, unknown>;
  }
}
