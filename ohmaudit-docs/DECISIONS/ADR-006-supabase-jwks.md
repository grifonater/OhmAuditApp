# ADR-006: Supabase JWKS token verification

- Status: Accepted
- Date: 2026-08-13

## Context

The Cloudflare API must authenticate Supabase sessions without treating Supabase user metadata as application authority or placing a remote Auth request on every API call.

## Decision

Use Supabase asymmetric signing keys and verify bearer access tokens against the project JWKS with `jose`. Validate issuer, audience, expiration, algorithm, subject, and identity claims. Use only the verified subject to locate Ohm Audit’s internal User. Organisation membership, Platform Admin status, capabilities, and MFA policy remain in Ohm Audit PostgreSQL.

## Consequences

Normal authentication is locally verifiable with cached public keys and key rotation support. Projects still using legacy HS256 signing must rotate to asymmetric keys before this API configuration is used. Authorization changes do not require changing Supabase metadata.
