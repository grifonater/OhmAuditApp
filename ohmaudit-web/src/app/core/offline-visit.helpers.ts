export function offlineRecordIsVisible(
  row: { ownerUserId?: string; guestToken?: string },
  ownerUserId: string | undefined,
  guestToken: string | undefined,
): boolean {
  return row.guestToken !== undefined
    ? guestToken !== undefined && row.guestToken === guestToken
    : row.ownerUserId !== undefined && row.ownerUserId === ownerUserId;
}

export function authenticatedPackIsReadyForOwner(
  pack: { ready: boolean; ownerUserId?: string; guestToken?: string },
  ownerUserId: string | undefined,
): boolean {
  return (
    pack.ready &&
    pack.guestToken === undefined &&
    pack.ownerUserId !== undefined &&
    pack.ownerUserId === ownerUserId
  );
}

export function unsupportedOfflineModule(tasks: Array<{ moduleKey: string }>): string | undefined {
  return tasks.find(
    ({ moduleKey }) => !['core', 'ev-charging', 'thermal-imaging'].includes(moduleKey),
  )?.moduleKey;
}

export function canRestoreLegacyPack(tasks: Array<{ moduleKey: string }>): boolean {
  return tasks.every(({ moduleKey }) => moduleKey === 'core' || moduleKey === 'ev-charging');
}

export function offlineVisitRoute(
  url: string,
): { organisationId: string; visitId: string } | undefined {
  const match = /^\/app\/org\/([^/?#]+)\/visits\/([^/?#]+)(?:\/thermal\/[^/?#]+)?(?:[?#].*)?$/.exec(
    url,
  );
  return match === null
    ? undefined
    : { organisationId: decodeURIComponent(match[1]!), visitId: decodeURIComponent(match[2]!) };
}

export interface LocalEvChargerIds {
  assetId: string;
  chargePointId: string;
  taskId: string;
  inspectionId: string;
}

export interface EvChargerInput {
  assetReference: string;
  displayName: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  maximumPowerKw?: number;
  dcRcdType: 'TYPE_B' | 'RDC_DD' | 'NONE';
}

export interface IdMapEntry {
  local: string;
  server: string;
}

export type VisitIdMap = Record<string, IdMapEntry>;

export function buildOptimisticEvTask(
  input: EvChargerInput,
  localIds: LocalEvChargerIds,
): {
  asset: Record<string, unknown>;
  task: Record<string, unknown>;
  inspection: Record<string, unknown>;
} {
  const asset = {
    id: localIds.assetId,
    assetType: 'EV_CHARGE_POINT',
    assetReference: input.assetReference,
    displayName: input.displayName,
    ...(input.manufacturer === undefined ? {} : { manufacturer: input.manufacturer }),
    ...(input.model === undefined ? {} : { model: input.model }),
    ...(input.serialNumber === undefined ? {} : { serialNumber: input.serialNumber }),
    status: 'PROVISIONAL',
    evChargePoint: {
      id: localIds.chargePointId,
      ...(input.maximumPowerKw === undefined ? {} : { maximumPowerKw: input.maximumPowerKw }),
      dcRcdType: input.dcRcdType,
      supplies: [],
      connectors: [],
    },
  };
  const inspection = {
    id: localIds.inspectionId,
    moduleKey: 'ev-charging',
    inspectionType: 'EV_CHARGER_PERIODIC',
    status: 'DRAFT',
    currentRevisionNumber: 0,
  };
  return {
    asset,
    inspection,
    task: {
      id: localIds.taskId,
      title: `Inspect ${input.displayName}`,
      moduleKey: 'ev-charging',
      status: 'NOT_STARTED',
      asset,
      inspection,
    },
  };
}

export function idReplacements(idMap: VisitIdMap): Record<string, string> {
  return Object.values(idMap).reduce<Record<string, string>>((result, entry) => {
    result[entry.local] = entry.server;
    return result;
  }, {});
}

export function remapLocalIds<T>(value: T, replacements: Record<string, string>): T {
  return remapValue(value, replacements) as T;
}

function remapValue(value: unknown, replacements: Record<string, string>): unknown {
  if (typeof value === 'string') return replacements[value] ?? value;
  if (Array.isArray(value)) return value.map((item: unknown) => remapValue(item, replacements));
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, remapValue(item, replacements)]),
  );
}

export function moduleLabel(moduleKey: string): string {
  const labels: Record<string, string> = {
    core: 'General inspection',
    'ev-charging': 'EV charging',
    'thermal-imaging': 'Thermal imaging',
    'emergency-lighting': 'Emergency lighting',
  };
  return (
    labels[moduleKey] ??
    moduleKey.replaceAll('-', ' ').replace(/^./u, (value) => value.toUpperCase())
  );
}

export function applyDataPlateCandidate<T extends Record<string, string | number | null>>(
  values: T,
  candidate: { field: string; value: string },
): T {
  if (!(candidate.field in values)) return values;
  if (candidate.field === 'maximumPowerKw') {
    const value = Number(candidate.value);
    return Number.isFinite(value) && value > 0 ? { ...values, [candidate.field]: value } : values;
  }
  return { ...values, [candidate.field]: candidate.value };
}
