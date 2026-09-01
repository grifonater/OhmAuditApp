import type { AiBindings } from '../../environment';
import { recommendRams } from './service';

export function recommendRamsRoute(request: Request, env: AiBindings): Promise<Response> {
  return recommendRams(request, env);
}
