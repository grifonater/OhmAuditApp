# Contributing to OhmAudit

## Development workflow

1. Use Node.js 24 and pnpm 11.
2. Create a short-lived branch from `main`.
3. Keep changes scoped and include tests for altered behaviour.
4. Run `pnpm verify` from the workspace root before merging.
5. Update the relevant documentation when changing configuration, permissions, modules, data models, or deployment behaviour.

## Security and tenant isolation

- Never commit `.env`, `.dev.vars`, access tokens, passwords, private keys, production data, or exported customer files.
- Keep tenant ownership explicit using `organisationId` in TypeScript and `organisation_id` in persistence.
- Enforce permissions and module entitlements in the API, not only in the interface.
- Avoid logging authentication tokens, personal data, database connection strings, or uploaded document contents.
- Treat database migrations and permission changes as security-sensitive changes requiring review.

## Commit and review guidance

Use clear, outcome-focused commit messages. Pull requests should explain the user-facing change, testing performed, database or configuration impact, and any deployment steps. Do not mix generated build output with source changes.

See [DEVELOPMENT.md](DEVELOPMENT.md) for local commands and [PUBLISHING.md](PUBLISHING.md) for release guidance.
