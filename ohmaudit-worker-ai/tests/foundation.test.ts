import { describe, expect, it } from 'vitest';
import { createCandidate, parseExtractionAnswer } from '../src/index';

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
        "maximumPowerKw": { "value": 22, "confidence": 0.88 },
        "connectorTypes": { "value": ["Type 2", "CCS"], "confidence": 0.8 }
      }\n\`\`\``),
    ).toEqual([
      createCandidate('manufacturer', 'ABB', 0.98),
      createCandidate('serialNumber', 'SN-42', 0.91),
      createCandidate('maximumPowerKw', '22', 0.88),
      createCandidate('connectorTypes', 'Type 2, CCS', 0.8),
    ]);
  });
});
