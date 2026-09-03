import { describe, expect, it } from 'vitest';
import {
  emergencyLightingAssetRoute,
  emergencyLightingInspectionPath,
  emergencyLightingInspectionRoute,
  guestEmergencyLightingInspectionPath,
  guestEmergencyLightingInspectionRoute,
} from '../src/app/core/emergency-lighting-routes';

describe('emergency lighting routes', () => {
  it('guards the office register and engineer inspection', () => {
    expect(emergencyLightingAssetRoute.capabilities).toEqual(['assets.read']);
    expect(emergencyLightingInspectionRoute.capabilities).toEqual(['inspections.perform']);
  });

  it('keeps asset and inspection routes in their expected scopes', () => {
    expect(emergencyLightingAssetRoute.path).toBe(
      'org/:organisationId/assets/:assetId/emergency-lighting',
    );
    expect(emergencyLightingInspectionRoute.path).toContain(
      'visits/:visitId/emergency-lighting/:inspectionId',
    );
    expect(guestEmergencyLightingInspectionRoute).toBe(
      'guest/job/:token/emergency-lighting/:inspectionId',
    );
  });

  it('builds authenticated and guest inspection links', () => {
    expect(emergencyLightingInspectionPath('org-1', 'visit-1', 'inspection-1')).toEqual([
      '/app/org',
      'org-1',
      'visits',
      'visit-1',
      'emergency-lighting',
      'inspection-1',
    ]);
    expect(guestEmergencyLightingInspectionPath('guest-token', 'inspection-1')).toEqual([
      '/guest/job',
      'guest-token',
      'emergency-lighting',
      'inspection-1',
    ]);
  });
});
