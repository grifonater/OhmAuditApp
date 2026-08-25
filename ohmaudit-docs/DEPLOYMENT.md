# Deployment

Environments are local, development, staging, and production. Each repository has its own CI and deployment configuration. Configuration is injected through environment variables or Cloudflare bindings; secrets use provider secret stores.

Promotions run formatting, lint, strict type checking, tests, and builds. Prisma migrations are reviewed and applied by a trusted API pipeline before compatible code. Infrastructure uses reviewed Terraform plans with remote encrypted state and locking. Rollback procedures must respect forward-only database compatibility.
