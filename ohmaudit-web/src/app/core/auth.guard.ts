import { inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { OfflineVisitService } from './offline-visit.service';
import { offlineVisitRoute } from './offline-visit.helpers';

export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  if (auth.signedIn()) return true;
  const offline = inject(OfflineVisitService);
  const target = offlineVisitRoute(state.url);
  if (target !== undefined && (await offline.hasPack(target.organisationId, target.visitId)))
    return true;
  const router = inject(Router);
  if (/^\/app\/?(?:[?#].*)?$/u.test(state.url) && (await offline.allPacks()).length > 0)
    return router.createUrlTree(['/offline-jobs']);
  return router.createUrlTree(['/login']);
};
