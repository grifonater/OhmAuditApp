# Ohm Audit Documentation

Product, domain, security, deployment, module, and Architecture Decision Record documentation. These documents define boundaries and intent; the executable cross-repository wire contract lives in `@ohmaudit/contracts`.

```bash
pnpm install
pnpm test
pnpm lint
pnpm format:check
pnpm build
```

Update the relevant document and add or supersede an ADR whenever a major architectural choice changes. Deployment to a documentation host is intentionally provider-neutral at Milestone 0; `mkdocs.yml` is the publishing configuration foundation.
