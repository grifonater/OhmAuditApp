# Security

Cross-tenant disclosure is critical severity. Controls include verified JWTs, server-side membership/capability/entitlement checks, MFA policy foundations, scoped hashed guest tokens, private R2 media, signed short-lived access, input/file limits, rate limits, signature-verified webhooks, encrypted provider secrets, and append-only audit events.

Logs carry correlation IDs and safe tenant/actor context but never tokens or secret keys. Remote charger controls receive elevated authorisation and audit treatment. Threat modelling and tenant-isolation tests begin with Milestone 1 and production hardening occurs in Milestone 13.
