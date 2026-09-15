export const SUPPORTED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const PROTECTIVE_DEVICE_TYPES = ['MCB', 'MCCB', 'RCBO', 'HRC', 'AFDD', 'OTHER'] as const;

export type EngineerWorkspaceStep = 'overview' | 'rams' | 'inspections' | 'findings';

export function engineerWorkspaceStep(value: string | null): EngineerWorkspaceStep {
  return value === 'rams' || value === 'inspections' || value === 'findings' ? value : 'overview';
}

export function isSupportedImageMimeType(type: string): boolean {
  return SUPPORTED_IMAGE_MIME_TYPES.includes(type as (typeof SUPPORTED_IMAGE_MIME_TYPES)[number]);
}

export function connectorSupplyIds(
  currentSupplyIds: readonly string[],
  supplies: ReadonlyArray<{ id: string }>,
): string[] {
  if (currentSupplyIds.length > 0) return [...currentSupplyIds];
  return supplies.length === 1 ? [supplies[0]!.id] : [];
}
