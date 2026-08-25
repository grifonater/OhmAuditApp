export interface AiBindings {
  APP_ENV: 'local' | 'development' | 'staging' | 'production';
  APP_VERSION: string;
  AI_MODEL_ID: string;
}

export interface ExtractionCandidate {
  field: string;
  value: string;
  confidence?: number;
  requiresHumanConfirmation: true;
}

export function createCandidate(
  field: string,
  value: string,
  confidence?: number,
): ExtractionCandidate {
  return confidence === undefined
    ? { field, value, requiresHumanConfirmation: true }
    : { field, value, confidence, requiresHumanConfirmation: true };
}

export default {
  fetch(_request: Request, env: AiBindings): Response {
    return Response.json({ service: 'ohmaudit-worker-ai', status: 'ok', version: env.APP_VERSION });
  },
} satisfies ExportedHandler<AiBindings>;
