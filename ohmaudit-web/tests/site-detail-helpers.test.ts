import { describe, expect, it } from 'vitest';
import type { ScheduleOccurrence } from '../src/app/core/api.service';
import {
  initialAssetView,
  nextScheduleOccurrences,
  pageCount,
  pageItems,
} from '../src/app/portfolio/site-detail.helpers';

function occurrence(
  id: string,
  ruleId: string,
  dueDate: string,
  status: string,
  siteId = 'site-1',
): ScheduleOccurrence {
  return {
    id,
    dueDate,
    status,
    scheduleRule: {
      id: ruleId,
      title: `Rule ${ruleId}`,
      moduleKey: 'core',
      frequencyMonths: 12,
      site: { id: siteId, name: 'Site' },
    },
  };
}

describe('site asset presentation helpers', () => {
  it('defaults larger registers to list view', () => {
    expect(initialAssetView(9)).toBe('grid');
    expect(initialAssetView(10)).toBe('list');
  });

  it('paginates in ten item pages and clamps invalid pages', () => {
    const items = Array.from({ length: 23 }, (_, index) => index + 1);
    expect(pageItems(items, 2)).toEqual([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(pageItems(items, 0)).toEqual(items.slice(0, 10));
    expect(pageCount(items.length)).toBe(3);
    expect(pageCount(0)).toBe(1);
  });
});

describe('site schedule reminders', () => {
  it('selects the next visible occurrence per rule and sorts by due date', () => {
    const selected = nextScheduleOccurrences(
      [
        occurrence('later-a', 'a', '2027-09-01', 'FUTURE'),
        occurrence('next-b', 'b', '2026-11-01', 'UPCOMING'),
        occurrence('next-a', 'a', '2026-10-01', 'DUE'),
        occurrence('complete', 'c', '2026-08-01', 'COMPLETED'),
        occurrence('other-site', 'd', '2026-07-01', 'OVERDUE', 'site-2'),
      ],
      'site-1',
    );

    expect(selected.map(({ id }) => id)).toEqual(['next-a', 'next-b']);
  });
});
