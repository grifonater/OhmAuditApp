# Domain model

Organisation is the tenant boundary. A User may join multiple Organisations through Organisation Memberships. Organisations own Customers; Customers own Sites; Sites aggregate Assets, Visits, Inspections, Defects, Schedules, Documents, and Contacts.

A Visit represents physical attendance and contains one or more module-specific Inspection Tasks. Assets carry generic identity and lifecycle fields; specialist extension tables carry EV, emergency-lighting, or solar details. High-volume Inventory Items may sit beneath a parent Asset.

Submitted Inspection Revisions are immutable snapshots. Documents reference a revision, template version, branding snapshot, and customer/site snapshot. Proposed Asset Changes prevent field discoveries from silently overwriting canonical data.

Milestone 3 implements the operational core. Customers and Sites have archival lifecycle states rather than destructive deletion. Assets support proposed, active, inactive, removed, decommissioned, and replaced states, with optional replacement links. Stable manufacturer/model combinations create global draft Asset Models for later platform review.

Contacts may relate to a Customer or Site. Media and Documents are metadata-first records related by entity type and ID, with protected binary content reserved for R2. Organisation tags use a polymorphic join. User-facing timelines are derived from tenant-scoped append-only audit events.
