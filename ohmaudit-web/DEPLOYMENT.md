# Deployment

Build environment-specific public configuration before `pnpm build`, review the generated service-worker manifest, and run `pnpm deploy`. Cloudflare serves `dist/ohmaudit-web/browser` with SPA fallback. Use separate Worker projects/domains for development, staging, and production.
