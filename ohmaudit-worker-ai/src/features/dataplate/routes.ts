import { AiBindings } from '../../environment';
import { extractDataPlate } from './service';

/**
 * `POST /v1/extract/charger-dataplate` — regular extraction used by the app.
 */
export function extractRoute(request: Request, env: AiBindings): Promise<Response> {
  return extractDataPlate(request, env, false);
}

/**
 * `POST /v1/debug/extract/charger-dataplate` — returns raw model output to aid
 * debugging recognition issues.
 */
export function debugExtractRoute(request: Request, env: AiBindings): Promise<Response> {
  return extractDataPlate(request, env, true);
}
