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

export function thermalImageLimitError(currentCount: number, selectedCount: number): string {
  return currentCount + selectedCount > MAX_THERMAL_IMAGES
    ? `A thermal inspection can contain up to ${MAX_THERMAL_IMAGES} images. Remove images or select fewer files.`
    : '';
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
      outcome: defects.length ? 'FAULTS_REPORTED' : 'NO_ISSUES',
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
