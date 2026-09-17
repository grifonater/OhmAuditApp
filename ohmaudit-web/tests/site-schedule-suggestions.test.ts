import { describe, expect, it, vi } from 'vitest';
import type { ScheduleSuggestion } from '../src/app/core/api.service';
import {
  createSchedulesForGroup,
  groupScheduleSuggestions,
  scheduleSuggestionHeading,
} from '../src/app/portfolio/site-schedule-suggestions';

function suggestion(
  inspectionId: string,
  assetType: string,
  moduleKey = 'ev-charging',
  title = 'Annual inspection',
  visitId: string | null = 'visit-a',
): ScheduleSuggestion {
  return {
    inspectionId,
    visitId,
    asset: { id: `asset-${inspectionId}`, displayName: `Charger ${inspectionId}`, assetType },
    moduleKey,
    title,
    lastInspectionDate: '2026-09-01T00:00:00.000Z',
    suggestedStartDate: '2027-09-01T00:00:00.000Z',
    suggestedFrequencyMonths: 12,
  };
}

describe('site schedule suggestion groups', () => {
  it('groups matching visit and module into one reminder', () => {
    const groups = groupScheduleSuggestions([
      ...Array.from({ length: 12 }, (_, index) => suggestion(String(index + 1), 'EV Charger')),
      suggestion('solar', 'Solar PV System', 'core'),
      suggestion('emergency', 'Emergency Lighting System', 'emergency-lighting'),
    ]);

    expect(groups).toHaveLength(3);
    expect(groups[0]?.suggestions).toHaveLength(12);
    expect(scheduleSuggestionHeading(groups[0]!)).toBe(
      'Add 12 EV charge points to the annual inspection schedule?',
    );
  });

  it('combines charger-specific titles from the same visit', () => {
    const groups = groupScheduleSuggestions([
      suggestion('1', 'EV Charger', 'ev-charging', 'EVCP 1 inspection'),
      suggestion('2', 'EV Charge Point', 'ev-charging', 'EVCP 2 inspection'),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.suggestions).toHaveLength(2);
  });

  it('keeps separate visits and legacy inspections separate', () => {
    const groups = groupScheduleSuggestions([
      suggestion('1', 'EV Charger', 'ev-charging', 'EVCP 1 inspection', 'visit-a'),
      suggestion('2', 'EV Charger', 'ev-charging', 'EVCP 2 inspection', 'visit-b'),
      suggestion('3', 'EV Charger', 'ev-charging', 'EVCP 3 inspection', null),
      suggestion('4', 'EV Charger', 'ev-charging', 'EVCP 4 inspection', null),
    ]);

    expect(groups).toHaveLength(4);
  });

  it('runs the schedule action for every represented asset', async () => {
    const group = groupScheduleSuggestions([
      suggestion('1', 'EV Charger'),
      suggestion('2', 'EV Charger'),
      suggestion('3', 'EV Charger'),
    ])[0]!;
    const create = vi.fn().mockResolvedValue(undefined);

    await createSchedulesForGroup(group, create);

    expect(create).toHaveBeenCalledTimes(3);
    expect(create.mock.calls.map((call) => (call[0] as ScheduleSuggestion).inspectionId)).toEqual([
      '1',
      '2',
      '3',
    ]);
  });
});
