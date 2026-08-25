# Publishing Ohm Audit

The root release command publishes Cloudflare applications in dependency-safe order without
reading or printing secret values.

## One-time setup

Complete every `env.production` section in the Wrangler files. Wrangler variables, R2 bindings,
Hyperdrive bindings, service bindings, and secrets are not inherited from the top-level local
configuration.

All production resources belong in the Cloudflare account named `ohmaudit` (account ID
`488131b4b757ad9a4541451b792e83e5`). The core resources are currently provisioned. If they ever
need to be recreated:

1. Enable R2 for the `ohmaudit` account and create `ohmaudit-media-production` in Western Europe.
2. Create Hyperdrive configuration `ohmaudit-db-production` in `ohmaudit` with PostgreSQL host
   `db.cgynntzcxptnvsqrttsz.supabase.co`, port `5432`, database and user `postgres`, and SSL mode
   `require`.
3. Confirm Hyperdrive ID `1b9c83b57a96418f9dc6e40126a34372` remains configured in
   `ohmaudit-api/wrangler.jsonc` under `env.production.hyperdrive`.

The old queues and `ohmaudit-pdf` bucket in the personal account are not referenced by the current
application and should not be added to the new production configuration.

Configure the API bootstrap secret when it is needed:

```powershell
pnpm --dir ohmaudit-api exec wrangler secret put SUPERADMIN_BOOTSTRAP_TOKEN --env production
```

For the full worker set, configure the same independently generated internal token on both the API
and scheduler:

```powershell
pnpm --dir ohmaudit-api exec wrangler secret put INTERNAL_SERVICE_TOKEN --env production
pnpm --dir ohmaudit-worker-scheduler exec wrangler secret put INTERNAL_SERVICE_TOKEN --env production
```

Paste the same value into both prompts. Do not put these values in source files.

## Publish every Cloudflare application

This verifies the workspace, requests an explicit production confirmation, then publishes PDF,
notifications, AI, integrations, API, scheduler, and web in dependency-safe order:

```powershell
pnpm publish:cloudflare
```

Require the initial superadmin secret to exist during preflight:

```powershell
pnpm publish:cloudflare -- -RequireBootstrapSecret
```

## Publish only the currently required core application

This publishes only PDF, API, and web:

```powershell
pnpm publish:cloudflare -- -Scope Core
```

## Apply migrations as part of the release

The release script automatically reads `DIRECT_URL` from the ignored `ohmaudit-api/.dev.vars` file.
Run:

```powershell
pnpm publish:cloudflare -- -ApplyMigrations
```

To override the local file in CI, set the production direct PostgreSQL connection string only in
the current process, then explicitly enable migrations:

```powershell
$env:OHMAUDIT_MIGRATION_DATABASE_URL = '<YOUR_DIRECT_DATABASE_URL>'
pnpm publish:cloudflare -- -ApplyMigrations
Remove-Item Env:OHMAUDIT_MIGRATION_DATABASE_URL
```

Use `-Yes` only in an already protected CI production job. Use `-SkipVerify` only when the exact
commit has already passed the complete `pnpm verify` command in CI.
