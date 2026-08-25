# Multi-tenancy

Every tenant-owned table carries `organisation_id`. Each request derives the active Organisation from authenticated identity plus verified membership; a frontend-provided ID is never sufficient authority.

Repository queries must accept tenant context and include it in predicates. Unique constraints for tenant data normally include `organisation_id`. Background messages include tenant context, and consumers re-establish authority before mutation. Platform-operator access is separate and audited.

Automated Milestone 1 tests create Organisations A and B with different authenticated subjects and prove that B receives a non-disclosing `ORGANISATION_NOT_FOUND` response when requesting A’s members.
