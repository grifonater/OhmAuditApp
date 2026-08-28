# Ohm Audit worker-ai

Provider-neutral AI boundary. Extracted plate data is always returned as review candidates and never silently mutates authoritative records.

EV charger data plates are analysed on demand with Cloudflare Workers AI using
`@cf/moondream/moondream3.1-9B-A2B`. Images are processed transiently and are not stored by this
Worker.

The Worker has no public `workers.dev` route. `ohmaudit-api` reaches it through the `AI_WORKER`
service binding.

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

Workers AI requires the `AI` binding configured in `wrangler.jsonc`; it does not require an API-key
secret. Cross-worker messages must use validated, versioned payloads.
