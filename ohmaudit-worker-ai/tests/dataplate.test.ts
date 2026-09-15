import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  candidateFields,
  dataPlateModelChain,
  defaultDataPlateModelChain,
  parseExtractionAnswer,
} from '../src/index';
import { extractDataPlate, type DataPlateRuntimeBindings } from '../src/features/dataplate/service';

const models = defaultDataPlateModelChain;

function request(model?: string): Request {
  return new Request('https://ai.example.test/v1/extract/charger-dataplate', {
    method: 'POST',
    headers: {
      'content-type': 'image/jpeg',
      'x-correlation-id': 'correlation-test',
      ...(model === undefined ? {} : { 'x-ai-model-id': model }),
    },
    body: new Uint8Array([1, 2, 3]),
  });
}

function environment(run: ReturnType<typeof vi.fn>, chain?: string): DataPlateRuntimeBindings {
  return {
    AI: { run },
    AI_MODEL_ID: models[0],
    ...(chain === undefined ? {} : { AI_MODEL_CHAIN: chain }),
  };
}

describe('charger data-plate fallback chain', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('uses the production order by default and safely normalizes configured chains', () => {
    expect(dataPlateModelChain()).toEqual(models);
    expect(
      dataPlateModelChain(
        `${models[2]}, unsupported-model, ${models[2]}, ${models[1]}, ${models[0]}, ${models[1]}`,
      ),
    ).toEqual([models[2], models[1], models[0]]);
    expect(dataPlateModelChain('unsupported-model')).toEqual(models);
  });

  it('falls through technical and valid-empty attempts, then stops on the first useful field', async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error('provider unavailable'))
      .mockResolvedValueOnce({ response: '{"manufacturer":{"value":"unknown"}}' })
      .mockResolvedValueOnce({ response: '{"serialNumber":{"value":"SN-42"}}' });

    const response = await extractDataPlate(request(), environment(run), false);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      candidates: [{ field: 'serialNumber', value: 'SN-42', requiresHumanConfirmation: true }],
      missingFields: ['manufacturer', 'model', 'maximumPowerKw'],
    });
    expect(run.mock.calls[0]?.[0] as unknown).toBe(models[0]);
    expect(run.mock.calls[1]?.[0] as unknown).toBe(models[1]);
    expect(run.mock.calls[2]?.[0] as unknown).toBe(models[2]);
  });

  it('stops immediately when the first model returns any supported candidate', async () => {
    const run = vi.fn().mockResolvedValue({
      answer: '{"manufacturer":{"value":"ABB"},"model":{"value":"Terra AC"}}',
    });

    const response = await extractDataPlate(request(), environment(run), false);

    expect(response.status).toBe(200);
    expect(run).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledWith(
      models[0],
      expect.objectContaining({ task: 'query', stream: false }),
    );
  });

  it('returns a valid empty 200 when every normalized result is empty', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({ answer: '{"manufacturer":{"value":"N/A"}}' })
      .mockResolvedValueOnce({ response: '{"maximumPowerKw":{"value":0}}' })
      .mockResolvedValueOnce({ response: '{}' });

    const response = await extractDataPlate(request(), environment(run), false);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      candidates: [],
      missingFields: [...candidateFields],
    });
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('returns the stable 502 contract when every attempt fails technically', async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ response: 'not json' })
      .mockResolvedValueOnce({ unexpected: true });

    const response = await extractDataPlate(request(), environment(run), false);

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      code: 'AI_INFERENCE_FAILED',
      message: 'The AI service is temporarily unavailable. Please try the photo again.',
    });
  });

  it('preserves the invalid-response 502 contract when no inference call throws', async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({ response: 'not json' })
      .mockResolvedValueOnce({ unexpected: true })
      .mockResolvedValueOnce({ answer: 'still not json' });

    const response = await extractDataPlate(request(), environment(run), false);

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      code: 'AI_RESPONSE_INVALID',
      message: 'The AI could not read this photo. Try moving closer and reducing glare.',
    });
  });

  it('returns empty 200 when at least one attempt is valid-empty among technical failures', async () => {
    const run = vi
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ response: '{}' })
      .mockResolvedValueOnce({ response: 'not json' });

    const response = await extractDataPlate(request(), environment(run), false);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      candidates: [],
      missingFields: [...candidateFields],
    });
  });

  it('keeps debug extraction on exactly the selected model', async () => {
    const run = vi.fn().mockRejectedValue(new Error('single model failure'));

    const response = await extractDataPlate(request(models[1]), environment(run), true);

    expect(response.status).toBe(502);
    expect(run).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledWith(models[1], expect.objectContaining({ stream: false }));
    const input = run.mock.calls[0]?.[1] as unknown;
    expect(
      typeof input === 'object' && input !== null && 'messages' in input
        ? Array.isArray(input.messages)
        : false,
    ).toBe(true);
  });
});

describe('charger data-plate normalization', () => {
  it.each(['unknown', 'N/A', 'null', 'unreadable', 'not available', 'cannot read', '--'])(
    'rejects placeholder %s',
    (placeholder) => {
      expect(parseExtractionAnswer(`{"manufacturer":{"value":"${placeholder}"}}`)).toEqual([]);
    },
  );

  it('rejects overlong text and invalid power values', () => {
    expect(
      parseExtractionAnswer(
        JSON.stringify({
          manufacturer: { value: 'A'.repeat(501) },
          maximumPowerKw: { value: '22 kW' },
        }),
      ),
    ).toEqual([]);
    expect(parseExtractionAnswer('{"maximumPowerKw":{"value":true}}')).toEqual([]);
    expect(parseExtractionAnswer('{"maximumPowerKw":{"value":1001}}')).toEqual([]);
    expect(parseExtractionAnswer('{"maximumPowerKw":{"value":"22.5"}}')).toEqual([
      {
        field: 'maximumPowerKw',
        value: '22.5',
        requiresHumanConfirmation: true,
      },
    ]);
  });
});
