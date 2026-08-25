# Ohm Audit worker-scheduler

Hourly schedule-occurrence scanner. It will create idempotent notification events from shared schedule records; it never scans specialist asset tables.

## Development

Requires Node 24, pnpm 11, and Wrangler credentials for deployment.

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

Cross-worker messages must use versioned schemas from `@ohmaudit/contracts`. Configure provider credentials as Cloudflare secrets, never plaintext variables.
