export function connectorSupplySelection(value: string): string[] {
  return value === '' ? [] : [value];
}

export function administratorCorrectionReason(
  validation: Record<string, unknown>,
): string | undefined {
  const override = validation['administratorOverride'];
  if (typeof override !== 'object' || override === null || Array.isArray(override))
    return undefined;
  const reason = (override as Record<string, unknown>)['reason'];
  return typeof reason === 'string' && reason.trim() !== '' ? reason : undefined;
}
