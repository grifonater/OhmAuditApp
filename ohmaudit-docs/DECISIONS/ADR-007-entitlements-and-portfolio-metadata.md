# ADR-007 — Authoritative entitlements and metadata-first portfolio records

## Status

Accepted, 2026-08-13.

## Decision

Store one entitlement per Organisation and specialist module. Evaluate trial expiry and module capabilities through a central backend `EntitlementService`; frontend checks remain presentational only. Keep Stripe behind `BillingProvider`, and let verified billing events update local entitlement state.

Represent Customer, Site, Asset, Contact, Tag, Document, and Media metadata in PostgreSQL with `organisation_id` on every tenant-owned row. Preserve operational history through lifecycle states. Binary media remains private in R2 and is never embedded in relational records.

## Consequences

Trial use needs no Stripe account. Subscription state remains reproducible even when Stripe is unavailable. Every portfolio query must include Organisation scope, and cross-tenant misses return the same not-found response. R2 upload completion will build on the pending-media records when deployed storage credentials are configured.
