export interface IntegrationBindings {
  APP_ENV: 'local' | 'development' | 'staging' | 'production';
  APP_VERSION: string;
  WEBHOOK_MAX_BYTES: string;
}

export function providerFromPath(pathname: string): string | undefined {
  const match = /^\/webhooks\/([a-z][a-z0-9-]{1,31})$/u.exec(pathname);
  return match?.[1];
}

export default {
  fetch(request: Request, env: IntegrationBindings): Response {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return Response.json({
        service: 'ohmaudit-worker-integrations',
        status: 'ok',
        version: env.APP_VERSION,
      });
    }
    const provider = providerFromPath(url.pathname);
    if (request.method !== 'POST' || provider === undefined) {
      return Response.json(
        { code: 'ROUTE_NOT_FOUND', message: 'Webhook route not found.' },
        { status: 404 },
      );
    }
    return Response.json(
      {
        code: 'PROVIDER_NOT_CONFIGURED',
        message: `No verified webhook adapter is configured for ${provider}.`,
      },
      { status: 501 },
    );
  },
} satisfies ExportedHandler<IntegrationBindings>;
