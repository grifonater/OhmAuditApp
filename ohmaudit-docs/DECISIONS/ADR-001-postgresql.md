# ADR-001: PostgreSQL as authoritative business database

- Status: Accepted
- Date: 2026-08-13

## Context

Ohm Audit needs a durable decision for postgresql as authoritative business database.

## Decision

Use Supabase PostgreSQL with Prisma migrations. Angular has no direct business-data access. Hyperdrive connects trusted Workers to PostgreSQL.

## Consequences

Relational integrity, JSONB snapshots, search, and mature migration tooling fit the domain; operations must manage connection and migration compatibility.
