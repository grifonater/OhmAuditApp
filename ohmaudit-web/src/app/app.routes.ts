import type { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./auth/login.component').then((module) => module.LoginComponent),
  },
  {
    path: 'signup',
    loadComponent: () => import('./auth/signup.component').then((module) => module.SignupComponent),
  },
  {
    path: 'forgot-password',
    loadComponent: () =>
      import('./auth/forgot-password.component').then((module) => module.ForgotPasswordComponent),
  },
  {
    path: 'reset-password',
    loadComponent: () =>
      import('./auth/reset-password.component').then((module) => module.ResetPasswordComponent),
  },
  {
    path: 'mfa',
    canActivate: [authGuard],
    loadComponent: () => import('./auth/mfa.component').then((module) => module.MfaComponent),
  },
  {
    path: 'guest/visit/:token/thermal/:taskId',
    loadComponent: () =>
      import('./operations/thermal-inspection.component').then(
        (module) => module.ThermalInspectionComponent,
      ),
  },
  {
    path: 'guest/visit/:token',
    loadComponent: () =>
      import('./operations/engineer-visit.component').then(
        (module) => module.EngineerVisitComponent,
      ),
  },
  {
    path: 'auth/callback',
    loadComponent: () =>
      import('./auth/auth-callback.component').then((module) => module.AuthCallbackComponent),
  },
  {
    path: 'app',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./shell/app-shell.component').then((module) => module.AppShellComponent),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./dashboard/dashboard.component').then((module) => module.DashboardComponent),
      },
      {
        path: 'platform',
        loadComponent: () =>
          import('./platform/platform.component').then((module) => module.PlatformComponent),
      },
      {
        path: 'org/:organisationId',
        loadComponent: () =>
          import('./organisation/organisation.component').then(
            (module) => module.OrganisationComponent,
          ),
      },
      {
        path: 'org/:organisationId/equipment',
        loadComponent: () =>
          import('./organisation/equipment.component').then((module) => module.EquipmentComponent),
      },
      {
        path: 'org/:organisationId/portfolio',
        loadComponent: () =>
          import('./portfolio/portfolio.component').then((module) => module.PortfolioComponent),
      },
      {
        path: 'org/:organisationId/portfolio/clients/:customerId',
        loadComponent: () =>
          import('./portfolio/client-detail.component').then(
            (module) => module.ClientDetailComponent,
          ),
      },
      {
        path: 'org/:organisationId/portfolio/clients/:customerId/sites/:siteId',
        loadComponent: () =>
          import('./portfolio/site-detail.component').then((module) => module.SiteDetailComponent),
      },
      {
        path: 'org/:organisationId/onboarding',
        loadComponent: () =>
          import('./organisation/onboarding.component').then(
            (module) => module.OnboardingComponent,
          ),
      },
      {
        path: 'org/:organisationId/security',
        loadComponent: () =>
          import('./organisation/security.component').then((module) => module.SecurityComponent),
      },
      {
        path: 'org/:organisationId/access',
        loadComponent: () =>
          import('./organisation/access.component').then((module) => module.AccessComponent),
      },
      {
        path: 'org/:organisationId/calendar',
        loadComponent: () =>
          import('./operations/calendar.component').then((module) => module.CalendarComponent),
      },
      {
        path: 'org/:organisationId/visits',
        loadComponent: () =>
          import('./operations/visits.component').then((module) => module.VisitsComponent),
      },
      {
        path: 'org/:organisationId/visits/:visitId/thermal/:taskId',
        loadComponent: () =>
          import('./operations/thermal-inspection.component').then(
            (module) => module.ThermalInspectionComponent,
          ),
      },
      {
        path: 'org/:organisationId/visits/:visitId',
        loadComponent: () =>
          import('./operations/engineer-visit.component').then(
            (module) => module.EngineerVisitComponent,
          ),
      },
      {
        path: 'org/:organisationId/inspections',
        loadComponent: () =>
          import('./operations/inspections.component').then(
            (module) => module.InspectionsComponent,
          ),
      },
      {
        path: 'org/:organisationId/inspections/review/:reviewId',
        loadComponent: () =>
          import('./operations/inspection-review.component').then(
            (module) => module.InspectionReviewComponent,
          ),
      },
      {
        path: 'org/:organisationId/assets/:assetId/ev',
        loadComponent: () =>
          import('./operations/ev-asset.component').then((module) => module.EvAssetComponent),
      },
    ],
  },
  { path: '', redirectTo: 'app', pathMatch: 'full' },
  { path: '**', redirectTo: 'app' },
];
