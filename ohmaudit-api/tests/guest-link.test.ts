import { describe, expect, it } from 'vitest';
import { parseEnvironment } from '../src/shared/environment';
import { guestLinkUrls } from '../src/visits/guest-link';

describe('guest job share links', () => {
  it.each(['https://ohmaudit-api-production.ohmaudit.workers.dev', 'https://preview.example.test'])(
    'uses the configured public origin instead of request origin %s',
    (requestOrigin) => {
      const request = new Request(`${requestOrigin}/api/v1/visits/visit-id/guest-link`);
      const urls = guestLinkUrls('https://ohmaudit.com', 'guest-token');

      expect(urls).toEqual({
        guestUrl: '/guest/job/guest-token',
        shareUrl: 'https://ohmaudit.com/guest/job/guest-token',
      });
      expect(urls.shareUrl).not.toContain(new URL(request.url).origin);
    },
  );

  it('requires PUBLIC_WEB_ORIGIN to be an origin rather than an arbitrary URL', () => {
    expect(() =>
      parseEnvironment({
        APP_ENV: 'local',
        APP_VERSION: 'test',
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_JWT_AUDIENCE: 'authenticated',
        PUBLIC_WEB_ORIGIN: 'https://ohmaudit.com/untrusted-path',
        ALLOWED_ORIGINS: 'http://localhost:4200',
      }),
    ).toThrow();
  });
});
