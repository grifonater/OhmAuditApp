import { describe, expect, it } from 'vitest';
import {
  createCandidate,
  dataPlateDebugModels,
  isDataPlateDebugModel,
  parseExtractionAnswer,
} from '../src/index';

describe('AI worker', () => {
  it('marks every extraction candidate for human confirmation', () => {
    expect(createCandidate('serialNumber', 'ABC123', 0.94)).toEqual({
      field: 'serialNumber',
      value: 'ABC123',
      confidence: 0.94,
      requiresHumanConfirmation: true,
    });
  });

  it('normalises supported fields and discards absent values', () => {
    expect(
      parseExtractionAnswer(`Result:\n\`\`\`json\n{
        "manufacturer": { "value": "ABB", "confidence": 0.98 },
        "model": { "value": null, "confidence": 0.2 },
        "serialNumber": { "value": "SN-42", "confidence": 0.91 },
        "maximumPowerKw": { "value": 22, "confidence": 0.88 }
      }\n\`\`\``),
    ).toEqual([
      createCandidate('manufacturer', 'ABB', 0.98),
      createCandidate('serialNumber', 'SN-42', 0.91),
      createCandidate('maximumPowerKw', '22', 0.88),
    ]);
  });

  it('handles plain scalar values returned by Moondream', () => {
    expect(
      parseExtractionAnswer(`{
        "manufacturer": "ABB",
        "model": "Terra AC Wallbox",
        "serialNumber": "SN 2024-884123",
        "maximumPowerKw": 11
      }`),
    ).toEqual([
      createCandidate('manufacturer', 'ABB'),
      createCandidate('model', 'Terra AC Wallbox'),
      createCandidate('serialNumber', 'SN 2024-884123'),
      createCandidate('maximumPowerKw', '11'),
    ]);
  });

  it('only accepts configured debug vision models', () => {
    expect(dataPlateDebugModels).toHaveLength(3);
    expect(isDataPlateDebugModel('@cf/meta/llama-4-scout-17b-16e-instruct')).toBe(true);
    expect(isDataPlateDebugModel('@cf/meta/llama-3.1-8b-instruct')).toBe(false);
  });
});
