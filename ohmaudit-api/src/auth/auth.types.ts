export type AuthenticatorAssuranceLevel = 'aal1' | 'aal2';

export interface AuthenticatedActor {
  authSubject: string;
  email: string;
  displayName?: string;
  assuranceLevel: AuthenticatorAssuranceLevel;
  support?: {
    sessionId: string;
    platformAdminUserId: string;
    targetUserId: string;
    organisationId: string;
    expiresAt: string;
  };
}

export interface TokenVerifier {
  verify(
    token: string,
    environment: { SUPABASE_URL: string; SUPABASE_JWT_AUDIENCE: string },
  ): Promise<AuthenticatedActor>;
}
