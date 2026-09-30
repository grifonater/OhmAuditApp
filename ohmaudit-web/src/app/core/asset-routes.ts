export const assetDetailRoute = {
  path: 'org/:organisationId/assets/:assetId',
  capabilities: ['assets.read'] as const,
};

export function assetDetailPath(organisationId: string, assetId: string): string[] {
  return ['/app/org', organisationId, 'assets', assetId];
}
