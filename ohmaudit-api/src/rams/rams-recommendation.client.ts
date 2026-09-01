import { z } from 'zod';
import { DomainError } from '../shared/domain-error';
import type { RamsRecommendationContext, RamsRecommendationMatch } from './rams.service';

const recommendationResponseSchema = z
  .object({
    schemaVersion: z.literal(1),
    matches: z
      .array(z.object({ id: z.uuid(), score: z.number().finite().min(0).max(1) }).strict())
      .max(3),
  })
  .strict();

export async function requestRamsRecommendations(
  worker: Fetcher | undefined,
  organisationId: string,
  context: RamsRecommendationContext,
  correlationId: string,
): Promise<RamsRecommendationMatch[]> {
  if (worker === undefined)
    throw new DomainError(
      'AI_NOT_CONFIGURED',
      'RAMS recommendations are not configured. Please contact support.',
      503,
    );

  let response: Response;
  try {
    response = await worker.fetch('https://ohmaudit-ai.internal/v1/rams/recommend', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-correlation-id': correlationId },
      body: JSON.stringify({
        schemaVersion: 1,
        organisationId,
        current: context.current,
        documents: context.candidates.map(({ id, title, jobDescription }) => ({
          id,
          title,
          jobDescription: jobDescription ?? '',
        })),
      }),
    });
  } catch (error: unknown) {
    console.error(
      JSON.stringify({
        event: 'api.ai_rams_recommendations.worker_unreachable',
        correlationId,
        errorType: error instanceof Error ? error.name : 'UnknownError',
      }),
    );
    throw new DomainError(
      'AI_RECOMMENDATION_FAILED',
      'RAMS recommendations are temporarily unavailable. Please try again.',
      502,
    );
  }

  if (!response.ok)
    throw new DomainError(
      'AI_RECOMMENDATION_FAILED',
      'RAMS recommendations are temporarily unavailable. Please try again.',
      502,
    );
  const result = recommendationResponseSchema.safeParse(
    await response.json().catch(() => undefined),
  );
  if (!result.success)
    throw new DomainError(
      'AI_RECOMMENDATION_FAILED',
      'RAMS recommendations are temporarily unavailable. Please try again.',
      502,
    );
  return result.data.matches;
}
