import { inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';
import { Router } from '@angular/router';
import { AppConfigService } from './app-config.service';
import { AuthService } from './auth.service';
import { authorizationUrl } from './authorization-url';
import { OfflineVisitService } from './offline-visit.service';

interface AuthorizationAccount {
  user: { platformRole: 'USER' | 'PLATFORM_ADMIN' };
  memberships: Array<{
    organisation: { id: string };
    role: { capabilities: string[] };
  }>;
}

async function getJson<T>(path: string, auth: AuthService, config: AppConfigService): Promise<T> {
  const token = auth.session()?.access_token;
  if (token === undefined) throw new Error('Authentication is required.');
  const headers = new Headers({ authorization: `Bearer ${token}` });
  const supportToken = sessionStorage.getItem('ohmaudit.supportSession');
  if (supportToken) headers.set('x-ohmaudit-support-session', supportToken);
  const response = await fetch(authorizationUrl(config.config.apiBaseUrl, path), { headers });
  if (!response.ok) throw new Error('Authorization could not be verified.');
  const body: unknown = await response.json();
  return body as T;
}

export const authorizationGuard: CanActivateFn = async (route) => {
  const auth = inject(AuthService);
  const config = inject(AppConfigService);
  const router = inject(Router);
  const offline = inject(OfflineVisitService);
  try {
    const account = await getJson<AuthorizationAccount>('/me', auth, config);
    if (route.data['platformAdmin'] === true && account.user.platformRole !== 'PLATFORM_ADMIN')
      return router.createUrlTree(['/app']);

    const organisationId = route.paramMap.get('organisationId');
    if (organisationId === null) return true;
    const membership = account.memberships.find((item) => item.organisation.id === organisationId);
    if (membership === undefined) return router.createUrlTree(['/app']);

    const required = (route.data['capabilities'] as string[] | undefined) ?? [];
    if (!required.every((capability) => membership.role.capabilities.includes(capability)))
      return router.createUrlTree(['/app/org', organisationId]);

    const moduleKey = route.data['module'] as string | undefined;
    if (moduleKey !== undefined) {
      const { entitlements } = await getJson<{
        entitlements: Array<{ module: { key: string }; entitled: boolean }>;
      }>(`/organisations/${organisationId}/entitlements`, auth, config);
      if (!entitlements.some((item) => item.module.key === moduleKey && item.entitled))
        return router.createUrlTree(['/app/org', organisationId]);
    }
    return true;
  } catch {
    const organisationId = route.paramMap.get('organisationId');
    const visitId = route.paramMap.get('visitId') ?? undefined;
    const offlineVisitRoute = route.routeConfig?.path?.includes('visits') === true;
    if (
      organisationId !== null &&
      offlineVisitRoute &&
      (await offline.hasPack(organisationId, visitId))
    )
      return true;
    return router.createUrlTree(['/app']);
  }
};
