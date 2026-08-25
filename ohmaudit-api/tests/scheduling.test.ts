import { describe, expect, it } from 'vitest';
import { materialiseDates } from '../src/scheduling/schedule.service';

describe('schedule materialisation', () => {
  it('creates a five-year rolling horizon immediately', () => {
    const dates = materialiseDates(new Date('2026-08-31T00:00:00.000Z'), 12);
    expect(dates.map((date) => date.toISOString().slice(0, 10))).toEqual([
      '2026-08-31',
      '2027-08-31',
      '2028-08-31',
      '2029-08-31',
      '2030-08-31',
      '2031-08-31',
    ]);
  });

  it('keeps month-end schedules on a valid calendar day', () => {
    const dates = materialiseDates(new Date('2026-01-31T00:00:00.000Z'), 1, 1);
    expect(dates[1]?.toISOString().slice(0, 10)).toBe('2026-02-28');
  });
});
