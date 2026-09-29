export function preferredReportReference(input: {
  jobReference?: string | null | undefined;
  externalReference?: string | null | undefined;
  currentReference: string;
}): string {
  return (
    input.jobReference?.trim() || input.externalReference?.trim() || input.currentReference.trim()
  );
}

interface InspectionOrderItem {
  id: string;
  inspectionType: string;
  asset?: { assetReference: string } | null | undefined;
}

const naturalCollator = new Intl.Collator('en-GB', {
  numeric: true,
  sensitivity: 'base',
});

export function orderedInspectionIds(
  taskInspections: ReadonlyArray<InspectionOrderItem | null | undefined>,
  fallbackInspections: readonly InspectionOrderItem[],
): string[] {
  const inspections = new Map<string, InspectionOrderItem>();
  for (const inspection of [...taskInspections, ...fallbackInspections]) {
    if (inspection === null || inspection === undefined || inspections.has(inspection.id)) continue;
    inspections.set(inspection.id, inspection);
  }
  return [...inspections.values()]
    .sort(
      (left, right) =>
        naturalCollator.compare(
          left.asset?.assetReference ?? left.inspectionType,
          right.asset?.assetReference ?? right.inspectionType,
        ) ||
        naturalCollator.compare(left.inspectionType, right.inspectionType) ||
        naturalCollator.compare(left.id, right.id),
    )
    .map(({ id }) => id);
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
