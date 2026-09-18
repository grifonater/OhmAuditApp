export function preferredReportReference(input: {
  jobReference?: string | null | undefined;
  externalReference?: string | null | undefined;
  currentReference: string;
}): string {
  return (
    input.jobReference?.trim() || input.externalReference?.trim() || input.currentReference.trim()
  );
}

export function orderedInspectionIds(
  taskInspectionIds: ReadonlyArray<string | null | undefined>,
  fallbackInspectionIds: readonly string[],
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of [...taskInspectionIds, ...fallbackInspectionIds]) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

export function inspectionReportReference(input: {
  jobReference?: string | null | undefined;
  externalReference?: string | null | undefined;
  currentReference: string;
  inspectionId: string;
  orderedInspectionIds?: readonly string[];
}): string {
  const base = preferredReportReference(input);
  if (input.orderedInspectionIds === undefined) return base;
  const index = input.orderedInspectionIds.indexOf(input.inspectionId);
  return index < 0 ? base : `${base}-${index + 1}`;
}
