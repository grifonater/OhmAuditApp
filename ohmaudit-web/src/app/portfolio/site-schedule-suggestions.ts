import type { ScheduleSuggestion } from '../core/api.service';

export interface ScheduleSuggestionGroup {
  id: string;
  moduleKey: string;
  title: string;
  assetType?: string;
  suggestions: ScheduleSuggestion[];
  lastInspectionDate: string;
  suggestedStartDate: string;
}

export function groupScheduleSuggestions(
  suggestions: readonly ScheduleSuggestion[],
): ScheduleSuggestionGroup[] {
  const groups = new Map<string, ScheduleSuggestionGroup>();
  for (const suggestion of suggestions) {
    const assetType = suggestion.asset?.assetType;
    const id = suggestion.visitId
      ? [suggestion.visitId, suggestion.moduleKey].join(':')
      : `inspection:${suggestion.inspectionId}`;
    const group = groups.get(id);
    if (group) {
      group.suggestions.push(suggestion);
      if (suggestion.lastInspectionDate > group.lastInspectionDate)
        group.lastInspectionDate = suggestion.lastInspectionDate;
      if (suggestion.suggestedStartDate < group.suggestedStartDate)
        group.suggestedStartDate = suggestion.suggestedStartDate;
    } else {
      groups.set(id, {
        id,
        moduleKey: suggestion.moduleKey,
        title: suggestion.title,
        ...(assetType === undefined ? {} : { assetType }),
        suggestions: [suggestion],
        lastInspectionDate: suggestion.lastInspectionDate,
        suggestedStartDate: suggestion.suggestedStartDate,
      });
    }
  }
  return [...groups.values()];
}

export function scheduleSuggestionHeading(group: ScheduleSuggestionGroup): string {
  if (group.suggestions.length === 1)
    return `Add ${group.suggestions[0]?.asset?.displayName ?? group.title} to the schedule?`;
  return `Add ${group.suggestions.length} ${pluralAssetType(group.assetType ?? 'asset')} to the annual inspection schedule?`;
}

export async function createSchedulesForGroup(
  group: ScheduleSuggestionGroup,
  create: (suggestion: ScheduleSuggestion) => Promise<unknown>,
): Promise<void> {
  await Promise.all(group.suggestions.map((suggestion) => create(suggestion)));
}

function pluralAssetType(assetType: string): string {
  const type = assetType.trim();
  if (/^(?:ev|electric vehicle)(?: charger| charge point)?$/iu.test(type))
    return 'EV charge points';
  if (/y$/iu.test(type) && !/[aeiou]y$/iu.test(type)) return `${type.slice(0, -1)}ies`;
  if (/(?:s|x|z|ch|sh)$/iu.test(type)) return `${type}es`;
  return `${type}s`;
}
