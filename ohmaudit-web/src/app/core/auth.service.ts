import { Injectable, computed, inject, signal } from '@angular/core';
import {
  createClient,
  type AuthChangeEvent,
  type Session,
  type SupabaseClient,
} from '@supabase/supabase-js';
import { AppConfigService } from './app-config.service';

export interface UserProfile {
  email: string;
  displayName: string;
  mobile: string;
}

const LAST_AUTHENTICATED_USER_KEY = 'ohmaudit.lastAuthenticatedUserId';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly config = inject(AppConfigService);
  private readonly sessionState = signal<Session | null>(null);
  private readonly passwordRecoveryState = signal(false);
  private clientValue?: SupabaseClient;
  readonly session = this.sessionState.asReadonly();
  readonly signedIn = computed(() => this.sessionState() !== null);
  readonly recoveringPassword = this.passwordRecoveryState.asReadonly();

  lastAuthenticatedUserId(): string | undefined {
    return (
      this.sessionState()?.user.id ?? localStorage.getItem(LAST_AUTHENTICATED_USER_KEY) ?? undefined
    );
  }

  private get client(): SupabaseClient {
    this.clientValue ??= createClient(
      this.config.config.supabaseUrl,
      this.config.config.supabasePublishableKey,
    );
    return this.clientValue;
  }

  async initialise(): Promise<void> {
    this.client.auth.onAuthStateChange((event, session) => this.handleAuthChange(event, session));
    try {
      const { data } = await this.client.auth.getSession();
      this.setSession(data.session);
    } catch {
      // A previously authenticated user's downloaded work remains available without Supabase.
      this.sessionState.set(null);
    }
    if (globalThis.location?.hash.includes('type=recovery') === true) {
      this.passwordRecoveryState.set(true);
    }
  }

  private handleAuthChange(event: AuthChangeEvent, session: Session | null): void {
    this.setSession(session);
    if (event === 'PASSWORD_RECOVERY') this.passwordRecoveryState.set(true);
    if (event === 'SIGNED_OUT') this.passwordRecoveryState.set(false);
  }

  private setSession(session: Session | null): void {
    this.sessionState.set(session);
    if (session !== null) localStorage.setItem(LAST_AUTHENTICATED_USER_KEY, session.user.id);
  }

  async signIn(email: string, password: string): Promise<boolean> {
    const { error } = await this.client.auth.signInWithPassword({ email, password });
    if (error !== null) throw error;
    const { data: assurance, error: assuranceError } =
      await this.client.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assuranceError !== null) throw assuranceError;
    return assurance.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2';
  }

  async signUp(email: string, password: string, displayName: string): Promise<boolean> {
    const { data, error } = await this.client.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: this.config.config.authRedirectUrl,
        data: { display_name: displayName },
      },
    });
    if (error !== null) throw error;
    return data.session !== null;
  }

  async requestPasswordReset(email: string): Promise<void> {
    const { error } = await this.client.auth.resetPasswordForEmail(email, {
      redirectTo: this.config.config.authRedirectUrl,
    });
    if (error !== null) throw error;
  }

  async updatePassword(password: string): Promise<void> {
    const { error } = await this.client.auth.updateUser({ password });
    if (error !== null) throw error;
    this.passwordRecoveryState.set(false);
  }

  async userProfile(): Promise<UserProfile> {
    const { data, error } = await this.client.auth.getUser();
    if (error !== null) throw error;
    const metadata = data.user.user_metadata;
    return {
      email: data.user.email ?? '',
      displayName: typeof metadata['display_name'] === 'string' ? metadata['display_name'] : '',
      mobile: typeof metadata['mobile'] === 'string' ? metadata['mobile'] : '',
    };
  }

  async updateProfile(displayName: string, mobile: string): Promise<void> {
    const { error } = await this.client.auth.updateUser({
      data: { display_name: displayName, mobile },
    });
    if (error !== null) throw error;
  }

  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    if (error !== null) throw error;
    localStorage.removeItem(LAST_AUTHENTICATED_USER_KEY);
    this.sessionState.set(null);
  }

  async enrollMfa(): Promise<{ id: string; qrCode: string; secret: string }> {
    const { data, error } = await this.client.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Ohm Audit',
    });
    if (error !== null) throw error;
    return { id: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
  }

  async verifyMfa(factorId: string, code: string): Promise<void> {
    const { error } = await this.client.auth.mfa.challengeAndVerify({ factorId, code });
    if (error !== null) throw error;
  }

  async verifiedTotpFactorId(): Promise<string> {
    const { data, error } = await this.client.auth.mfa.listFactors();
    if (error !== null) throw error;
    const factor = data.totp.find((item) => item.status === 'verified');
    if (factor === undefined) throw new Error('No verified authenticator is available.');
    return factor.id;
  }
}
