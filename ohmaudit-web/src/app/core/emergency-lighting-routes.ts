export const emergencyLightingAssetRoute = {
  path: 'org/:organisationId/assets/:assetId/emergency-lighting',
  capabilities: ['assets.read'] as const,
};

export const emergencyLightingInspectionRoute = {
  path: 'org/:organisationId/visits/:visitId/emergency-lighting/:inspectionId',
  capabilities: ['inspections.perform'] as const,
};

export const guestEmergencyLightingInspectionRoute =
  'guest/job/:token/emergency-lighting/:inspectionId';

export function emergencyLightingInspectionPath(
  organisationId: string,
  visitId: string,
  inspectionId: string,
): string[] {
  return ['/app/org', organisationId, 'visits', visitId, 'emergency-lighting', inspectionId];
}

export function guestEmergencyLightingInspectionPath(
  token: string,
  inspectionId: string,
): string[] {
  return ['/guest/job', token, 'emergency-lighting', inspectionId];
}
