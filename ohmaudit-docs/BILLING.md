# Billing

Subscriptions are per Organisation, per Module. Every Organisation receives Core; a new Organisation receives one 30-day trial per current specialist module unless a platform operator explicitly overrides it.

Stripe Billing is the initial BillingProvider implementation, not embedded domain logic. Signed, idempotent billing webhooks update Ohm Audit’s entitlement state. A browser response from Stripe never proves entitlement.

The module catalogue currently contains EV Charging, Emergency Lighting, and Solar PV. Organisation creation starts one authoritative 30-day entitlement record for each module. `EntitlementService` calculates expiry server-side and is the only domain entry point for module capability decisions.

The Stripe adapter is intentionally dormant until secret keys, webhook signing secret, and per-module price IDs are configured. This does not affect trial use. Billing customer and idempotent webhook-event tables are ready for live activation without changing entitlement consumers.
