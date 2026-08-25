# Milestone 1 setup

## 1. Supabase

1. Create a Supabase project.
2. In Authentication → Providers, enable Email.
3. In Authentication → URL Configuration, set the local site URL to `http://localhost:4200` and add `http://localhost:4200/auth/callback` as a redirect URL.
4. In Authentication → Signing Keys, use an asymmetric signing key so the API can verify access tokens through JWKS.
5. Copy `ohmaudit-web/public/config.json` and replace the Supabase URL and publishable key.
6. Copy `ohmaudit-api/.env.example` to `ohmaudit-api/.dev.vars`. Set `SUPABASE_URL`, `SUPABASE_JWT_AUDIENCE=authenticated`, `ALLOWED_ORIGINS=http://localhost:4200`, and `DATABASE_URL`.
7. In the same `.dev.vars` file, set `DIRECT_URL` to Supabase’s direct database connection string. Prisma uses it for migrations while the Worker uses `DATABASE_URL` at runtime.

Never put the Supabase service-role/secret key in Angular. It is not needed for Milestone 1.

## 2. Apply the schema

Wrangler and the Prisma migration commands both use
`ohmaudit-api/.dev.vars` for local API configuration. Prisma also falls back to
`ohmaudit-api/.env`, and values already set in the shell take precedence.

From `ohmaudit-api`:

```bash
pnpm install
pnpm prisma:generate
pnpm db:deploy
pnpm dev
```

The first migration creates internal users, Organisations, memberships, roles, capabilities, MFA policy, and audit events.

## 3. Start Angular

From `ohmaudit-web`:

```bash
pnpm install
pnpm dev
```

Open `http://localhost:4200`, create an account, verify the email, sign in, and create the first Organisation.

## 4. Cloudflare deployment

For a deployed API, create a Hyperdrive configuration using the Supabase connection string and add the binding to `ohmaudit-api/wrangler.jsonc`. Store database credentials and other private values as Cloudflare secrets. Replace local URLs in `config.json` during the web deployment pipeline.

Cloudflare is not required to exercise the local application flow.

Wrangler provides local R2 emulation for Milestone 2 contractor logos and Milestone 3 asset photos through the `MEDIA_BUCKET` binding. For a deployed API, create the configured `ohmaudit-media-*` R2 bucket before deployment; media remains private and is served only through authorised API routes.
