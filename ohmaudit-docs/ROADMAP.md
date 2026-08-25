# Roadmap

## Milestone status

- [x] Milestone 0: independent repository scaffolds, executable contracts, docs/ADRs, strict TypeScript, formatting, linting, tests, build and deployment foundations
- [x] Milestone 1: Supabase identity, internal users, Organisations, memberships, roles/capabilities, current Organisation context, MFA foundations, platform-admin distinction, and tenant-isolation tests
- [x] Milestone 2: 30-day module trials, central entitlements, billing abstraction, resumable onboarding, branding/logo upload, accreditations, expiring invitation acceptance, and getting-started checklist
- [x] Milestone 3: tenant-scoped Customers, Sites, Contacts, Assets, lifecycle, model library, protected R2 photos, document metadata, GPS, tags, search, timelines, and portfolio UI
- [x] Milestone 4: recurring schedule rules, five-year occurrence horizon, calendar, idempotent reminder events, Organisation preferences, Scheduler Worker, and notification provider boundary
- [x] Milestone 5: Visits, permanent and guest engineer assignment, expiring hashed guest links, downloadable IndexedDB visit packs, drafts, offline photos, idempotent outbox, reconnect sync, and conflict-ready proposed changes
- [x] Milestone 6: generic inspection lifecycle, immutable revisions, validation results, defects, typed signatures, effective dates, review/approval, versioned document snapshots, synchronous PDF Worker, and branded certificate records
- [x] Milestone 7: EV charger digital twin, independent/shared supplies, connector mapping, reusable stable details, mobile numerical test workflow, photos, defects, validation warnings, engineer guidance, and EV certificate issuance
- [ ] Milestones 8–13: AI/media intelligence, additional specialist modules, integrations, imports, and production hardening

## Decisions intentionally deferred

- Email, SMS, maps, and semantic-search providers: select only when their milestone requires them.
- Exact inspection validation thresholds and report wording: require approved regulatory/product input; the system will support versioned rules without inventing values.
- PDF rendering now uses the dedicated Worker synchronously. Browser Rendering can replace the compact standards-compliant PDF renderer later without changing the inspection/document contract.
- Tap Electric command availability: determine from the Organisation’s granted API capabilities in Milestone 11.
