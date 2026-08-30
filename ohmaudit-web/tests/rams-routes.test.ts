import { describe, expect, it } from 'vitest';
import {
  engineerVisitRoutePath,
  ramsCreateRoute,
  ramsDetailRoute,
  ramsPdfFileName,
  ramsPdfPath,
} from '../src/app/core/rams-routes';

describe('RAMS routes', () => {
  it('guards RAMS creation and reading with their dedicated capabilities', () => {
    expect(ramsCreateRoute.capabilities).toEqual(['rams.manage']);
    expect(ramsDetailRoute.capabilities).toEqual(['rams.read']);
  });

  it('keeps RAMS routes nested under their job', () => {
    expect(ramsCreateRoute.path.startsWith(engineerVisitRoutePath + '/rams/')).toBe(true);
    expect(ramsDetailRoute.path.startsWith(engineerVisitRoutePath + '/rams/')).toBe(true);
  });

  it('builds an encoded RAMS PDF route', () => {
    expect(ramsPdfPath('rams/1', 'org & one')).toBe(
      '/rams/rams%2F1/pdf?organisationId=org%20%26%20one',
    );
  });

  it('creates a safe filename with the document state and revision', () => {
    expect(ramsPdfFileName('DB Upgrade: Phase 1 / Main', 'APPROVED', 3)).toBe(
      'db-upgrade-phase-1-main-approved-rev-3.pdf',
    );
    expect(ramsPdfFileName('  ', 'RETURNED', 0)).toBe('rams-draft.pdf');
  });
});
