export const ramsCreateRoute = {
  path: 'org/:organisationId/visits/:visitId/rams/new',
  capabilities: ['rams.manage'],
} as const;

export const ramsDetailRoute = {
  path: 'org/:organisationId/visits/:visitId/rams/:ramsId',
  capabilities: ['rams.read'],
} as const;

export const ramsLibraryRoute = {
  path: 'org/:organisationId/rams',
  capabilities: ['rams.read'],
} as const;

export const engineerVisitRoutePath = 'org/:organisationId/visits/:visitId';

export function ramsPdfPath(ramsId: string, organisationId: string): string {
  return `/rams/${encodeURIComponent(ramsId)}/report.pdf?organisationId=${encodeURIComponent(organisationId)}`;
}

export function ramsPdfFileName(
  title: string,
  status: 'DRAFT' | 'UNDER_REVIEW' | 'APPROVED' | 'RETURNED',
  revision: number,
): string {
  const state = status === 'APPROVED' ? 'approved' : status === 'UNDER_REVIEW' ? 'review' : 'draft';
  const safeTitle = title
    .trim()
    .toLocaleLowerCase('en-GB')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  const revisionLabel = revision > 0 ? `-rev-${revision}` : '';
  return `${safeTitle || 'rams'}-${state}${revisionLabel}.pdf`;
}
