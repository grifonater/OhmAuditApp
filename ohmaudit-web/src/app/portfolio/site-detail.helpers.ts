import type { ScheduleOccurrence } from '../core/api.service';

export const SITE_ASSET_PAGE_SIZE = 10;

export function initialAssetView(assetCount: number): 'grid' | 'list' {
  return assetCount > 9 ? 'list' : 'grid';
}

export function pageItems<T>(
  items: readonly T[],
  page: number,
  pageSize = SITE_ASSET_PAGE_SIZE,
): T[] {
  const safePage = Math.max(1, page);
  return items.slice((safePage - 1) * pageSize, safePage * pageSize);
}

export function pageCount(itemCount: number, pageSize = SITE_ASSET_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(itemCount / pageSize));
}

export function nextScheduleOccurrences(
  occurrences: readonly ScheduleOccurrence[],
  siteId: string,
): ScheduleOccurrence[] {
  const selected = new Map<string, ScheduleOccurrence>();
  for (const occurrence of occurrences) {
    if (
      occurrence.scheduleRule.site.id !== siteId ||
      !['FUTURE', 'UPCOMING', 'DUE', 'OVERDUE'].includes(occurrence.status)
    )
      continue;
    const current = selected.get(occurrence.scheduleRule.id);
    if (!current || new Date(occurrence.dueDate).getTime() < new Date(current.dueDate).getTime())
      selected.set(occurrence.scheduleRule.id, occurrence);
  }
  return [...selected.values()].sort(
    (left, right) => new Date(left.dueDate).getTime() - new Date(right.dueDate).getTime(),
  );
}
