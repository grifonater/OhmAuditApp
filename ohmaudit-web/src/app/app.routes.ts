import type { Routes } from '@angular/router';
import {
  ramsCreateRoute,
  ramsDetailRoute,
  ramsLibraryRoute,
  ramsTemplateEditRoute,
} from './core/rams-routes';
import { authGuard } from './core/auth.guard';
import { authorizationGuard } from './core/authorization.guard';
import {
  emergencyLightingAssetRoute,
  emergencyLightingInspectionRoute,
  guestEmergencyLightingInspectionRoute,
} from './core/emergency-lighting-routes';

export const routes: Routes = [
  {
    path: guestEmergencyLightingInspectionRoute,
    loadComponent: () =>
      import('./operations/emergency-lighting-inspection.component').then(
        (module) => module.EmergencyLightingInspectionComponent,
      ),
  },
  {
    path: 'offline-jobs',
    loadComponent: () =>
      import('./operations/offline-jobs.component').then((module) => module.OfflineJobsComponent),
  },
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
    path: 'guest/job/:token/thermal/:taskId',
    loadComponent: () =>
      import('./operations/thermal-inspection.component').then(
        (module) => module.ThermalInspectionComponent,
      ),
  },
  {
    path: 'guest/job/:token',
    loadComponent: () =>
      import('./operations/engineer-visit.component').then(
        (module) => module.EngineerVisitComponent,
      ),
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
        path: emergencyLightingInspectionRoute.path,
        canActivate: [authorizationGuard],
        data: {
          capabilities: [...emergencyLightingInspectionRoute.capabilities],
          module: 'emergency-lighting',
        },
        loadComponent: () =>
          import('./operations/emergency-lighting-inspection.component').then(
            (module) => module.EmergencyLightingInspectionComponent,
          ),
      },
      {
        path: '',
        loadComponent: () =>
          import('./dashboard/dashboard.component').then((module) => module.DashboardComponent),
      },
      {
        path: 'platform',
        canActivate: [authorizationGuard],
        data: { platformAdmin: true },
        loadComponent: () =>
          import('./platform/platform.component').then((module) => module.PlatformComponent),
      },
      {
        path: 'platform/testing',
        canActivate: [authorizationGuard],
        data: { platformAdmin: true },
        loadComponent: () =>
          import('./platform/feature-testing.component').then(
            (module) => module.FeatureTestingComponent,
          ),
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./settings/user-settings.component').then(
            (module) => module.UserSettingsComponent,
          ),
      },
      {
        path: 'org/:organisationId/equipment',
        canActivate: [authorizationGuard],
        data: { capabilities: ['organisation.manage'], module: 'thermal-imaging' },
        loadComponent: () =>
          import('./organisation/equipment.component').then((module) => module.EquipmentComponent),
      },
      {
        path: 'org/:organisationId/portfolio',
        canActivate: [authorizationGuard],
        data: { capabilities: ['customers.read', 'sites.read'] },
        loadComponent: () =>
          import('./portfolio/portfolio.component').then((module) => module.PortfolioComponent),
      },
      {
        path: 'org/:organisationId/portfolio/clients/:customerId',
        canActivate: [authorizationGuard],
        data: { capabilities: ['customers.read', 'sites.read'] },
        loadComponent: () =>
          import('./portfolio/client-detail.component').then(
            (module) => module.ClientDetailComponent,
          ),
      },
      {
        path: 'org/:organisationId/portfolio/clients/:customerId/sites/:siteId',
        canActivate: [authorizationGuard],
        data: { capabilities: ['sites.read', 'assets.read'] },
        loadComponent: () =>
          import('./portfolio/site-detail.component').then((module) => module.SiteDetailComponent),
      },
      {
        path: 'org/:organisationId/onboarding',
        canActivate: [authorizationGuard],
        data: { capabilities: ['organisation.manage'] },
        loadComponent: () =>
          import('./organisation/onboarding.component').then(
            (module) => module.OnboardingComponent,
          ),
      },
      {
        path: 'org/:organisationId/security',
        canActivate: [authorizationGuard],
        loadComponent: () =>
          import('./organisation/security.component').then((module) => module.SecurityComponent),
      },
      {
        path: 'org/:organisationId/access',
        canActivate: [authorizationGuard],
        data: { capabilities: ['organisation.users.manage'] },
        loadComponent: () =>
          import('./organisation/access.component').then((module) => module.AccessComponent),
      },
      {
        path: 'org/:organisationId/calendar',
        canActivate: [authorizationGuard],
        data: { capabilities: ['sites.read'] },
        loadComponent: () =>
          import('./operations/calendar.component').then((module) => module.CalendarComponent),
      },
      {
        path: 'org/:organisationId/visits',
        canActivate: [authorizationGuard],
        data: { capabilities: ['sites.read'] },
        loadComponent: () =>
          import('./operations/visits.component').then((module) => module.VisitsComponent),
      },
      {
        path: 'org/:organisationId/visits/:visitId/thermal/:taskId',
        canActivate: [authorizationGuard],
        data: { capabilities: ['inspections.perform'], module: 'thermal-imaging' },
        loadComponent: () =>
          import('./operations/thermal-inspection.component').then(
            (module) => module.ThermalInspectionComponent,
          ),
      },
      {
        path: ramsLibraryRoute.path,
        canActivate: [authorizationGuard],
        data: { capabilities: [...ramsLibraryRoute.capabilities] },
        loadComponent: () =>
          import('./operations/rams-library.component').then(
            (module) => module.RamsLibraryComponent,
          ),
      },
      {
        path: ramsTemplateEditRoute.path,
        canActivate: [authorizationGuard],
        data: { capabilities: [...ramsTemplateEditRoute.capabilities] },
        loadComponent: () =>
          import('./operations/rams-workspace.component').then(
            (module) => module.RamsWorkspaceComponent,
          ),
      },
      {
        path: ramsCreateRoute.path,
        canActivate: [authorizationGuard],
        data: { capabilities: [...ramsCreateRoute.capabilities] },
        loadComponent: () =>
          import('./operations/rams-workspace.component').then(
            (module) => module.RamsWorkspaceComponent,
          ),
      },
      {
        path: ramsDetailRoute.path,
        canActivate: [authorizationGuard],
        data: { capabilities: [...ramsDetailRoute.capabilities] },
        loadComponent: () =>
          import('./operations/rams-workspace.component').then(
            (module) => module.RamsWorkspaceComponent,
          ),
      },
      {
        path: 'org/:organisationId/visits/:visitId/overview',
        canActivate: [authorizationGuard],
        data: { capabilities: ['sites.read'] },
        loadComponent: () =>
          import('./operations/job-overview.component').then(
            (module) => module.JobOverviewComponent,
          ),
      },
      {
        path: 'org/:organisationId/visits/:visitId',
        canActivate: [authorizationGuard],
        data: { capabilities: ['sites.read'] },
        loadComponent: () =>
          import('./operations/engineer-visit.component').then(
            (module) => module.EngineerVisitComponent,
          ),
      },
      {
        path: 'org/:organisationId/inspections',
        canActivate: [authorizationGuard],
        data: { capabilities: ['inspections.review'] },
        loadComponent: () =>
          import('./operations/inspections.component').then(
            (module) => module.InspectionsComponent,
          ),
      },
      {
        path: 'org/:organisationId/inspections/review/:reviewId',
        canActivate: [authorizationGuard],
        data: { capabilities: ['inspections.review'] },
        loadComponent: () =>
          import('./operations/inspection-review.component').then(
            (module) => module.InspectionReviewComponent,
          ),
      },
      {
        path: emergencyLightingAssetRoute.path,
        canActivate: [authorizationGuard],
        data: {
          capabilities: [...emergencyLightingAssetRoute.capabilities],
          module: 'emergency-lighting',
        },
        loadComponent: () =>
          import('./operations/emergency-lighting-asset.component').then(
            (module) => module.EmergencyLightingAssetComponent,
          ),
      },
      {
        path: 'org/:organisationId/assets/:assetId/ev',
        canActivate: [authorizationGuard],
        data: { capabilities: ['assets.read'], module: 'ev-charging' },
        loadComponent: () =>
          import('./operations/ev-asset.component').then((module) => module.EvAssetComponent),
      },
    ],
  },
  { path: '', redirectTo: 'app', pathMatch: 'full' },
  { path: '**', redirectTo: 'app' },
];
