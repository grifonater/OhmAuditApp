# Architecture

The API is a modular monolith containing authoritative domain rules. Specialised Cloudflare Workers handle scheduling, notifications, PDF rendering, AI, and integrations. PostgreSQL is authoritative business storage; R2 holds binaries; Queues carry asynchronous work.

## Repository rule

Every top-level project builds and deploys independently. Shared wire contracts come from the versioned `@ohmaudit/contracts` package, not filesystem imports. Workers own processing mechanics, while the API and PostgreSQL own domain truth.

## Naming

Use British product terminology: `Organisation`, `Customer`, `Site`, `Asset`, `InventoryItem`, `Visit`, `Inspection`, and `GuestEngineer`. TypeScript uses camelCase IDs such as `organisationId`; PostgreSQL uses snake_case such as `organisation_id`; REST resources use lower-case plural kebab-case; capabilities use dotted lower-case identifiers.

Domain event names are past-tense PascalCase. Queue envelopes always include message ID, schema version, event type, occurred timestamp, correlation ID, and payload.
