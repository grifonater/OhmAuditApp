const naturalCollator = new Intl.Collator('en-GB', {
  numeric: true,
  sensitivity: 'base',
});

export function naturalCompare(left: string, right: string): number {
  return naturalCollator.compare(left, right);
}

export function sortNaturallyBy<T>(values: readonly T[], selector: (value: T) => string): T[] {
  return [...values].sort((left, right) => naturalCompare(selector(left), selector(right)));
}
