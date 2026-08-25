# ADR-002: Cloudflare Workers deployment platform

- Status: Accepted
- Date: 2026-08-13

## Context

Ohm Audit needs a durable decision for cloudflare workers deployment platform.

## Decision

Deploy the API and specialised processing boundaries on Cloudflare Workers, with Queues, Cron Triggers, R2, and Browser Rendering.

## Consequences

Services remain independently deployable while sharing platform primitives. Worker runtime constraints must be tested continuously.
