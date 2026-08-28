export const candidateFields = [
  'manufacturer',
  'model',
  'serialNumber',
  'maximumPowerKw',
] as const;

export type ChargerDataPlateField = (typeof candidateFields)[number];

export interface ExtractionCandidate {
  field: ChargerDataPlateField;
  value: string;
  confidence?: number;
  requiresHumanConfirmation: true;
}

interface ModelCandidate {
  value?: unknown;
  confidence?: unknown;
}

/**
 * Builds a candidate marked for human confirmation.
 */
export function createCandidate(
  field: ChargerDataPlateField,
  value: string,
  confidence?: number,
): ExtractionCandidate {
  return confidence === undefined
    ? { field, value, requiresHumanConfirmation: true }
    : { field, value, confidence, requiresHumanConfirmation: true };
}

/**
 * Normalises a single raw field value into the string the app stores.
 * Returns undefined when the value is absent or unreadable.
 */
function candidateValue(field: ChargerDataPlateField, value: unknown): string | undefined {
  if (field === 'maximumPowerKw') {
    const number = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(number) && number > 0 && number <= 1000 ? String(number) : undefined;
  }
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function jsonFromAnswer(answer: string): unknown {
  const start = answer.indexOf('{');
  const end = answer.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The model did not return JSON.');
  return JSON.parse(answer.slice(start, end + 1));
}

export { jsonFromAnswer };

/**
 * Parses the model's JSON answer into extraction candidates.
 * Tolerates both plain scalar values and `{"value", "confidence"}` wrappers,
 * which is how Moondream 3.1 returns data.
 */
export function parseExtractionAnswer(answer: string): ExtractionCandidate[] {
  const parsed = jsonFromAnswer(answer);
  if (typeof parsed !== 'object' || parsed === null) return [];
  const record = parsed as Record<string, unknown>;
  return candidateFields.flatMap((field) => {
    const raw = record[field];
    const modelCandidate =
      Array.isArray(raw) || typeof raw !== 'object' || raw === null
        ? { value: raw }
        : (raw as ModelCandidate);
    const value = candidateValue(field, modelCandidate.value);
    if (value === undefined) return [];
    const confidence =
      typeof modelCandidate.confidence === 'number' &&
      modelCandidate.confidence >= 0 &&
      modelCandidate.confidence <= 1
        ? modelCandidate.confidence
        : undefined;
    return [createCandidate(field, value, confidence)];
  });
}
