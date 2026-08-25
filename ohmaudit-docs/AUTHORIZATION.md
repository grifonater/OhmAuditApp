# Authorization

Supabase Auth answers who the person is. Ohm Audit membership, roles, capabilities, entitlements, and MFA policy answer what they may do in an Organisation.

Roles are capability bundles, not controller conditionals. API checks are authoritative; frontend checks only shape UX. Module access flows through a central EntitlementService. Guest tokens are hashed, expiring, revocable, and scoped to an assigned Visit or task set.

Milestone 1 implements six Organisation role bundles, a separately stored Platform Admin role, and Supabase `aal` enforcement. Where an Organisation requires MFA for privileged roles, owner/administrator API operations require `aal2`. Cross-tenant lookups return a non-disclosing not-found response.
