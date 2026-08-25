# @ohmaudit/contracts

The versioned source of truth for payloads crossing Ohm Audit repository or deployment boundaries.

## Contents

- Zod runtime schemas and inferred TypeScript types
- module and capability identifiers
- event and queue envelopes
- shared lifecycle enums and structured API errors
- the platform OpenAPI source document

## Development

Requires Node 24 and pnpm 11.

```bash
pnpm install
pnpm dev
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

`pnpm deploy` publishes the package after registry authentication and version review. Producers must populate envelope metadata; consumers must parse before processing. Breaking schema changes require a new schema version and a package major version.
