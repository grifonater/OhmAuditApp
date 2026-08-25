import { Injectable, inject, signal } from '@angular/core';
import Dexie, { type Table } from 'dexie';
import { ApiService, type VisitSummary } from './api.service';

interface StoredVisitPack {
  visitId: string;
  organisationId: string;
  guestToken?: string;
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
  createdAt: string;
}
interface StoredAssetImage {
  mediaId: string;
  blob: Blob;
  cachedAt: string;
}

class OhmAuditOfflineDatabase extends Dexie {
  visitPacks!: Table<StoredVisitPack, string>;
  drafts!: Table<InspectionDraft, string>;
  outbox!: Table<OutboxMutation, string>;
  photos!: Table<OfflinePhoto, string>;
  assetImages!: Table<StoredAssetImage, string>;
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
  }
}

@Injectable({ providedIn: 'root' })
export class OfflineVisitService {
  private readonly api = inject(ApiService);
  private readonly database = new OhmAuditOfflineDatabase();
  readonly online = signal(navigator.onLine);
  readonly syncing = signal(false);
  constructor() {
    window.addEventListener('online', () => {
      this.online.set(true);
      void this.syncOutbox();
    });
    window.addEventListener('offline', () => this.online.set(false));
  }
  async storePack(organisationId: string, visit: VisitSummary, guestToken?: string): Promise<void> {
    const visitId = guestToken === undefined ? visit.id : this.guestPackKey(guestToken);
    await this.database.visitPacks.put({
      visitId,
      organisationId,
      ...(guestToken === undefined ? {} : { guestToken }),
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
    file: File,
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
      createdAt: new Date().toISOString(),
    });
    return id;
  }
  async photoCount(inspectionId: string): Promise<number> {
    return this.database.photos.where('inspectionId').equals(inspectionId).count();
  }
  async storeAssetImage(mediaId: string, blob: Blob): Promise<void> {
    await this.database.assetImages.put({ mediaId, blob, cachedAt: new Date().toISOString() });
  }
  async assetImage(mediaId: string): Promise<Blob | undefined> {
    return (await this.database.assetImages.get(mediaId))?.blob;
  }
  async uploadInspectionPhotos(inspectionId: string): Promise<string[]> {
    if (!this.online()) return [];
    const mediaIds: string[] = [];
    for (const photo of await this.database.photos
      .where('inspectionId')
      .equals(inspectionId)
      .toArray()) {
      const media =
        photo.guestToken === undefined
          ? (
              await this.api.registerMedia(photo.organisationId, {
                entityType: 'Asset',
                entityId: photo.assetId,
                category: 'inspection-fault',
                caption: 'Engineer inspection evidence',
                mimeType: photo.mimeType as 'image/jpeg' | 'image/png' | 'image/webp',
                size: photo.blob.size,
              })
            ).media
          : (await this.api.uploadGuestInspectionPhoto(photo.guestToken, inspectionId, photo.blob))
              .media;
      if (photo.guestToken === undefined)
        await this.api.uploadMedia(photo.organisationId, media.id, photo.blob);
      mediaIds.push(media.id);
      await this.database.photos.delete(photo.id);
    }
    return mediaIds;
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
            await this.api.submitGuestInspection(
              mutation.guestToken,
              inspectionId,
              this.withPhotoIds(submission, mediaIds),
              mutation.id,
            );
          } else {
            const inspectionId = mutation.payload['inspectionId'];
            const mediaIds =
              typeof inspectionId === 'string'
                ? await this.uploadInspectionPhotos(inspectionId)
                : [];
            const payload =
              typeof inspectionId === 'string' &&
              typeof mutation.payload['submission'] === 'object' &&
              mutation.payload['submission'] !== null
                ? {
                    ...mutation.payload,
                    submission: this.withPhotoIds(
                      mutation.payload['submission'] as Record<string, unknown>,
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
}
