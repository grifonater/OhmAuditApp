import { describe, expect, it } from 'vitest';
import type { VisitSummary } from '../src/app/core/api.service';
import { visitReadyForCompletion } from '../src/app/operations/visit-completion';

function visit(status: string, taskStatuses: string[]): VisitSummary {
  return {
    id: 'visit-a',
    organisationId: 'organisation-a',
    title: 'Inspection job',
    status,
    scheduledStart: '2026-09-18T08:00:00.000Z',
    evDiscoveryEnabled: false,
    customer: { id: 'customer-a', name: 'Customer' },
    site: { id: 'site-a', name: 'Site' },
    tasks: taskStatuses.map((taskStatus, index) => ({
      id: `task-${index}`,
      moduleKey: 'core',
      title: `Task ${index}`,
      status: taskStatus,
      displayOrder: index,
    })),
    findings: [],
    rams: [],
  };
}

describe('visit completion eligibility', () => {
  it('requires at least one task and accepts completed or cancelled tasks', () => {
    expect(visitReadyForCompletion(visit('SUBMITTED', []))).toBe(false);
    expect(visitReadyForCompletion(visit('SUBMITTED', ['COMPLETED', 'CANCELLED']))).toBe(true);
  });

  it('rejects unfinished and already-completed jobs', () => {
    expect(visitReadyForCompletion(visit('SUBMITTED', ['COMPLETED', 'SUBMITTED']))).toBe(false);
    expect(visitReadyForCompletion(visit('COMPLETED', ['COMPLETED']))).toBe(false);
    expect(visitReadyForCompletion(visit('IN_PROGRESS', ['COMPLETED']))).toBe(false);
    expect(visitReadyForCompletion(visit('CANCELLED', ['CANCELLED']))).toBe(false);
  });
});
