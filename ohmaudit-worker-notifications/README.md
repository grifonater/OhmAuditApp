# Ohm Audit worker-notifications

Queue consumer for organisation-configured in-app, email, and SMS notification delivery through provider abstractions.

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
