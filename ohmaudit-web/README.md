# Ohm Audit Web

Angular 22 standalone, Signals-based installable PWA for office users and field engineers. Milestone 1 provides signup, email verification callbacks, password login, Organisation creation/switching, protected routes, and TOTP MFA setup/challenge flows. The frontend treats permission checks as UX only; the API remains authoritative.

## Development

Requires Node 24.15 or later and pnpm 11.

```bash
pnpm install
# Configure public/config.json with local Supabase public values
pnpm dev
pnpm test
pnpm lint
pnpm typecheck
pnpm build
pnpm deploy
```

Production is an Angular service-worker build hosted with Cloudflare Workers Static Assets. Configure environment-specific API/Supabase public values through the deployment pipeline; never ship service-role keys.
