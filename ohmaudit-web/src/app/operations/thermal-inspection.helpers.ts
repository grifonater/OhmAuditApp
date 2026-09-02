import type { AssetMedia, OrganisationEquipment } from '../core/api.service';

export type ThermalCondition = 'NO_ISSUES' | 'FAULT';
export type ThermalSeverity = 'ADVISORY' | 'MINOR' | 'MAJOR' | 'DANGEROUS';
export interface ThermalDetails {
  scope: string;
  purpose: string;
  inspectionMethod: string;
  areasInspected: string;
  areasExcluded: string;
  limitations: string;
  environmentalConditions: string;
  loadCondition: string;
  clientRepresentative: string;
  ambientTemperatureC: number | null;
  emissivity: number | null;
  reflectedTemperatureC: number | null;
  equipmentId: string;
  additionalNotes: string;
}
export interface ThermalTarget {
  id: string;
  name: string;
  reference: string;
  location: string;
  imageIds: string[];
  imageDescriptions?: Record<string, string>;
  condition: ThermalCondition;
  issueSummary: string;
  severity: ThermalSeverity;
  maxTemperatureC: number | null;
  deltaTemperatureC: number | null;
  observations: string;
  recommendation: string;
}
export type MediaMetadata = Partial<
  Pick<AssetMedia, 'caption' | 'category' | 'tags' | 'sortOrder'>
>;
export interface MediaMetadataUpdate extends MediaMetadata {
  mediaId: string;
}
export const MAX_THERMAL_IMAGES = 500;
export const MAX_THERMAL_IMAGE_DESCRIPTION_LENGTH = 500;

export function thermalImageLimitError(currentCount: number, selectedCount: number): string {
  return currentCount + selectedCount > MAX_THERMAL_IMAGES
    ? `A thermal inspection can contain up to ${MAX_THERMAL_IMAGES} images. Remove images or select fewer files.`
    : '';
}

export function normalizeImageDescriptions(
  imageIds: readonly string[],
  value: unknown,
): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const descriptions: Record<string, string> = {};
  for (const imageId of imageIds) {
    const description = source[imageId];
    if (typeof description !== 'string') continue;
    const normalized = description.trim().slice(0, MAX_THERMAL_IMAGE_DESCRIPTION_LENGTH);
    if (normalized) descriptions[imageId] = normalized;
  }
  return descriptions;
}

export function patchImageDescription(
  target: Pick<ThermalTarget, 'imageIds' | 'imageDescriptions'>,
  imageId: string,
  value: string,
): Record<string, string> {
  return normalizeImageDescriptions(target.imageIds, {
    ...target.imageDescriptions,
    [imageId]: value,
  });
}

export function remapImageDescriptions(
  imageIds: readonly string[],
  value: unknown,
  mediaIds: Record<string, string>,
): Record<string, string> {
  const descriptions = normalizeImageDescriptions(imageIds, value);
  return Object.fromEntries(
    imageIds.flatMap((imageId) => {
      const description = descriptions[imageId];
      return description === undefined ? [] : [[mediaIds[imageId] ?? imageId, description]];
    }),
  );
}

export function remapThermalTargetIds<T extends Pick<ThermalTarget, 'imageIds'>>(
  target: T,
  mediaIds: Record<string, string>,
): T {
  const imageDescriptions = remapImageDescriptions(
    target.imageIds,
    'imageDescriptions' in target ? target.imageDescriptions : undefined,
    mediaIds,
  );
  return {
    ...target,
    imageIds: target.imageIds.map((imageId) => mediaIds[imageId] ?? imageId),
    ...('imageDescriptions' in target || Object.keys(imageDescriptions).length
      ? { imageDescriptions }
      : {}),
  };
}

export function normalizeThermalTarget(value: unknown): ThermalTarget | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const item = value as Partial<ThermalTarget>;
  if (
    typeof item.id !== 'string' ||
    typeof item.name !== 'string' ||
    !Array.isArray(item.imageIds) ||
    (item.condition !== 'NO_ISSUES' && item.condition !== 'FAULT')
  )
    return undefined;
  const imageIds = [...new Set(item.imageIds.filter((id): id is string => typeof id === 'string'))];
  return {
    id: item.id,
    name: item.name,
    reference: typeof item.reference === 'string' ? item.reference : '',
    location: typeof item.location === 'string' ? item.location : '',
    imageIds,
    imageDescriptions: normalizeImageDescriptions(imageIds, item.imageDescriptions),
    condition: item.condition,
    issueSummary: typeof item.issueSummary === 'string' ? item.issueSummary : '',
    severity: ['ADVISORY', 'MINOR', 'MAJOR', 'DANGEROUS'].includes(item.severity ?? '')
      ? item.severity!
      : 'MINOR',
    maxTemperatureC: typeof item.maxTemperatureC === 'number' ? item.maxTemperatureC : null,
    deltaTemperatureC: typeof item.deltaTemperatureC === 'number' ? item.deltaTemperatureC : null,
    observations: typeof item.observations === 'string' ? item.observations : '',
    recommendation: typeof item.recommendation === 'string' ? item.recommendation : '',
  };
}

export function remapThermalSubmissionIds(
  submission: Record<string, unknown>,
  mediaIds: Record<string, string>,
): Record<string, unknown> {
  if (Object.keys(mediaIds).length === 0) return submission;
  const data = submission['data'];
  const remappedData =
    typeof data === 'object' &&
    data !== null &&
    Array.isArray((data as Record<string, unknown>)['targets'])
      ? {
          ...data,
          targets: ((data as Record<string, unknown>)['targets'] as unknown[]).map((target) => {
            if (typeof target !== 'object' || target === null) return target;
            const record = target as Record<string, unknown>;
            if (!Array.isArray(record['imageIds'])) return target;
            const imageIds = record['imageIds'].filter(
              (id): id is string => typeof id === 'string',
            );
            return {
              ...record,
              imageIds: imageIds.map((id) => mediaIds[id] ?? id),
              ...('imageDescriptions' in record
                ? {
                    imageDescriptions: remapImageDescriptions(
                      imageIds,
                      record['imageDescriptions'],
                      mediaIds,
                    ),
                  }
                : {}),
            };
          }),
        }
      : data;
  const defects = submission['defects'];
  const remappedDefects = Array.isArray(defects)
    ? (defects as unknown[]).map((defect) => {
        if (typeof defect !== 'object' || defect === null) return defect;
        const record = defect as Record<string, unknown>;
        return Array.isArray(record['photoMediaIds'])
          ? {
              ...record,
              photoMediaIds: (record['photoMediaIds'] as unknown[]).map((id) =>
                typeof id === 'string' ? (mediaIds[id] ?? id) : id,
              ),
            }
          : defect;
      })
    : defects;
  return {
    ...submission,
    ...(remappedData === undefined ? {} : { data: remappedData }),
    ...(remappedDefects === undefined ? {} : { defects: remappedDefects }),
  };
}

export function thermalPreviewSignerError(signerName: string): string {
  return signerName.trim().length < 2 ? 'Enter the engineer name before reviewing the PDF.' : '';
}

export function metadataFailureAction(
  online: boolean,
  failedCount: number,
): 'retry' | 'defer' | 'fail' {
  if (!online) return 'defer';
  return failedCount > 0 ? 'retry' : 'fail';
}

export function buildMediaMetadataUpdateBody(
  media: Array<{ mediaId: string; media: AssetMedia }>,
): { updates: MediaMetadataUpdate[] } {
  return {
    updates: media.map(({ mediaId, media: item }) => ({
      mediaId,
      category: item.category,
      ...(item.caption === undefined ? {} : { caption: item.caption }),
      ...(item.tags === undefined ? {} : { tags: item.tags }),
      ...(item.sortOrder === undefined ? {} : { sortOrder: item.sortOrder }),
    })),
  };
}

export function buildThermalInspectionReport(input: {
  details: ThermalDetails;
  targets: ThermalTarget[];
  images: AssetMedia[];
  equipment?: OrganisationEquipment;
  signerName: string;
  signedAt?: string;
  reportReference?: string;
  overallOutcome?: string;
}) {
  const defects = input.targets
    .filter(({ condition }) => condition === 'FAULT')
    .map((target) => ({
      title: target.issueSummary,
      description: [target.name, target.location, target.observations, target.recommendation]
        .filter(Boolean)
        .join(' - '),
      severity: target.severity,
      photoMediaIds: target.imageIds,
    }));
  const equipment = input.equipment;
  return {
    data: {
      reportType: 'THERMAL_IMAGING',
      outcome: input.overallOutcome?.trim() || (defects.length ? 'FAULTS_REPORTED' : 'NO_ISSUES'),
      ...(input.reportReference === undefined ? {} : { reportReference: input.reportReference }),
      targetCount: input.targets.length,
      imageCount: input.images.length,
      details: input.details,
      equipment: equipment
        ? {
            id: equipment.id,
            name: equipment.name,
            equipmentType: equipment.equipmentType,
            manufacturer: equipment.manufacturer,
            model: equipment.model,
            serialNumber: equipment.serialNumber,
            calibrationDueAt: equipment.calibrationDueAt,
          }
        : undefined,
      targets: input.targets,
    },
    validation: { valid: true, faultCount: defects.length },
    signature: {
      signerName: input.signerName.trim(),
      signerRole: 'Engineer',
      signatureData: `typed:${input.signerName.trim()}:${input.signedAt ?? new Date().toISOString()}`,
    },
    defects,
  };
}

export function thermalPreviewBody(report: ReturnType<typeof buildThermalInspectionReport>) {
  return { data: report.data, signature: report.signature };
}

export function canReviewThermalPdf(input: {
  guestToken: string;
  online: boolean;
  hasInspection: boolean;
}): boolean {
  return input.guestToken.length === 0 && input.online && input.hasInspection;
}
