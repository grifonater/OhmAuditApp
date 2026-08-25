import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { AuthenticatedActor, TokenVerifier } from './auth.types';

const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export class SupabaseTokenVerifier implements TokenVerifier {
  async verify(
    token: string,
    environment: { SUPABASE_URL: string; SUPABASE_JWT_AUDIENCE: string },
  ): Promise<AuthenticatedActor> {
    const baseUrl = environment.SUPABASE_URL.replace(/\/$/u, '');
    const issuer = `${baseUrl}/auth/v1`;
    const jwksUrl = `${issuer}/.well-known/jwks.json`;
    let keySet = keySets.get(jwksUrl);
    if (keySet === undefined) {
      keySet = createRemoteJWKSet(new URL(jwksUrl));
      keySets.set(jwksUrl, keySet);
    }
    const { payload } = await jwtVerify(token, keySet, {
      issuer,
      audience: environment.SUPABASE_JWT_AUDIENCE,
      algorithms: ['ES256', 'RS256'],
    });
    if (typeof payload.sub !== 'string' || typeof payload['email'] !== 'string') {
      throw new Error('Token is missing required identity claims.');
    }
    const metadata = payload['user_metadata'];
    const displayName =
      typeof metadata === 'object' && metadata !== null && 'display_name' in metadata
        ? String(metadata.display_name)
        : undefined;
    return {
      authSubject: payload.sub,
      email: payload['email'],
      ...(displayName === undefined ? {} : { displayName }),
      assuranceLevel: payload['aal'] === 'aal2' ? 'aal2' : 'aal1',
    };
  }
}
