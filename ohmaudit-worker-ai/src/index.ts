import type { AiBindings } from './environment';
import { extractRoute, debugExtractRoute } from './features/dataplate/routes';
import { recommendRamsRoute } from './features/rams/routes';

export type { AiBindings };
export type { ChargerDataPlateField, ExtractionCandidate } from './features/dataplate/schema';
export { dataPlateDebugModels, isDataPlateDebugModel } from './features/dataplate/models';
export type { DataPlateDebugModel } from './features/dataplate/models';
export type {
  RamsDocument,
  RamsRecommendationMatch,
  RamsRecommendationRequest,
  RamsRecommendationResponse,
} from './features/rams/schema';
export { parseRamsRecommendationRequest, ramsSchemaVersion } from './features/rams/schema';
export { recommendRams } from './features/rams/service';
export {
  candidateFields,
  createCandidate,
  parseExtractionAnswer,
} from './features/dataplate/schema';

export default {
  async fetch(request: Request, env: AiBindings): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/v1/extract/charger-dataplate')
      return extractRoute(request, env);
    if (request.method === 'POST' && url.pathname === '/v1/debug/extract/charger-dataplate')
      return debugExtractRoute(request, env);
    if (request.method === 'POST' && url.pathname === '/v1/rams/recommend')
      return recommendRamsRoute(request, env);
    if (request.method === 'GET' && url.pathname === '/health')
      return Response.json({
        service: 'ohmaudit-worker-ai',
        status: 'ok',
        version: env.APP_VERSION ?? 'unknown',
      });
    return Response.json(
      { code: 'ROUTE_NOT_FOUND', message: 'The route was not found.' },
      { status: 404 },
    );
  },
} satisfies ExportedHandler<AiBindings>;
