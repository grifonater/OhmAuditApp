import { describe, expect, it, vi } from 'vitest';
import { recommendRams, type RamsRuntimeBindings } from '../src/features/rams/service';

const organisationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const currentId = '11111111-1111-4111-8111-111111111111';
const documentIds = [
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666',
] as const;

function unitVector(score = 1): number[] {
  const vector = Array<number>(768).fill(0);
  vector[0] = score;
  vector[1] = Math.sqrt(1 - score * score);
  return vector;
}

function request(documents = documentIds.map((id, index) => document(id, index))): Request {
  return new Request('https://ai.example.test/v1/rams/recommend', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-correlation-id': 'correlation-test' },
    body: JSON.stringify({
      schemaVersion: 1,
      organisationId,
      current: document(currentId, 99),
      documents,
    }),
  });
}

function document(
  id: string,
  index: number,
): { id: string; title: string; jobDescription: string } {
  return { id, title: `RAMS ${index}`, jobDescription: `Install equipment ${index}` };
}

function fakeEnvironment(
  queryMatches: VectorizeMatch[],
  scores = new Map<string, number>(),
): {
  env: RamsRuntimeBindings;
  run: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  query: ReturnType<typeof vi.fn>;
} {
  const run = vi.fn(
    (
      _model: '@cf/baai/bge-base-en-v1.5',
      input: { text: string[]; pooling: 'cls' },
    ): Promise<unknown> =>
      Promise.resolve({
        shape: [input.text.length, 768],
        data: input.text.map((text) => {
          const id = text.startsWith('RAMS 99\n')
            ? currentId
            : documentIds[Number(text.match(/^RAMS (\d+)/)?.[1] ?? -1)];
          return unitVector(id === undefined ? 0 : (scores.get(id) ?? (id === currentId ? 1 : 0)));
        }),
      }),
  );
  const upsert = vi.fn((_vectors: VectorizeVector[]): Promise<unknown> => {
    void _vectors;
    return Promise.resolve({ mutationId: 'mutation-test' });
  });
  const query = vi.fn(
    (_vector: number[], _options: VectorizeQueryOptions): Promise<VectorizeMatches> => {
      void _vector;
      void _options;
      return Promise.resolve({ count: queryMatches.length, matches: queryMatches });
    },
  );
  return {
    env: {
      AI: { run },
      RAMS_VECTORS: { upsert, query },
      RAMS_EMBEDDING_MODEL_ID: '@cf/baai/bge-base-en-v1.5',
      RAMS_SIMILARITY_THRESHOLD: '0.78',
    },
    run,
    upsert,
    query,
  };
}

describe('RAMS recommendations', () => {
  it('isolates Vectorize operations by tenant and returns at most three threshold matches', async () => {
    const queryMatches: VectorizeMatch[] = [
      { id: currentId, score: 1 },
      { id: documentIds[0], score: 0.99 },
      { id: documentIds[1], score: 0.9 },
      { id: documentIds[2], score: 0.8 },
      { id: documentIds[3], score: 0.79 },
      { id: documentIds[4], score: 0.77 },
    ];
    const { env, upsert, query } = fakeEnvironment(queryMatches);

    const response = await recommendRams(request(), env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      schemaVersion: 1,
      matches: [
        { id: documentIds[0], score: 0.99 },
        { id: documentIds[1], score: 0.9 },
        { id: documentIds[2], score: 0.8 },
      ],
    });
    const vectors = upsert.mock.calls[0]?.[0] as VectorizeVector[];
    expect(vectors).toHaveLength(6);
    expect(vectors.every((vector) => vector.namespace === organisationId)).toBe(true);
    expect(vectors.map(({ id }) => id)).toContain(currentId);
    expect(query).toHaveBeenCalledWith(expect.any(Array), {
      namespace: organisationId,
      topK: 10,
      returnValues: false,
      returnMetadata: 'none',
    });
  });

  it('supplements results with direct cosine scores while an upsert is not queryable', async () => {
    const scores = new Map<string, number>([
      [documentIds[0], 0.91],
      [documentIds[1], 0.77],
    ]);
    const { env, upsert, query } = fakeEnvironment([], scores);

    const response = await recommendRams(
      request([document(documentIds[0], 0), document(documentIds[1], 1)]),
      env,
    );

    expect(upsert).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledOnce();
    const responseBody: unknown = await response.json();
    expect(responseBody).toMatchObject({
      schemaVersion: 1,
      matches: [{ id: documentIds[0] }],
    });
    const firstMatch: unknown =
      typeof responseBody === 'object' &&
      responseBody !== null &&
      'matches' in responseBody &&
      Array.isArray(responseBody.matches)
        ? (responseBody.matches[0] as unknown)
        : undefined;
    if (
      typeof firstMatch !== 'object' ||
      firstMatch === null ||
      !('score' in firstMatch) ||
      typeof firstMatch.score !== 'number'
    )
      throw new Error('Expected a scored RAMS match.');
    expect(firstMatch.score).toBeCloseTo(0.91, 10);
  });

  it('rejects an invalid versioned request before inference or indexing', async () => {
    const { env, run, upsert, query } = fakeEnvironment([]);
    const invalidRequest = new Request('https://ai.example.test/v1/rams/recommend', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ schemaVersion: 2, organisationId, current: {}, documents: [] }),
    });

    const response = await recommendRams(invalidRequest, env);

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      code: 'RAMS_REQUEST_INVALID',
      message: 'The RAMS recommendation request is invalid.',
    });
    expect(run).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });
});
