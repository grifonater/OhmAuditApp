import { describe, expect, it } from 'vitest';
import {
  authenticatedPackIsReadyForOwner,
  attachVisitFindingPhotoIds,
  buildSubmissionSyncStates,
  buildOptimisticEvTask,
  canRestoreLegacyPack,
  idReplacements,
  moduleLabel,
  offlineRecordIsVisible,
  offlineVisitRoute,
  remapLocalIds,
  unsupportedOfflineModule,
} from '../src/app/core/offline-visit.helpers';

describe('offline ownership', () => {
  it('only exposes authenticated records to the last matching user', () => {
    expect(offlineRecordIsVisible({ ownerUserId: 'user-a' }, 'user-a', undefined)).toBe(true);
    expect(offlineRecordIsVisible({ ownerUserId: 'user-a' }, 'user-b', undefined)).toBe(false);
    expect(offlineRecordIsVisible({}, 'user-a', undefined)).toBe(false);
  });

  it('requires both completed caching and matching ownership for direct pack access', () => {
    expect(authenticatedPackIsReadyForOwner({ ready: true, ownerUserId: 'user-a' }, 'user-a')).toBe(
      true,
    );
    expect(
      authenticatedPackIsReadyForOwner({ ready: false, ownerUserId: 'user-a' }, 'user-a'),
    ).toBe(false);
    expect(authenticatedPackIsReadyForOwner({ ready: true, ownerUserId: 'user-a' }, 'user-b')).toBe(
      false,
    );
    expect(
      authenticatedPackIsReadyForOwner(
        { ready: true, ownerUserId: 'user-a', guestToken: 'guest' },
        'user-a',
      ),
    ).toBe(false);
  });

  it('does not expose token-owned guest records to another guest or signed-in workspace', () => {
    expect(offlineRecordIsVisible({ guestToken: 'token-a' }, undefined, 'token-a')).toBe(true);
    expect(offlineRecordIsVisible({ guestToken: 'token-a' }, 'user-a', 'token-b')).toBe(false);
    expect(offlineRecordIsVisible({ guestToken: 'token-a' }, 'user-a', undefined)).toBe(false);
    expect(offlineRecordIsVisible({ guestToken: 'guest-cache' }, undefined, 'token-a')).toBe(false);
  });
});

describe('offline structural mutations', () => {
  const localIds = {
    assetId: '10000000-0000-4000-8000-000000000001',
    chargePointId: '10000000-0000-4000-8000-000000000002',
    taskId: '10000000-0000-4000-8000-000000000003',
    inspectionId: '10000000-0000-4000-8000-000000000004',
  };

  it('builds a usable optimistic EV task with stable local relationships', () => {
    const optimistic = buildOptimisticEvTask(
      {
        assetReference: 'EVCP-8',
        displayName: 'Rear car park charger',
        maximumPowerKw: 22,
        dcRcdType: 'RDC_DD',
      },
      localIds,
    );
    expect(optimistic.task).toMatchObject({
      id: localIds.taskId,
      title: 'Inspect Rear car park charger',
      moduleKey: 'ev-charging',
      inspection: { id: localIds.inspectionId, status: 'DRAFT' },
      asset: {
        id: localIds.assetId,
        status: 'PROVISIONAL',
        evChargePoint: { id: localIds.chargePointId, maximumPowerKw: 22 },
      },
    });
  });

  it('remaps nested drafts and dependent payload IDs without changing other values', () => {
    const replacements = idReplacements({
      asset: { local: localIds.assetId, server: 'asset-server' },
      inspection: { local: localIds.inspectionId, server: 'inspection-server' },
    });
    expect(
      remapLocalIds(
        {
          inspectionId: localIds.inspectionId,
          submission: { defects: [{ assetId: localIds.assetId }], notes: 'keep me' },
        },
        replacements,
      ),
    ).toEqual({
      inspectionId: 'inspection-server',
      submission: { defects: [{ assetId: 'asset-server' }], notes: 'keep me' },
    });
  });

  it('uses friendly engineer-facing module labels', () => {
    expect(moduleLabel('ev-charging')).toBe('EV charging');
    expect(moduleLabel('emergency-lighting')).toBe('Emergency lighting');
    expect(moduleLabel('custom-module')).toBe('Custom module');
  });
});

describe('offline submission state', () => {
  const tasks = [{ id: 'task-a', inspection: { id: 'inspection-a' } }];

  it('keeps an unattempted queued inspection pending without changing authoritative status', () => {
    expect(
      buildSubmissionSyncStates(tasks, [
        {
          taskId: 'task-a',
          operation: 'SUBMIT_INSPECTION',
          payload: { inspectionId: 'inspection-a' },
          attempts: 0,
        },
      ]),
    ).toEqual([
      {
        taskId: 'task-a',
        inspectionId: 'inspection-a',
        attempts: 0,
        state: 'pending',
      },
    ]);
  });

  it('exposes failed attempts and errors and resolves older entries by inspection ID', () => {
    expect(
      buildSubmissionSyncStates(tasks, [
        {
          operation: 'SUBMIT_INSPECTION',
          payload: { inspectionId: 'inspection-a' },
          attempts: 2,
          lastAttemptAt: '2026-09-15T10:00:00.000Z',
          lastError: 'Upload failed',
        },
      ]),
    ).toEqual([
      {
        taskId: 'task-a',
        inspectionId: 'inspection-a',
        attempts: 2,
        lastAttemptAt: '2026-09-15T10:00:00.000Z',
        lastError: 'Upload failed',
        state: 'failed',
      },
    ]);
  });

  it('ignores unrelated mutations', () => {
    expect(
      buildSubmissionSyncStates(tasks, [
        { operation: 'ADD_EV_CHARGER', payload: {}, attempts: 1, lastError: 'Failed' },
      ]),
    ).toEqual([]);
  });
});

describe('offline visit finding photo mapping', () => {
  it('preserves existing media, deduplicates retries, and never crosses finding IDs', () => {
    expect(
      attachVisitFindingPhotoIds(
        {
          findings: [
            { clientFindingId: 'finding-a', photoMediaIds: ['media-a'] },
            { clientFindingId: 'finding-b', photoMediaIds: [] },
          ],
        },
        { 'finding-a': ['media-a'], 'finding-b': ['media-b'] },
      ),
    ).toEqual({
      findings: [
        { clientFindingId: 'finding-a', photoMediaIds: ['media-a'] },
        { clientFindingId: 'finding-b', photoMediaIds: ['media-b'] },
      ],
    });
  });
});

describe('offline route boundary', () => {
  it('accepts only concrete visit workspace and thermal task URLs', () => {
    expect(offlineVisitRoute('/app/org/org-a/visits/visit-a')).toEqual({
      organisationId: 'org-a',
      visitId: 'visit-a',
    });
    expect(offlineVisitRoute('/app/org/org-a/visits/visit-a/thermal/task-a')).toEqual({
      organisationId: 'org-a',
      visitId: 'visit-a',
    });
    expect(offlineVisitRoute('/app/org/org-a/visits')).toBeUndefined();
    expect(offlineVisitRoute('/app/org/org-a/visits/visit-a/overview')).toBeUndefined();
    expect(offlineVisitRoute('/app/org/org-a/assets/asset-a/ev')).toBeUndefined();
  });
});

describe('offline pack support', () => {
  it('allows core, EV and thermal packs but rejects unsupported task modules', () => {
    expect(
      unsupportedOfflineModule([
        { moduleKey: 'core' },
        { moduleKey: 'ev-charging' },
        { moduleKey: 'thermal-imaging' },
      ]),
    ).toBeUndefined();
    expect(unsupportedOfflineModule([{ moduleKey: 'emergency-lighting' }])).toBe(
      'emergency-lighting',
    );
  });

  it('restores legacy core and EV packs without claiming incomplete specialist caches', () => {
    expect(canRestoreLegacyPack([{ moduleKey: 'core' }, { moduleKey: 'ev-charging' }])).toBe(true);
    expect(canRestoreLegacyPack([{ moduleKey: 'thermal-imaging' }])).toBe(false);
    expect(canRestoreLegacyPack([{ moduleKey: 'emergency-lighting' }])).toBe(false);
  });
});
