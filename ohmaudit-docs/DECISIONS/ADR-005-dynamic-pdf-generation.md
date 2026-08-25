# ADR-005: Dynamic versioned PDF generation

- Status: Accepted
- Date: 2026-08-13

## Context

Ohm Audit needs a durable decision for dynamic versioned pdf generation.

## Decision

Keep structured revisions and template/branding snapshots authoritative. Render HTML/CSS synchronously through Browser Rendering; caching is optional.

## Consequences

Historical reports are reproducible without treating opaque files as domain truth. Template retention and rendering availability become operational responsibilities.
