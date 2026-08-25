# ADR-004: IndexedDB outbox and idempotent sync

- Status: Accepted
- Date: 2026-08-13

## Context

Ohm Audit needs a durable decision for indexeddb outbox and idempotent sync.

## Decision

Store downloaded Visit Packs, drafts, pending media, and uniquely identified mutations in IndexedDB. Replays are idempotent; important conflicts require review.

## Consequences

Field work survives lost signal without silent overwrites. The sync protocol and storage migration strategy require rigorous Milestone 5 tests.
