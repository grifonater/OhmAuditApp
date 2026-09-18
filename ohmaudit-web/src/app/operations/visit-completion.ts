import type { VisitSummary } from '../core/api.service';

export function visitReadyForCompletion(visit: VisitSummary | undefined): boolean {
  return (
    visit !== undefined &&
    visit.status === 'SUBMITTED' &&
    visit.tasks.length > 0 &&
    visit.tasks.every(({ status }) => status === 'COMPLETED' || status === 'CANCELLED')
  );
}
