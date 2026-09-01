import { describe, expect, it, vi } from 'vitest';
import { requestRamsRecommendations } from '../src/rams/rams-recommendation.client';
import type { RamsRecommendationContext } from '../src/rams/rams.service';

const currentId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const candidateId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const context: RamsRecommendationContext = {
  current: { id: currentId, title: 'Current RAMS', jobDescription: 'Replace a board' },
  candidates: [
    {
      id: candidateId,
      reference: 'SECRET-REFERENCE',
      title: 'Previous RAMS',
      status: 'APPROVED',
      currentRevisionNumber: 3,
      draftData: { secret: 'not for AI' },
      jobTitle: 'Previous job',
      jobDescription: 'Previous board replacement',
    },
  ],
};

describe('RAMS recommendation worker client', () => {
  it('sends only semantic fields and accepts the bounded response', async () => {
    let requestInit: RequestInit | undefined;
    const fetch = vi.fn((...args: [string, RequestInit?]) => {
      [, requestInit] = args;
      return Promise.resolve(
        Response.json({ schemaVersion: 1, matches: [{ id: candidateId, score: 0.91 }] }),
      );
    });

    await expect(
      requestRamsRecommendations(
        { fetch } as unknown as Fetcher,
        'organisation-a',
        context,
        'correlation-a',
      ),
    ).resolves.toEqual([{ id: candidateId, score: 0.91 }]);
    if (typeof requestInit?.body !== 'string') throw new Error('Expected a JSON request body.');
    expect(JSON.parse(requestInit.body)).toEqual({
      schemaVersion: 1,
      organisationId: 'organisation-a',
      current: context.current,
      documents: [
        {
          id: candidateId,
          title: 'Previous RAMS',
          jobDescription: 'Previous board replacement',
        },
      ],
    });
  });

  it('maps a missing binding to a stable domain error', async () => {
    await expect(
      requestRamsRecommendations(undefined, 'organisation-a', context, 'correlation-a'),
    ).rejects.toMatchObject({ code: 'AI_NOT_CONFIGURED', status: 503 });
  });

  it.each([
    ['an unreachable worker', { fetch: () => Promise.reject(new Error('unreachable')) }],
    [
      'a rejected worker request',
      { fetch: () => Promise.resolve(new Response(null, { status: 503 })) },
    ],
    [
      'an invalid worker response',
      {
        fetch: () =>
          Promise.resolve(
            Response.json({
              schemaVersion: 1,
              matches: [
                { id: candidateId, score: 0.9 },
                { id: candidateId, score: 0.9 },
                { id: candidateId, score: 0.9 },
                { id: candidateId, score: 0.9 },
              ],
            }),
          ),
      },
    ],
  ])('maps %s to a stable domain error', async (_name, worker) => {
    await expect(
      requestRamsRecommendations(
        worker as unknown as Fetcher,
        'organisation-a',
        context,
        'correlation-a',
      ),
    ).rejects.toMatchObject({ code: 'AI_RECOMMENDATION_FAILED', status: 502 });
  });
});
