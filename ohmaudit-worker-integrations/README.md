# Ohm Audit worker-integrations

External integration and webhook boundary. Provider adapters verify signatures, deduplicate provider event IDs, and transform payloads into internal events.

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
