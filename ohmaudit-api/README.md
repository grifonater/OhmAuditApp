# Ohm Audit API

Cloudflare Worker hosting the authoritative versioned REST API and modular-monolith domain logic. The API owns authorisation, tenancy enforcement, validation, and PostgreSQL access through Hyperdrive. Specialist modules remain isolated under `src/modules` as they are implemented.

## Setup and commands

Requires Node 24, pnpm 11, Wrangler credentials for deployment, and a Supabase PostgreSQL URL for migrations.

```bash
pnpm install
cp .env.example .dev.vars
pnpm dev
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm exec wrangler deploy --env development
```

Milestone 1 adds Supabase JWT verification, internal users, Organisations, memberships, roles, capabilities, MFA policy, platform-admin separation, and tenant-isolation boundaries. Apply Prisma migrations before using authenticated endpoints. Secrets belong in Wrangler secrets, never `wrangler.jsonc`.

## First superadmin

For local development, restart the API, sign in, open `/app/platform`, and use the local bootstrap token documented in the platform setup screen. Local mode uses this deterministic development-only token so a stale `.dev.vars` value cannot lock out the first account. The claim form is available only while no active superadmin exists. After the first claim, superadmins promote other registered users from **Superadmin → Users & access**; the API prevents removal of the final active superadmin.

For deployed environments, configure this value as a Wrangler secret rather than a plain variable. It can be removed after the first superadmin has been claimed.
