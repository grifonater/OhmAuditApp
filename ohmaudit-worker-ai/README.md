# Ohm Audit worker-ai

Provider-neutral AI boundary. Extracted plate data is always returned as review candidates and never silently mutates authoritative records.

EV charger data plates are analysed on demand with Cloudflare Workers AI. The production extraction
route tries these allowlisted vision models in order and stops as soon as one returns any useful
normalized candidate:

1. `@cf/moondream/moondream3.1-9B-A2B`
2. `@cf/meta/llama-4-scout-17b-16e-instruct`
3. `@cf/mistralai/mistral-small-3.1-24b-instruct`

Set `AI_MODEL_CHAIN` to a comma-separated ordering of those identifiers to override the order.
Unsupported entries are ignored, duplicates are removed, and no more than three models run. The
debug route remains single-model and uses `x-ai-model-id` or the allowlisted `AI_MODEL_ID` default.
Images are processed transiently and are not stored by this Worker or included in attempt logs.

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
