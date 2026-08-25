# ADR-003: Central module entitlements

- Status: Accepted
- Date: 2026-08-13

## Context

Ohm Audit needs a durable decision for central module entitlements.

## Decision

Resolve per-Organisation module access through one EntitlementService using capability identifiers. Backend checks are authoritative.

## Consequences

Billing/provider details remain outside domain consumers, and specialist modules are removable. Entitlement caching must preserve timely revocation.
