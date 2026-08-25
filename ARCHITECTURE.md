# Architecture overview

Ohm Audit uses a modular monolith for authoritative domain logic, surrounded by specialised Cloudflare Workers. PostgreSQL is the business source of truth; R2 stores binary media; Queues carry versioned asynchronous messages; Cron Triggers wake the scheduler; Browser Rendering produces PDFs. Angular never accesses PostgreSQL directly.

```text
Angular PWA -> API Worker -> Hyperdrive -> Supabase PostgreSQL
                  |  |  \
                  |  |   -> R2 private media
                  |  -> PDF Worker -> Browser Rendering
                  -> Queues -> Scheduler / Notifications / AI / Integrations
```

The Organisation is the tenant boundary. Authentication establishes identity; API-side membership, capability, and entitlement checks establish authority. Frontend checks improve UX but never grant access.

All cross-repository payloads are versioned in `@ohmaudit/contracts`. Workers are deployment boundaries, not alternate owners of domain truth. Detailed decisions live in `ohmaudit-docs`.
