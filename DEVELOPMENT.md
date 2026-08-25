# Development

## Prerequisites

- Node.js 24 (Angular 22 supports Node 24)
- pnpm 11
- A Cloudflare account for deployment
- Supabase PostgreSQL for API environments

## Repository independence

Each `ohmaudit-*` directory is an independent repository boundary. Run `pnpm install`, `pnpm test`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` inside any code project without relying on this root. Root commands are orchestration conveniences only.

## Environments

The supported environment names are `local`, `development`, `staging`, and `production`. Copy a project's `.env.example` to `.dev.vars` or the provider-specific local file documented by that project. Never commit secrets.

Cloudflare resources use the pattern `ohmaudit-<service>-<environment>`. Database schema changes are owned by Prisma migrations in `ohmaudit-api/prisma`; seed data is separate.

## Commands

```bash
pnpm install
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm verify
```

Deployment is intentionally per project. Review and replace placeholder Cloudflare resource IDs before deploying a non-local environment.

## Local core workflow

From the workspace root, start the PDF renderer, API, and Angular application together:

```bash
pnpm dev
```

They can still be started independently when debugging a single service:

```bash
cd ohmaudit-worker-pdf && pnpm dev
cd ohmaudit-api && pnpm dev
cd ohmaudit-web && pnpm dev
```

The PDF Worker listens on port `8790`, the API on `8787`, and Angular on `4200`. For the hourly scheduling worker, set the same random `INTERNAL_SERVICE_TOKEN` in the API and scheduler `.dev.vars` files, then run `pnpm dev` inside `ohmaudit-worker-scheduler`.

Visit packs, inspection drafts, pending submissions, and offline photo blobs are stored in browser IndexedDB. Use the application’s **Download visit for offline use** action while online before testing an offline engineer workflow.

## Change discipline

- Keep tenant ownership explicit with `organisationId` in TypeScript and `organisation_id` in persistence.
- Shared messages must be defined and versioned in `@ohmaudit/contracts` before producers or consumers use them.
- Do not import specialist-module business logic across modules.
- Do not add regulatory thresholds without an approved, versioned rule source.
- Append new architecture decisions to `ohmaudit-docs/DECISIONS`.
