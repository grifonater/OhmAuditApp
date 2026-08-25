# Ohm Audit — Master Product, Architecture and Build Specification

## 1. Purpose of this specification

Build a production-quality, multi-tenant SaaS platform named **Ohm Audit**.

Ohm Audit is an asset management, inspection, compliance and facilities-maintenance platform primarily designed for electrical contractors.

The platform must initially provide strong specialist modules for:

- EV charger inspection and servicing
- Emergency lighting inspection and testing
- Solar PV inspection and servicing

The architecture must allow future modules to be added without restructuring the core application.

Possible future modules include:

- Battery storage
- Fixed wiring inspections
- Fire alarm servicing
- HVAC
- Heat pumps
- General electrical maintenance
- Planned preventative maintenance
- Reactive facilities maintenance
- Other specialist compliance disciplines

Ohm Audit is **not an accounting, quoting or invoicing system for the contractor's customers**.

Do not build quotation functionality, job costing, sales invoicing or accounting into the core platform.

Those systems may eventually integrate through APIs.

The only billing functionality Ohm Audit itself requires is **SaaS subscription billing for organisations using Ohm Audit**.

---

# 2. Product philosophy

Every architectural and UX decision must follow these principles.

## 2.1 Minimum engineer effort

The most important UX principle is:

> Capture the maximum amount of useful, reliable information with the minimum possible engineer effort.

Engineers should not feel that Ohm Audit is another administrative burden.

The system should:

- minimise typing;
- reuse previously known information;
- pre-fill stable asset data;
- provide large touch targets;
- use mobile numeric keyboards where appropriate;
- automatically move to the next logical test field;
- support rapid pass/fail actions;
- provide bulk actions where appropriate;
- use AI to reduce repetitive entry;
- allow photographs to replace tedious transcription where possible;
- work without mobile signal;
- never ask the engineer for information already reliably known;
- make the second inspection of an asset significantly faster than the first.

AI should **assist rather than police**.

Validation should nudge engineers when values appear unusual but should not unnecessarily block work.

## 2.2 Powerful administration

The office/administrator experience should answer:

> What needs my attention today?

Administrators need extremely fast access to:

- customers;
- sites;
- assets;
- visits;
- inspections;
- upcoming servicing;
- overdue servicing;
- faults;
- inspections awaiting review;
- missing data;
- certificates;
- documents;
- engineer activity;
- asset history.

The platform must be appropriate for organisations managing hundreds of customers, hundreds of sites and many thousands of assets.

## 2.3 Assets become more useful over time

Every inspection should improve the asset register.

The long-term objective is that after an asset has been inspected once or twice, subsequent inspections mostly require entering **new measured results**, rather than re-entering stable information.

## 2.4 Capture once, reuse everywhere

Customer, site, asset, engineer and organisation information should never be repeatedly copied manually between forms.

Reports and certificates should pull data automatically from authoritative records and immutable inspection snapshots.

## 2.5 History must never silently disappear

Do not hard-delete operational entities such as:

- customers;
- sites;
- assets;
- inspections;
- engineers;
- certificates;
- defects.

Use lifecycle states, archival and decommissioning instead.

Historical reports must remain reproducible.

## 2.6 Modular without feeling fragmented

Ohm Audit should feel like one platform.

Individual inspection modules may have dramatically different workflows, but they must share:

- organisations;
- users;
- permissions;
- customers;
- sites;
- contacts;
- visits;
- asset foundations;
- media;
- documents;
- scheduling;
- notifications;
- audit history;
- search;
- reporting infrastructure;
- integrations.

---

# 3. Terminology

Use these terms consistently throughout the codebase and UI.

## Platform

**Ohm Audit**

The SaaS product itself.

## Platform operator

The company operating Ohm Audit.

Platform operators have access to the Super Admin interface.

## Organisation

A contracting company subscribing to Ohm Audit.

Examples could be:

- an electrical contractor;
- a solar maintenance contractor;
- a facilities management contractor.

An Organisation is the primary tenant boundary.

## Organisation User

A permanent authenticated user belonging to an Organisation.

A user may potentially belong to more than one Organisation.

## Client / Customer

A customer belonging to an Organisation.

For example, a national retailer serviced by an electrical contractor.

## Site

A physical customer location.

A Customer may have one site or hundreds of sites.

## Asset

A physical item or managed system.

Examples:

- EV charger;
- inverter;
- emergency lighting system;
- battery system.

## Inventory Item

A lighter-weight high-volume item managed underneath an asset/system.

Example:

- 500 emergency-light fittings underneath one Emergency Lighting System.

## Module

A specialist Ohm Audit capability.

Examples:

- EV Charging;
- Emergency Lighting;
- Solar PV.

## Visit

A physical attendance at a site.

A Visit may contain one or several Inspection Tasks.

Example:

Visit:
- EV inspection
- Emergency lighting inspection

These remain separate inspections even though performed during one attendance.

## Inspection

A module-specific inspection activity.

## Guest Engineer

An engineer who does not require a permanent Ohm Audit account.

They access a Visit or Inspection using a secure temporary link.

---

# 4. Subscription model

Subscriptions are **per Organisation, per Module**.

This is fundamental.

Do not design subscriptions around individual users.

## 4.1 Ohm Audit Core

Every subscribing Organisation receives the core platform.

Core should include:

- Organisation management;
- user management;
- role and permissions management;
- Customers;
- Sites;
- basic Contacts;
- base Asset Register;
- general asset photographs;
- document storage;
- GPS/location support;
- global search;
- basic dashboards;
- scheduling infrastructure;
- reminder infrastructure;
- audit history;
- Organisation branding;
- site information;
- base exports;
- platform notifications.

The core provides useful asset management by itself.

## 4.2 Specialist modules

Specialist modules perform the heavy lifting.

Examples:

### EV Charging Module

Adds:

- EV charger asset extensions;
- supplies;
- connectors;
- EV inspections;
- EV tests;
- EV validation;
- EV certificates;
- charger model library;
- CPMS integrations such as Tap Electric.

### Emergency Lighting Module

Adds:

- lighting systems;
- buildings/floors/rooms/zones;
- key switches;
- fittings;
- functional tests;
- duration tests;
- bulk pass/fail;
- emergency-light reports.

### Solar PV Module

Adds:

- solar systems;
- arrays;
- inverters;
- MPPTs;
- strings;
- topology visualisation;
- solar inspection workflows;
- solar test results;
- future TruTest import.

## 4.3 Entitlement system

Create a central service:

`EntitlementService`

Never scatter code such as:

`if (organisation.hasSolarSubscription)`

throughout the application.

All access should use capability checks such as:

`entitlements.can(organisationId, "solar.inspections.create")`

or equivalent.

Both API and frontend must check entitlements.

Frontend entitlement checks are UX only.

Backend checks are authoritative.

## 4.4 Free trial

When an Organisation first signs up:

- create the Organisation;
- activate a 30-day trial;
- provide trial access to all currently available specialist modules;
- display remaining trial days;
- allow subscription selection before trial expiration.

Each Organisation receives a trial once per module unless explicitly overridden by a platform administrator.

## 4.5 Billing provider

Implement billing through a provider abstraction.

Initial implementation:

**Stripe Billing**

Create an interface so Stripe is not embedded throughout domain logic.

Example concept:

`BillingProvider`

Responsibilities:

- create billing customer;
- create subscription;
- update subscription;
- add/remove module;
- cancel;
- resume;
- fetch billing status;
- handle billing webhook;
- manage payment method;
- retrieve hosted billing portal link.

Billing events must ultimately update Ohm Audit's own entitlement state.

Never rely on a frontend Stripe response as proof of entitlement.

---

# 5. Required workspace/repository structure

The coding agent will receive an empty root folder.

Create all projects underneath this folder.

Every application/worker/project must live in its **own top-level subfolder**.

Each folder must be capable of becoming an independent GitHub repository.

Do not create one enormous application repository containing everything under `src/apps`.

Use approximately:

```text
ohm-audit/
│
├── README.md
├── DEVELOPMENT.md
├── ARCHITECTURE.md
│
├── ohmaudit-web/
├── ohmaudit-api/
├── ohmaudit-contracts/
├── ohmaudit-worker-scheduler/
├── ohmaudit-worker-notifications/
├── ohmaudit-worker-pdf/
├── ohmaudit-worker-ai/
├── ohmaudit-worker-integrations/
├── ohmaudit-infra/
└── ohmaudit-docs/
```

Each deployable project must contain its own:

```text
README.md
package.json
tsconfig.json
.env.example
.gitignore
tests/
CI configuration
deployment configuration
```

where applicable.

Do not require the parent directory to exist for an individual project to build.

Each project should eventually be capable of:

```bash
git init
git remote add origin ...
git push
```

and operating independently.

The root directory may contain convenience development scripts, but individual projects must not depend on hidden parent-level configuration.

---

# 6. Technology stack

Use TypeScript throughout unless a very strong reason exists otherwise.

## Frontend

Use:

- Angular 22
- standalone Angular components;
- Angular Signals;
- modern Angular control flow;
- Angular Router;
- Angular Material/CDK where appropriate;
- responsive design system;
- PWA/service worker support;
- IndexedDB for offline data;
- preferably Dexie or a similarly small IndexedDB abstraction;
- strict TypeScript.

Do not use React or Next.js.

## Frontend deployment

Deploy the Angular SPA using Cloudflare Workers Static Assets.

The frontend should be a proper installable PWA.

## Backend API

Use:

- Cloudflare Workers;
- Hono;
- TypeScript;
- OpenAPI;
- Zod or equivalent schema validation;
- structured request validation;
- API versioning.

Example:

`/api/v1/...`

## Primary database

Use:

**Supabase PostgreSQL**

PostgreSQL is the authoritative business database.

## Database access

Use:

- Prisma ORM;
- Prisma migrations;
- Cloudflare Hyperdrive between Workers and PostgreSQL.

Only trusted backend services may access the database.

Angular must never connect directly to PostgreSQL for application business data.

## Authentication

Use:

**Supabase Auth**

However:

> Authentication and Ohm Audit permissions must remain separate systems.

Supabase answers:

> Who is this person?

Ohm Audit PostgreSQL answers:

> Which Organisation do they belong to and what are they allowed to do?

Never make Supabase user metadata the authoritative source of application permissions.

Maintain an internal `users` record linked to the external auth subject.

## MFA

Support MFA for permanent users.

Allow Organisation-level policies requiring MFA for privileged roles.

## Object storage

Use:

**Cloudflare R2**

Store:

- photographs;
- signatures;
- customer logos;
- contractor logos;
- stock model images;
- method statements;
- manuals;
- RAMS;
- imported raw data;
- attachment files.

Metadata belongs in PostgreSQL.

Binary files belong in R2.

## Background messaging

Use:

**Cloudflare Queues**

for asynchronous operations such as:

- notifications;
- bulk jobs;
- AI analysis which does not need an immediate result;
- webhook processing retries;
- search indexing;
- import processing.

## Scheduled processing

Use:

**Cloudflare Cron Triggers**

with a dedicated Scheduler Worker.

The scheduler should normally run hourly.

## PDF generation

Use:

**Cloudflare Browser Run**

Render HTML/CSS to PDF.

Interactive document generation should normally be synchronous:

```text
Angular
   ↓
API
   ↓
Document Snapshot
   ↓
PDF Worker
   ↓
HTML template
   ↓
Browser Run
   ↓
PDF response
```

Do not queue normal interactive PDF generation.

Bulk PDF generation may use a queue.

## AI

Create a provider-agnostic:

`AIService`

Initial implementation should support Cloudflare Workers AI.

Vision use cases include:

- charger data plates;
- inverter data plates;
- emergency-light fitting labels;
- manufacturer;
- model;
- serial number;
- ratings;
- other structured plate information.

Never silently write AI-extracted data into authoritative records.

AI results must be confirmed by a human where used to modify asset data.

## Semantic search

PostgreSQL remains the primary search source.

Use:

- exact matching;
- trigram matching;
- full-text search;

for normal operational search.

Cloudflare Vectorize is optional for future:

- semantic document search;
- similar faults;
- related inspections;
- natural-language knowledge search.

Do not require Vectorize to perform simple customer/site/serial-number searches.

---

# 7. Core backend architecture

Prefer a **modular monolith for domain logic**, with specialised Workers around it.

Do not immediately split every business domain into microservices.

`ohmaudit-api` should own most domain logic.

Suggested API domain modules:

```text
src/
├── auth/
├── organisations/
├── entitlements/
├── billing/
├── users/
├── customers/
├── sites/
├── contacts/
├── assets/
├── visits/
├── inspections/
├── defects/
├── schedules/
├── documents/
├── media/
├── reports/
├── notifications/
├── integrations/
├── search/
├── audit/
│
├── modules/
│   ├── ev/
│   ├── emergency-lighting/
│   └── solar/
│
└── shared/
```

Domain modules should depend on shared core infrastructure, but specialist modules must not become tightly coupled to each other.

Solar must not import emergency-lighting business logic.

EV must not know how solar strings work.

---

# 8. Contracts project

Create:

`ohmaudit-contracts`

This is responsible for contracts shared across repositories.

Include:

- OpenAPI schema;
- generated API types;
- event schemas;
- queue message schemas;
- webhook internal schemas;
- module capability identifiers;
- shared enum contracts.

Expose them as a versioned package such as:

`@ohmaudit/contracts`

Avoid undocumented message payloads between Workers.

Every queue message must have:

- message ID;
- schema version;
- event type;
- occurred timestamp;
- correlation ID;
- payload.

---

# 9. Multi-tenancy

Organisation is the primary tenant boundary.

Almost every tenant-owned record must have:

`organisation_id`

Examples:

- Customer
- Site
- Asset
- Visit
- Inspection
- Defect
- Document
- Schedule
- Notification
- Integration

Cross-Organisation data leakage must be considered a critical security failure.

Every API request must establish:

- authenticated user;
- active Organisation;
- membership;
- module entitlement;
- permission.

Never trust an Organisation ID received from the frontend without verifying membership.

Add automated tests proving that users from Organisation A cannot retrieve data belonging to Organisation B.

---

# 10. Users, roles and permissions

A user can belong to one or more Organisations through:

`organisation_memberships`

Initial roles may include:

- Organisation Owner
- Organisation Administrator
- Contract Manager
- Office Administrator
- Engineer
- Read Only

Do not make role names the sole security mechanism.

Implement capabilities.

Examples:

```text
customers.read
customers.manage

sites.read
sites.manage

assets.read
assets.manage

visits.create
visits.assign

inspections.perform
inspections.review
inspections.approve

certificates.generate
certificates.issue

ev.remote-control

billing.manage

organisation.users.manage
```

Roles should map onto capabilities.

The design should eventually permit custom roles.

---

# 11. Guest engineer access

Guest engineers are a first-class workflow.

Do not require every engineer to have an Ohm Audit account.

An administrator must be able to:

1. create a Visit;
2. assign inspection tasks;
3. enter engineer name;
4. optionally enter email/mobile;
5. generate a secure temporary link;
6. send that link by email or SMS.

Default link validity:

**7 days**

but make it configurable.

Guest links must:

- use cryptographically secure random tokens;
- store only a token hash server-side;
- be revocable;
- have an expiration;
- be scoped to one Visit or assigned task set;
- not give general Organisation access;
- not expose unrelated sites;
- not expose unrelated customer assets.

Guest engineer identity fields should be prefilled.

Guest engineers should be able to:

- inspect existing assigned assets;
- record measurements;
- capture photographs;
- record defects;
- add newly discovered assets;
- suggest asset changes;
- suggest asset decommissioning;
- sign inspection;
- submit work.

Changes to canonical asset records should normally become **Proposed Asset Changes** for office review.

---

# 12. Customer and site hierarchy

Primary navigation model:

```text
Organisation
   ↓
Customers
   ↓
Sites
   ↓
Assets / Visits / Inspections / Documents
```

Do not make Modules the primary navigation hierarchy.

Modules enrich a Site.

For example:

```text
Greggs
 ├── Manchester Site
 │    ├── EV Charging
 │    ├── Emergency Lighting
 │    └── Solar PV
 │
 └── Leeds Site
      ├── EV Charging
      └── Emergency Lighting
```

The Customer page should provide portfolio rollups.

Examples:

- number of sites;
- active assets;
- compliance status;
- servicing due in 30 days;
- overdue items;
- open defects;
- recent inspections;
- upcoming visits.

---

# 13. Site page

The Site is one of the most important records in Ohm Audit.

Site page sections should include:

- Overview
- Assets
- Visits
- Inspections
- Schedule
- Defects
- Documents
- Contacts
- Site Information
- Map
- Timeline

Assets should be grouped/filterable by module.

Support list views rather than rendering hundreds of large cards.

Provide:

- searching;
- sorting;
- filtering;
- saved views;
- pagination/virtual scrolling;
- status indicators;
- bulk actions.

The UI must remain practical with:

- 50+ EV chargers;
- 500+ emergency light fittings;
- many solar components.

---

# 14. Asset architecture

Treat important assets as **digital twins**.

Base `assets` table should contain generic information.

Example:

```text
id
organisation_id
customer_id
site_id
asset_type
asset_reference
display_name
manufacturer
model
serial_number
status
commissioned_at
decommissioned_at
replacement_asset_id
latitude
longitude
location_accuracy
notes
created_at
updated_at
```

Module-specific data belongs in module extension tables.

Never put 100 EV-specific nullable columns into the generic Asset table.

---

# 15. Asset lifecycle

Assets must support lifecycle states such as:

- proposed;
- active;
- inactive;
- removed;
- decommissioned;
- replaced.

Never delete an asset merely because it has been removed physically.

Historical inspections and certificates must continue referencing it.

Allow:

`replacement_asset_id`

to show that an old asset was replaced by another.

---

# 16. Proposed asset changes

Field engineers should improve the asset register.

During inspection they may discover:

- different serial number;
- missing model;
- incorrect manufacturer;
- incorrect circuit information;
- new charger;
- missing light fitting;
- removed device;
- changed configuration.

Do not silently overwrite canonical asset records.

Create:

`proposed_asset_changes`

with:

- originating inspection;
- engineer;
- old value;
- proposed value;
- reason;
- photos/evidence;
- status;
- reviewed by;
- reviewed timestamp.

Admin actions:

- Accept
- Reject
- Modify and Accept
- Merge with existing asset

A newly discovered asset may exist provisionally during the inspection before approval.

---

# 17. Asset model library

Create a global equipment model library.

Examples:

- EV charger manufacturers/models;
- solar inverter manufacturers/models;
- emergency fitting manufacturers/models.

An Asset can reference:

`asset_model_id`

Model records may contain:

- manufacturer;
- model;
- category;
- stock image;
- technical notes;
- manuals;
- expected characteristics;
- known metadata.

For EV chargers in particular, certificates may show:

- stock manufacturer image;
- actual site photograph.

If no stock image exists:

use a generic appropriate placeholder.

---

# 18. Super Admin model queue

Platform Super Admin should show:

**Equipment models missing stock images**

When AI or an engineer encounters a new manufacturer/model combination:

create or suggest a draft model-library entry.

Super Admin can:

- review;
- upload stock image;
- add technical documentation;
- publish model.

Once published, linked assets automatically gain access to that model image.

Do not require database editing.

---

# 19. Custom fields

Organisations may need data Ohm Audit does not collect generically.

Support typed custom field definitions.

Custom fields may be scoped to:

- Organisation;
- Customer;
- module;
- inspection template.

Types:

- text;
- multiline text;
- number;
- date;
- boolean;
- dropdown;
- multi-select.

Custom fields must participate in:

- engineer forms;
- validation;
- inspection snapshots;
- PDF templates where configured.

Avoid an unbounded fragile EAV architecture.

Prefer typed definitions plus JSONB values/snapshots.

---

# 20. Visits

A Visit represents one physical attendance.

Example:

```text
Visit: Manchester Depot - 14 August

Tasks:
1. EV charger inspection
2. Emergency lighting functional test
```

The engineer should not be forced to think about modules.

Their screen simply shows:

**Today's Visit**

and tasks underneath.

Each inspection remains separately structured.

A Visit may contain one or many Inspection Tasks.

---

# 21. Visit packs / offline mode

Offline use is a **core requirement**, not future enhancement.

Before travelling, an engineer must be able to press:

**Download Visit**

This creates a local Visit Pack containing required information.

Include where relevant:

- Customer;
- Site;
- contacts;
- site access notes;
- assigned assets;
- relevant asset photographs;
- previous inspection summary;
- module inspection templates;
- inspection guidance;
- asset technical data;
- selected manuals;
- existing GPS coordinates.

The engineer should then be able to enter aircraft mode and continue working.

---

# 22. Offline technical architecture

Use IndexedDB for durable local data.

Maintain:

- local Visit Pack;
- local draft inspection;
- pending media;
- mutation outbox;
- sync state;
- version metadata.

Every local mutation should have a unique client mutation ID.

Synchronisation must be idempotent.

The UI should display a subtle state indicator such as:

- Saved on device
- Syncing
- Synced
- 3 items awaiting connection
- Conflict requires review

Never show alarming connectivity errors if the system is operating correctly offline.

## Conflict handling

Do not use silent last-write-wins for important data.

Where canonical asset data differs:

create a conflict or Proposed Asset Change.

Inspection records should be scoped strongly enough that one engineer is normally the primary writer.

Submitted revisions are immutable.

---

# 23. Engineer mobile UX

Design mobile-first.

Support:

- phones;
- small phones;
- tablets;
- iPads;
- desktop.

Engineer workflow should favour:

- one-handed interaction where possible;
- large buttons;
- high contrast;
- minimal modal dialogs;
- sticky action area;
- obvious progress;
- numeric keyboard for measurements;
- Next button;
- auto-focus next test;
- auto-advance where safe;
- quick pass/fail;
- bulk pass with exceptions.

Avoid giant desktop forms shrunk onto a mobile screen.

Use guided cards/steps.

---

# 24. Inspection lifecycle

Suggested lifecycle:

```text
Scheduled
   ↓
Ready
   ↓
In Progress
   ↓
Submitted
   ↓
Awaiting Review
   ↓
Approved
   ↓
Issued
   ↓
Closed
```

Also support:

- Returned for Changes
- Cancelled

Do not tightly couple certificate creation to only one final state.

Allow document preview during earlier states.

Official document issuance must reference an immutable inspection revision.

---

# 25. Inspection revisions

While an inspection is a draft:

working data may be edited.

When submitted:

create an immutable `inspection_revision` snapshot.

If changed later:

create Revision 2.

Do not mutate Revision 1.

Each revision records:

- snapshot;
- revision number;
- who created it;
- reason;
- created timestamp;
- effective inspection date.

---

# 26. Dates and audit dates

Differentiate:

`performed_at`

The date/time the actual inspection occurred.

`entered_at`

When data was entered.

`submitted_at`

When engineer submitted it.

`approved_at`

When approved.

`issued_at`

When certificate/report was issued.

Administrators may correct effective dates where legitimate.

Never modify the real audit timestamps to disguise when information was entered.

Audit records must retain:

- actual actor;
- actual timestamp;
- previous value;
- new value.

---

# 27. Signatures

Support:

### Drawn signature

Engineer signs directly on phone/tablet.

### Stored engineer signature

A permanent engineer can store a signature for reuse.

### Typed acknowledgement

Office users may apply a typed signing representation where permitted.

Always separately store:

- signatory printed name;
- role;
- signing method;
- effective signing date;
- actual action timestamp;
- user/guest identity.

The signature image itself is not sufficient identity.

---

# 28. Validation system

Inspection tests need configurable validation rules.

Do not hard-code every electrical threshold directly in Angular.

Create a versioned rules layer.

Validation may depend upon:

- inspection type;
- device type;
- protective device;
- RCD type;
- test type;
- module.

When a result appears unusual:

show something similar to:

**Outside expected range — please confirm reading.**

Options:

- Confirm
- Retest/Edit

Do not automatically erase the value.

Historical data may also inform soft warnings.

Example:

> Previous Zs was 0.28 Ω. Current reading is 1.62 Ω. Please verify.

Historical comparison is advisory.

It must never replace proper standards-based validation.

---

# 29. Photographs and media

Photos are first-class records.

A photo should never merely live in a random folder.

Media can belong to:

- Site
- Asset
- Inspection
- Test
- Defect
- Emergency fitting
- Solar component
- Data plate
- General visit

Store metadata in PostgreSQL:

```text
media_id
organisation_id
storage_key
entity_type
entity_id
category
caption
captured_at
captured_by
mime_type
width
height
size
```

Store binary image in R2.

Support multiple images per defect.

---

# 30. Photograph UX

Taking a photograph should be extremely quick.

Ideal mobile flow:

```text
Tap camera button
→ camera opens
→ take photograph
→ automatically attached
→ return immediately to inspection
```

Avoid unnecessary file-management screens.

Site/asset photos should generally be recommended rather than mandatory unless a module explicitly requires one.

---

# 31. AI data-plate extraction

Provide a button:

**Scan Data Plate**

Flow:

```text
Engineer takes photo
   ↓
Upload or queue offline
   ↓
AI vision service
   ↓
Structured candidate fields
   ↓
Engineer review
   ↓
Confirm/Edit
   ↓
Proposed asset update
```

Expected extraction fields may include:

- manufacturer;
- model;
- serial number;
- ratings;
- product identifier;
- other recognised plate data.

Return confidence for fields where supported.

AI must not silently modify the authoritative asset.

If offline:

- save image;
- queue extraction;
- allow manual entry;
- process when connection returns.

If engineer has already submitted before AI processing completes, route the result to office review rather than silently applying it.

---

# 32. Defects

Defects should be linked to the specific relevant entity.

Examples:

- Asset
- Connector
- Emergency fitting
- Solar string

Defect should include:

- description;
- category;
- severity;
- status;
- discovered date;
- discovered by;
- related inspection;
- photographs;
- notes;
- resolution details.

Severity labels should be configurable by module rather than incorrectly hard-coded to one electrical standard.

Defect lifecycle:

```text
Open
→ Acknowledged
→ Remedial Work Required
→ Resolved
→ Verified
```

Keep all historical states.

---

# 33. Scheduling model

Scheduling must be shared infrastructure used by every module.

Do not make the calendar query EV inspections, then solar tables, then emergency-light tables separately.

Create common scheduling entities.

## Schedule rule

Defines recurrence.

Example:

```text
Emergency Lighting Full Duration Test
Every 12 months
Site A
```

or:

```text
EV charger inspection
Every 12 months
Asset EV-023
```

Suggested data:

```text
schedule_rule
id
organisation_id
module
entity_type
entity_id
site_id
frequency
interval
start_date
active
```

## Schedule occurrence

Materialised future occurrence.

Suggested fields:

```text
id
schedule_rule_id
organisation_id
module
site_id
entity_type
entity_id
due_at
status
completed_by_inspection_id
```

Statuses:

- future;
- upcoming;
- due;
- overdue;
- completed;
- skipped;
- superseded.

---

# 34. Long-range calendar

Facilities managers must be able to open a future calendar and see expected inspections years ahead.

Maintain a rolling future occurrence horizon, for example approximately five years.

Do not generate infinite records.

When rules change:

- retain historical occurrences;
- regenerate unaffected future occurrences appropriately.

When an inspection completes:

- mark corresponding occurrence complete;
- link inspection;
- ensure the next recurrence exists.

The calendar reads the shared occurrence table.

It does not need to inspect every specialist module.

---

# 35. Reminder processing

Create:

`ohmaudit-worker-scheduler`

Run it on an hourly Cron Trigger.

Its job is **not** to scan all assets.

It should query the shared Schedule Occurrence records.

Example workflow:

```text
Hourly Cron
   ↓
Find occurrences entering notification windows
   ↓
Create idempotent Notification Events
   ↓
Queue notification jobs
   ↓
Notification Worker
```

Use idempotency so an hourly worker cannot send the same 30-day warning 24 times.

---

# 36. Notification system

Create:

`ohmaudit-worker-notifications`

Support provider abstractions for:

- in-app;
- email;
- SMS.

Organisation preferences may define reminders such as:

- 30 days before;
- 14 days before;
- 7 days before;
- due today;
- overdue;
- inspection submitted;
- inspection returned;
- critical defect;
- guest engineer assignment.

Do not hard-code one notification policy globally.

---

# 37. Administrator dashboard

The primary dashboard should focus on action.

Example sections:

## Needs Attention

- overdue servicing;
- due next 30 days;
- inspections awaiting review;
- unresolved critical defects;
- pending asset changes;
- failed integrations;
- offline work waiting unusually long to sync.

## Upcoming

- visits this week;
- services this month.

## Portfolio

- active Customers;
- Sites;
- assets;
- module coverage;
- compliance percentage.

## Recent Activity

- inspections completed;
- certificates issued;
- asset changes;
- defects created.

Keep visual noise low.

---

# 38. Global search

Provide one global search entry point.

Search:

- Customer name;
- Site;
- postcode;
- asset reference;
- manufacturer;
- model;
- serial number;
- engineer;
- certificate number;
- inspection;
- potentially document title.

Exact operational search must use PostgreSQL.

Eventually use Vectorize for semantic searches such as:

> show inspections involving damaged charging cables

but do not require AI search for simple identifiers.

---

# 39. Tags and saved views

Support Organisation-defined tags.

Possible examples:

- retail;
- NHS;
- warehouse;
- critical;
- priority.

Allow users to save filtered views.

Example:

**My Chargers Due This Month**

or:

**Open Emergency Lighting Faults**

---

# 40. Internal notes

Support internal notes which are explicitly marked:

**Internal — never shown on customer documents**

Examples:

- access instructions;
- gate code notes;
- difficult parking;
- customer-specific operational notes.

---

# 41. Contacts and site information pack

Customers and Sites may have multiple contacts.

Contacts should support roles such as:

- facilities manager;
- site manager;
- security;
- accounts contact;
- engineering contact.

Site Information Pack can include:

- parking;
- access;
- gate instructions;
- opening times;
- PPE requirements;
- induction information;
- internal notes;
- documents.

The Visit Pack may include relevant site information offline.

---

# 42. GPS and maps

GPS location is optional.

Asset may store:

- latitude;
- longitude;
- accuracy;
- captured timestamp;
- source;
- captured by.

Engineer UI should provide:

**Capture Current Location**

If existing location is known:

**Confirm Existing Location**

Also allow manual pin adjustment.

The map implementation should use an abstraction so providers can be changed.

Support satellite imagery where a configured mapping provider offers it.

Never make GPS mandatory for completing an inspection unless an Organisation specifically configures that rule.

---

# 43. Document management

Do not recreate SharePoint folder chaos.

Documents should primarily be found through metadata and relationships.

A document can belong to:

- Organisation;
- Customer;
- Site;
- Asset;
- Visit;
- Inspection;
- model library;
- module.

Possible categories:

- RAMS;
- method statement;
- manual;
- certificate;
- previous report;
- drawing;
- specification;
- commissioning data.

Users should find a document through the thing it relates to rather than remembering a folder hierarchy.

---

# 44. PDF/report architecture

Reports are a first-class platform capability.

Use HTML/CSS templates rendered through the PDF service.

Templates must be versioned.

Never build each PDF with unrelated PDF drawing logic.

Create common:

`DocumentRenderService`

and:

`TemplateRegistry`

---

# 45. Certificate/revision source of truth

The authoritative source is:

1. structured inspection revision;
2. template version;
3. organisation branding snapshot;
4. relevant customer/site snapshot.

PDF files do not need to be permanently stored by default.

Generate them dynamically.

However, architecture must permit optional PDF caching/preservation later without changing the domain model.

Never make a cached PDF the sole source of historical truth.

---

# 46. Document templates

Every issued document references:

`template_version_id`

This allows:

**Reprint using original template**

and optionally:

**Render old data using current template**

These are different operations.

Old template versions must remain available.

---

# 47. Organisation branding

Every Organisation should configure a Brand Profile.

Include:

- logo;
- trading name;
- registered/business name;
- address;
- telephone;
- email;
- website;
- accreditation details;
- registration numbers such as NICEIC/NAPIT where relevant;
- primary brand colour;
- secondary brand colour.

Certificates should use the contractor's branding prominently.

Ohm Audit branding should remain discreet on contractor-facing output.

---

# 48. Customer branding

Allow a Customer logo to be stored.

Customer-facing certificates may optionally include:

- contractor logo;
- customer logo;
- site information.

This helps large customers feel the document is tailored to them.

Do not build a customer self-service portal in the initial platform.

Customers generally receive documents directly from the contractor.

---

# 49. Ohm Audit product branding

Product name:

**Ohm Audit**

Suggested brand feeling:

- precise;
- technical;
- trustworthy;
- modern;
- calm;
- professional.

Avoid generic electrical clichés dominating the design.

Suggested visual direction:

- deep navy;
- electric teal accent;
- neutral grey;
- generous white space;
- modern typography.

Colour should have semantic meaning.

Engineer forms should not be visually noisy.

Status colours must be accessible and supported by icon/text, not colour alone.

---

# 50. Dynamic operational PDFs

Administrators should be able to instantly generate non-certificate PDFs.

Examples:

- Asset Register
- Site Asset List
- Compliance Summary
- Upcoming Service Report
- Defect Report
- Customer Portfolio Report
- Maintenance Report

These are generated dynamically.

Allow filters before generating.

Example:

```text
Customer: Greggs
Site: All
Module: EV Charging
Status: Due within 60 days
Sort: Due date
```

---

# 51. EV Charging module

The EV module must be production-quality enough to demonstrate the overall platform architecture.

---

# 52. EV charger asset model

An EV charge point is one asset.

Do **not** create separate certificates for every connector.

A charger can contain:

- 1–4+ connectors;
- one or multiple supplies.

Create entities:

```text
ev_charge_point
ev_supply
ev_connector
ev_connector_supply_mapping
```

This allows:

```text
Charger
├── Supply 1
│    ├── Connector 1
│    └── Connector 2
```

or:

```text
Charger
├── Supply 1 → Connector 1
└── Supply 2 → Connector 2
```

---

# 53. EV stable asset information

Where known, store stable characteristics against the asset rather than requiring them every inspection.

Examples:

- manufacturer;
- model;
- serial number;
- charger reference;
- number of connectors;
- number of supplies;
- connector labels;
- supply mappings;
- cable type/size;
- circuit reference;
- fed from;
- breaker/protective-device information;
- protection type;
- other stable design details.

Inspection begins by allowing the engineer to confirm these remain correct.

Only ask for changes where necessary.

---

# 54. EV inspection flow

Prefer:

```text
1. Confirm Charger
2. Confirm / Capture Asset Details
3. Supply Details
4. Connector 1
5. Connector 2
6. Additional Connectors
7. Visual Inspection
8. Defects / Photos
9. Review
10. Sign & Submit
```

Supply information should generally be completed before connector tests.

---

# 55. EV supply tests

Initial EV schema should accommodate values including:

- source/distribution board;
- circuit reference;
- phase;
- cable size;
- protective-device information;
- RCD/protective arrangement;
- Zs;
- relevant measured supply characteristics.

Do not assume every charger has the same protection arrangement.

Validation rules must depend upon the selected device/configuration.

---

# 56. EV connector testing

Support connector-level tests including the test sequence discussed during product design.

The initial data structure must support:

- PE/earth fault simulation result;
- CP/control-pilot related checks;
- vehicle states/modes such as A/B/C where applicable;
- Zs;
- RCD testing;
- one-times tests;
- five-times tests;
- 0° / 180° measurements;
- ramp tests;
- other connector-level measurements.

Do not hard-code unverified limits in this initial scaffold.

Build a versioned validation-rule system so the correct limits can be populated and maintained based on applicable standards and protection type.

---

# 57. EV RCD/protection configuration

Engineer must specify/confirm the relevant protective arrangement so validation knows which rule set applies.

Support extensible protection types rather than one boolean.

Validation should select its rule set based on this configuration.

---

# 58. EV fast-entry UX

Numerical test entry must be exceptionally fast.

Requirements:

- correct mobile numeric keypad;
- Next key advances;
- autofocus next measurement;
- no repeated tapping between every number;
- group measurements into logical cards;
- completed card visibly collapses/finishes;
- large pass/fail controls;
- preserve keyboard where practical.

The common test sequence should be completable primarily by:

**type → Next → type → Next → type → Next**

---

# 59. EV smart prefill

Use stable Asset information.

Where useful, offer suggestions based on other chargers at the Site.

Never copy measured results.

Possible suggestions:

- cable type;
- protective-device type;
- protective-device rating;
- charger model configuration.

Circuit reference must remain easy to change.

Label suggested values clearly.

---

# 60. EV site photograph

Recommend capturing a real photograph of the charger during each inspection.

Do not make it mandatory globally.

Store it as:

`inspection asset photograph`

Certificate can show:

- stock model image;
- real inspection/site image.

---

# 61. EV model stock image

EV charger model library should identify model by manufacturer/model.

The stock image should automatically appear where appropriate.

Unknown model:

use generic EV charger artwork until a Super Admin adds a stock image.

---

# 62. EV contextual engineer help

Every significant test should support:

**How do I perform this test?**

Open contextual guidance without leaving the inspection.

Guidance can contain:

- purpose;
- preparation;
- procedure;
- expected behaviour;
- common errors;
- equipment notes;
- troubleshooting;
- safety notes;
- references.

Guidance must be versioned/updateable without deploying the entire frontend.

Do not obstruct the form.

Use a drawer/bottom sheet/modal appropriate to device.

---

# 63. EV backend/CPMS integrations

Create a provider abstraction:

`EVBackendProvider`

Potential capabilities:

```text
getChargePointStatus()
getConnectorStatus()
getLastSeen()
getActiveSession()
refreshStatus()
remoteStart()
remoteStop()
```

A provider may support only a subset.

Use capability detection.

---

# 64. Tap Electric integration

Implement Tap Electric as the first EV backend provider.

Organisation admin should be able to configure their Tap connection.

Never expose Tap API credentials to Angular.

Store secrets securely.

Link an Ohm Audit EV asset to external provider identifiers.

Maintain:

- provider;
- external charger ID;
- external connector ID;
- last sync;
- last known status.

Tap currently documents management API applications and signed webhooks, so the integration should be designed around server-side API access and authenticated webhook ingestion.

---

# 65. EV live status

Ohm Audit asset page may display operational information such as:

- Available
- Charging
- Faulted
- Offline
- Unknown
- last seen;
- connector states.

Operational status and compliance status are separate.

Example:

```text
Operational:
Online / Available

Compliance:
Inspection overdue
```

Do not confuse the two.

Cache last-known provider state in Ohm Audit.

The page must still work if Tap is unavailable.

---

# 66. Remote test charging

The integration architecture should support an engineer initiating a remote test charging session where the connected provider/API supports it.

UI example:

**Start Test Charge**

Then:

**Stop Test Charge**

This must only appear where:

- provider supports remote control;
- Organisation permits remote control;
- engineer has permission;
- charger is linked;
- connector is known.

Guest engineer links must only allow control over the specific charger/connectors assigned to their inspection.

Never grant general CPMS credentials.

Every command must record:

- Organisation;
- inspection;
- engineer;
- charger;
- connector;
- requested action;
- timestamp;
- provider response;
- final observed status.

Remote-control implementation must be behind the `EVBackendProvider` interface so other CPMS systems can later implement the same functionality.

---

# 67. Emergency Lighting module

Emergency lighting requires a different workflow from EV.

Do not force every light fitting into a full heavyweight Asset UI card.

Create:

**Emergency Lighting System**

as the managed parent Asset.

Under it create lighter-weight Inventory Items/Fittings.

---

# 68. Emergency lighting hierarchy

Support flexible location hierarchy such as:

```text
Emergency Lighting System
├── Building A
│   ├── Ground Floor
│   │   ├── Reception
│   │   ├── Corridor
│   │   └── Office 1
│   └── First Floor
└── Building B
```

Do not require all hierarchy levels.

Some sites may simply use:

```text
Ground Floor
First Floor
Warehouse
```

---

# 69. Emergency light fitting

Each fitting may store:

- fitting reference;
- location;
- room/zone;
- manufacturer;
- model;
- fitting type;
- self-test yes/no;
- key-switch relationship;
- circuit/source if known;
- notes;
- status;
- optional GPS/location;
- photographs.

Missing information is allowed.

Field work must not become impossible merely because the existing asset register is incomplete.

---

# 70. Emergency lighting key switches

Key switches are important entities.

One key switch may control:

- one fitting;
- a room;
- a zone;
- many fittings;
- potentially a large section.

Create many-to-many or flexible group relationships.

A fitting may alternatively be self-test and not use a traditional key switch.

---

# 71. Emergency lighting inspection types

At minimum support different test templates such as:

- functional test;
- full duration/discharge test.

The template determines:

- required fields;
- workflow;
- result expectations;
- report wording.

---

# 72. Emergency lighting bulk workflow

Engineer speed is crucial.

Allow:

**Mark Entire Room Pass**

or:

**Mark Key Switch Group Pass**

Then let engineer record exceptions.

Example:

```text
Warehouse - Key Switch KS03
32 fittings

[Mark All Pass]

Exceptions:
Fitting W-17 - Failed
Fitting W-24 - Failed
```

This is vastly preferable to tapping Pass 32 times.

Still preserve a result for every individual fitting.

---

# 73. Emergency-light photos

Make photo capture extremely easy from an individual fitting.

Photos are optional by default.

For failed fittings, strongly encourage a photo but do not make it universally compulsory.

This helps office staff and future engineers identify exactly which fitting needs replacing.

Support multiple photos.

---

# 74. Emergency-light reports

Produce at least:

### Customer Inspection Report

Professional summary and full fitting result register.

Passing fittings need:

- reference;
- location;
- test result.

They do not require photographs in the report.

### Defect / Maintenance Report

Focus on failed fittings.

Include:

- fitting reference;
- exact location;
- defect;
- notes;
- fitting details;
- photographs.

This report should be useful to an engineer attending later to perform replacement work.

One inspection dataset should generate different report views.

Do not make engineers enter the same information twice.

---

# 75. Solar PV module

Solar requires a true topology model.

Do not model it as one giant flat list.

---

# 76. Solar hierarchy/topology

Initial relational topology should support:

```text
Solar System
   ↓
Array / Roof Area
   ↓
Inverter
   ↓
MPPT
   ↓
String
```

Optionally extend further to modules/components later.

Example:

```text
Inverter INV-05
├── MPPT 1
│   ├── String 1
│   ├── String 2
│   └── String 3
├── MPPT 2
│   ├── String 1
│   └── String 2
├── MPPT 3
└── MPPT 4
```

The database relationships are authoritative.

The diagram is only a visual representation of the relationships.

---

# 77. Solar interactive topology view

Create an interactive tree/graph visualisation.

Do not store arbitrary diagram coordinates as the primary system model.

Generate the diagram from relational data.

Allow engineers/admins to select:

```text
INV-05
→ MPPT 4
→ String 3
```

and immediately see:

- test results;
- previous results;
- status;
- defects;
- photographs.

Future enhancement:

colour topology based on health/status.

Example:

- inverter healthy;
- MPPT warning;
- string failed.

Provide a conventional table/tree view as an accessibility/fallback alternative.

---

# 78. Solar data

Scaffold extensible data structures for:

- solar system;
- array/roof;
- inverter;
- MPPT;
- string;
- DC/AC characteristics;
- photographs;
- defects;
- measurements.

Do not invent regulatory solar test limits before the detailed Solar test specification is completed.

Create module extension points so test forms can be defined later without restructuring the asset hierarchy.

---

# 79. TruTest/raw test-data import

The platform will later ingest raw exports from test equipment/software such as Fluke TruTest.

Do not rebuild TruTest.

Create a generic importer architecture:

`InspectionDataImporter`

Example implementations later:

```text
FlukeTruTestImporter
OtherTesterImporter
CSVImporter
```

Flow:

```text
Raw file
→ Detect format
→ Parse
→ Normalised candidate data
→ Show mapping/review
→ Confirm
→ Create inspection data
```

Never allow an importer to bypass validation/audit history.

Store original raw import file in R2 for traceability.

---

# 80. Inspection templates

Specialist inspection forms should be template/configuration driven where practical.

A template can define:

- sections;
- fields;
- order;
- requiredness;
- conditional visibility;
- validation rule;
- help content;
- PDF mapping.

Do not make the entire platform a generic no-code form builder.

Important module workflows may still use purpose-built UI.

Configuration should support adaptation without making the engineer experience generic and ugly.

---

# 81. Super Admin interface

Create a separate protected Super Admin area.

This is for Ohm Audit operators, not tenant administrators.

It need not be visually elaborate.

Functions should include:

- Organisations;
- trials;
- subscriptions;
- module entitlements;
- platform users;
- system health;
- equipment model queue;
- models missing stock images;
- integration failures;
- AI failures;
- document template versions;
- module configuration;
- system audit;
- usage statistics.

Never expose Super Admin routes based merely on frontend hiding.

Require server-side platform-admin authorisation.

---

# 82. Organisation onboarding

On first signup, do not drop the user into an empty dashboard.

Create a guided onboarding flow.

Suggested sequence:

```text
1. Create Account
2. Verify Email
3. Create Organisation
4. Start 30-Day Trial
5. Organisation Details
6. Branding
7. Accreditations
8. Notification Defaults
9. Invite Team
10. Configure Roles
11. Import Existing Data
12. Create First Customer/Site
13. Getting Started Dashboard
```

Onboarding must be resumable.

---

# 83. Organisation setup

Collect:

- Organisation name;
- trading name;
- business address;
- contact details;
- logo;
- branding colours;
- accreditation registrations;
- timezone;
- date preferences;
- default inspection reminder preferences.

---

# 84. Team invitations

Organisation owner can invite staff.

Invitation flow:

```text
email
→ invite link
→ Supabase Auth registration
→ membership created
→ role assigned
```

Allow administrators to:

- resend invitation;
- revoke invitation;
- change role;
- deactivate membership.

---

# 85. Import onboarding

Make import easy.

Support staged import of:

- Customers;
- Sites;
- Assets.

Initial formats:

- CSV
- Excel-compatible import workflow if practical.

Import must provide:

- preview;
- column mapping;
- validation;
- duplicate detection;
- errors;
- partial success report.

Do not create corrupt records silently.

---

# 86. Getting Started dashboard

New organisations should see a checklist rather than an empty system.

Example:

```text
✓ Organisation created
✓ Logo uploaded
○ Invite first team member
○ Import first customer
○ Add first site
○ Add first asset
○ Create first inspection
```

---

# 87. Search and scaling requirements

Design lists for scale.

Never assume:

- fewer than 20 Customers;
- fewer than 20 Sites;
- fewer than 20 Assets.

Use server-side pagination/filtering where appropriate.

Support thousands of assets per Organisation.

Emergency lighting may contain hundreds or thousands of fittings at a single Site.

Use virtualised rendering in high-volume engineer lists.

---

# 88. Audit trail

Create append-only business audit events.

Capture important changes such as:

- user invitation;
- role changed;
- asset created;
- asset decommissioned;
- proposed change approved;
- inspection submitted;
- inspection changed;
- certificate issued;
- effective date changed;
- remote charging requested;
- subscription changed.

Audit record should contain:

- event type;
- actor;
- Organisation;
- entity;
- timestamp;
- correlation ID;
- relevant previous/new data.

Audit data is separate from user-facing activity feeds but can power them.

---

# 89. Integration architecture

External systems must be adapters.

Create interfaces such as:

```text
EVBackendProvider
BillingProvider
EmailProvider
SmsProvider
AIProvider
MapProvider
InspectionDataImporter
```

Core business logic must not know provider-specific details where avoidable.

---

# 90. Webhook architecture

Incoming external webhooks must:

- verify signatures where provider supports them;
- store event ID;
- be idempotent;
- reject replays where relevant;
- record raw payload securely where appropriate;
- transform external event into internal event.

Never trust a webhook merely because it reaches a secret URL.

---

# 91. API design

Use REST initially.

Create consistent endpoints.

Examples:

```text
/api/v1/organisations
/api/v1/customers
/api/v1/sites
/api/v1/assets
/api/v1/visits
/api/v1/inspections
/api/v1/defects
/api/v1/schedules
/api/v1/documents
/api/v1/integrations

/api/v1/modules/ev/...
/api/v1/modules/emergency-lighting/...
/api/v1/modules/solar/...
```

Generate OpenAPI documentation.

Use typed API clients in Angular.

---

# 92. Error design

User-facing errors must be meaningful.

Avoid:

`HTTP 500`

as the only visible message.

Return structured domain errors.

Example:

```json
{
  "code": "INSPECTION_ALREADY_SUBMITTED",
  "message": "This inspection has already been submitted.",
  "correlationId": "..."
}
```

---

# 93. Observability

Every backend request should have:

- request/correlation ID;
- structured logs;
- Organisation context where safe;
- actor context where safe;
- timing.

Record failures for:

- queue messages;
- PDF rendering;
- AI extraction;
- external integrations;
- webhooks;
- notification delivery.

Never log secret API keys or sensitive authentication tokens.

---

# 94. Security

Implement:

- tenant isolation;
- JWT verification;
- capability-based authorisation;
- MFA support;
- secure guest links;
- encrypted integration secrets;
- secure R2 access;
- signed/short-lived media URLs where appropriate;
- rate limits for sensitive operations;
- webhook signature validation;
- CSRF-conscious auth architecture;
- content-type validation;
- file-size limits;
- image/file validation;
- audit logs.

Remote charger controls must receive additional authorisation and auditing.

---

# 95. Media security

R2 buckets should not simply be globally public.

Users should access private media through authorised API/signed access.

Customer logos/stock images may use public/cached delivery where appropriate.

Inspection evidence should remain protected.

---

# 96. Performance

Target:

- fast admin navigation;
- instantaneous local engineer form transitions;
- no network dependency for already-downloaded visits;
- responsive lists with hundreds of records;
- lazy loading of large media;
- thumbnails instead of full photographs in lists.

Generate thumbnail/preview derivatives where helpful.

---

# 97. Accessibility

Use:

- semantic labels;
- keyboard navigation;
- high contrast;
- adequate touch targets;
- visible focus states;
- screen-reader labels;
- text/icons alongside status colours.

Do not rely on green/red alone.

---

# 98. No customer portal in initial scope

Do not build a Customer login portal initially.

Customers generally prefer the contractor to send the correct report/certificate directly.

Architecture may permit a portal later, but it is not required for the first product.

---

# 99. Facilities management future-proofing

The shared core should later permit:

- PPM;
- reactive maintenance;
- service visits;
- site maintenance history;
- site documents;
- maintenance schedules;
- general facilities assets.

Do not build quoting/accounting functionality into this.

The asset, visit, schedule and defect foundations should make future facilities-management modules possible.

---

# 100. Milestone strategy

Do not attempt to implement every detail in one uncontrolled coding pass.

The agent may scaffold the entire folder structure immediately, but functionality should be completed milestone by milestone.

Every milestone must leave the repository in a buildable/testable state.

---

# Milestone 0 — Workspace and architecture

Create the full root folder structure.

Create:

- READMEs;
- architecture docs;
- environment examples;
- package manifests;
- deployment configuration;
- CI skeleton;
- linting;
- formatting;
- TypeScript strict mode;
- testing foundations.

Define contracts and naming conventions.

No placeholder spaghetti.

Deliverable:

All projects build and tests execute.

---

# Milestone 1 — Identity and tenancy

Implement:

- Supabase Auth integration;
- internal users;
- Organisations;
- memberships;
- roles;
- capabilities;
- current Organisation context;
- MFA foundations;
- tenant isolation;
- Super Admin distinction.

Build login and signup.

Deliverable:

Two separate Organisations can exist and cannot access each other's records.

---

# Milestone 2 — Subscription and onboarding

Implement:

- Organisation creation;
- 30-day trial;
- module catalogue;
- entitlement service;
- Stripe abstraction/integration;
- branding setup;
- accreditation setup;
- invitations;
- onboarding wizard;
- getting-started checklist.

Deliverable:

New user can register, create an Organisation, receive module trials and enter the platform.

---

# Milestone 3 — Customer, Site and Asset Core

Implement:

- Customers;
- Contacts;
- Sites;
- site information;
- base Assets;
- lifecycle;
- asset model library foundation;
- photos;
- documents;
- GPS;
- search;
- tags;
- timelines.

Deliverable:

An administrator can build a realistic Customer → Site → Asset portfolio.

---

# Milestone 4 — Scheduling and notifications

Implement:

- schedule rules;
- future occurrences;
- rolling horizon;
- calendar;
- Scheduler Worker;
- notification events;
- Notification Worker;
- Organisation notification preferences.

Deliverable:

An inspection schedule due years in the future appears in the calendar and produces appropriate reminders when its notification window arrives.

---

# Milestone 5 — Visits and offline engineer foundation

Implement:

- Visits;
- Visit tasks;
- permanent engineer assignment;
- guest engineer links;
- visit pack downloads;
- IndexedDB;
- local draft storage;
- outbox;
- offline photo capture;
- sync;
- conflict handling;
- submission.

Deliverable:

Engineer can download a visit, go offline, complete work, reconnect and successfully sync it.

This milestone is critical.

Do not proceed with complex inspection modules until offline behaviour is reliable.

---

# Milestone 6 — Inspection engine and documents

Implement:

- inspection lifecycle;
- inspection revisions;
- custom fields;
- validation engine;
- defects;
- signatures;
- audit dates/effective dates;
- report templates;
- template versions;
- PDF Worker;
- synchronous PDF generation;
- Organisation branding.

Deliverable:

A generic test inspection can be completed, revised and rendered as a branded PDF.

---

# Milestone 7 — EV Charging module

Implement complete initial EV module:

- charger digital twin;
- supplies;
- connectors;
- supply mapping;
- stable asset details;
- inspection workflow;
- numerical test UX;
- validation framework;
- photos;
- defects;
- certificate;
- maintenance report;
- engineer help;
- model stock images.

Deliverable:

Engineer can perform an EV inspection end-to-end on a mobile device, offline if necessary, and admin can issue a professional certificate.

---

# Milestone 8 — AI/media intelligence

Implement:

- AI Worker;
- provider abstraction;
- Workers AI vision;
- data-plate extraction;
- confidence/review;
- pending offline processing;
- proposed asset changes;
- model-library suggestions.

Deliverable:

Engineer can photograph a data plate and review manufacturer/model/serial suggestions rather than manually typing them.

---

# Milestone 9 — Emergency Lighting module

Implement:

- Emergency Lighting System;
- hierarchy;
- fittings;
- key switches;
- self-test;
- group relationships;
- functional test;
- duration test;
- bulk pass;
- exceptions;
- photographs;
- customer report;
- fault/maintenance report.

Deliverable:

Engineer can efficiently test a Site containing hundreds of fittings using an iPad/mobile device.

---

# Milestone 10 — Solar PV foundation

Implement:

- Solar System;
- arrays/roof areas;
- inverter;
- MPPT;
- strings;
- relational topology;
- interactive topology viewer;
- status visualisation foundation;
- photo/defect support;
- inspection template foundation.

Do not invent unsupported test regulations.

Deliverable:

A realistic multi-inverter solar installation can be modelled and navigated visually.

---

# Milestone 11 — External integrations

Implement integration framework.

Add Tap Electric first.

Implement:

- secure provider configuration;
- external asset mapping;
- live status;
- last-known status cache;
- webhook handling;
- connection health;
- connector mapping;
- remote-control capability interface;
- command audit.

Where current Tap account/API permissions permit, implement remote start/stop through the adapter.

Deliverable:

A linked charger can display its operational state alongside Ohm Audit compliance data.

---

# Milestone 12 — Imports and advanced search

Implement:

- Customer/Site/Asset CSV import;
- import review;
- duplicate handling;
- importer framework;
- TruTest importer shell;
- Vectorize optional semantic search;
- knowledge search.

Deliverable:

An Organisation can migrate a realistic existing asset portfolio without manually recreating everything.

---

# Milestone 13 — Production hardening

Complete:

- security review;
- tenant-isolation tests;
- performance testing;
- offline stress testing;
- queue retries;
- webhook replay protection;
- rate limits;
- accessibility;
- backups/restore documentation;
- monitoring;
- deployment docs;
- operational runbooks;
- production environment configuration.

---

# 101. Testing strategy

Every repository requires automated tests.

Use:

- unit tests;
- API integration tests;
- Angular component tests;
- Playwright end-to-end tests;
- Cloudflare Worker integration tests where appropriate.

Critical E2E scenarios include:

### Tenant isolation

Organisation A cannot see Organisation B.

### Offline inspection

Download Visit → offline → inspect → photograph → reconnect → sync.

### Guest engineer

Receive link → inspect assigned assets → submit → link expires/revokes correctly.

### Asset change

Engineer proposes serial number → admin reviews → asset updated.

### Certificate revision

Issue Revision 1 → change inspection → Revision 2 exists → Revision 1 remains reproducible.

### Scheduling

Complete annual inspection → current occurrence closes → future occurrence exists.

### Emergency lighting bulk action

Mark room pass → flag two failures → individual fitting results are correct.

### EV multiple supplies

Two-connector charger with two supplies maps correctly.

### EV shared supply

Two connectors share one supply without duplicating supply data.

### Billing entitlement

Trial module accessible → trial expires → entitlement changes correctly.

### Remote charger control

Unauthorised user cannot trigger a remote-start command.

---

# 102. Seed/demo data

Create realistic development seed data.

Example:

Organisation:

`Demo Electrical Ltd`

Customers:

- National Retail Customer
- Logistics Customer

Sites:

- Manchester Distribution Centre
- Leeds Retail Site

Assets:

- multiple EV chargers;
- dual-connector charger;
- charger with two supplies;
- emergency lighting system with at least 100 generated fittings;
- key switches;
- solar system with multiple inverters/MPPTs/strings.

This is important because the UI must be tested against realistic scale.

Do not design using only three sample records.

---

# 103. Developer experience

Every project README should explain:

- purpose;
- dependencies;
- setup;
- environment variables;
- development commands;
- tests;
- deployment;
- integration with other Ohm Audit projects.

Provide:

```bash
npm/pnpm install
dev
test
lint
build
deploy
```

commands consistently where practical.

---

# 104. Environment separation

Support:

- local;
- development;
- staging;
- production.

Do not hard-code:

- URLs;
- R2 bucket names;
- Stripe IDs;
- Supabase IDs;
- Tap credentials;
- AI model identifiers;
- API hosts.

Use environment bindings/configuration.

---

# 105. Database migrations

Prisma migrations are authoritative.

Never manually mutate production schema as the normal deployment process.

Seed data must remain separate from migrations.

Every schema change should be reviewable.

---

# 106. Idempotency

Use idempotency extensively for:

- Stripe webhooks;
- Tap webhooks;
- notification events;
- queue jobs;
- inspection sync;
- media upload completion;
- remote-control commands where appropriate.

Mobile reconnects and queue retries must not accidentally create duplicate records.

---

# 107. Domain events

Where useful, produce domain events such as:

```text
InspectionSubmitted
InspectionApproved
CertificateIssued
DefectCreated
AssetChangeProposed
AssetDecommissioned
ScheduleOccurrenceCompleted
SubscriptionChanged
ModuleEntitlementChanged
```

Use these for integrations and asynchronous side effects.

Do not make API controllers manually send ten unrelated emails.

---

# 108. Explicit exclusions

Do not build the following into the initial application:

- contractor-to-customer invoicing;
- estimating;
- quoting;
- job profitability;
- accounting;
- payroll;
- customer self-service portal;
- generic CRM sales pipeline;
- full project management.

Integrations can be added later.

Ohm Audit should excel at:

**assets + inspections + servicing + compliance + operational records.**

---

# 109. UX acceptance principle

Before declaring any engineer workflow complete, test:

> Could an engineer realistically complete this with dirty hands, standing outside, using a small phone, in poor signal, without wanting to throw the phone across the car park?

If not, redesign it.

For administrators ask:

> If a customer calls and asks for the certificate for one charger at one of 200 sites, can the administrator find it in seconds?

If not, redesign it.

---

# 110. Code quality requirements

The coding agent must:

- avoid giant components;
- avoid giant service files;
- avoid duplicated module logic;
- use meaningful domain names;
- document architecture decisions;
- create tests while implementing;
- keep TypeScript strict;
- maintain consistent formatting;
- avoid `any` unless strongly justified;
- validate API input;
- never trust frontend permissions;
- use dependency inversion around providers;
- make all modules removable/optional;
- preserve buildability at every milestone.

Do not generate thousands of lines of placeholder TODO code merely to claim completion.

Working, tested foundations are more important than superficial feature count.

---

# 111. Documentation to create immediately

Inside `ohmaudit-docs`, create:

```text
PRODUCT.md
ARCHITECTURE.md
DOMAIN-MODEL.md
MULTITENANCY.md
AUTHORIZATION.md
OFFLINE-SYNC.md
SCHEDULING.md
DOCUMENTS.md
MODULE-SYSTEM.md
EV-MODULE.md
EMERGENCY-LIGHTING-MODULE.md
SOLAR-MODULE.md
INTEGRATIONS.md
BILLING.md
SECURITY.md
DEPLOYMENT.md
ROADMAP.md
DECISIONS/
```

Use Architecture Decision Records for major choices.

Example:

```text
ADR-001-postgresql.md
ADR-002-cloudflare-workers.md
ADR-003-module-entitlements.md
ADR-004-offline-sync.md
ADR-005-dynamic-pdf-generation.md
```

---

# 112. Instructions to the coding agent

You are responsible for building this system from an empty root directory.

Do not respond merely with code snippets.

Create the actual directory/file structure.

Before implementation:

1. read this entire specification;
2. create the proposed repository structure;
3. create architecture documentation;
4. create a milestone checklist;
5. identify unresolved implementation decisions;
6. select sensible defaults without changing the product requirements.

Do not ask unnecessary questions where a sensible implementation can be chosen.

When an electrical/compliance rule is not explicitly defined, build the configurable mechanism but do not invent regulatory values.

Complete work milestone by milestone.

At the end of each milestone:

- run tests;
- run linting;
- run TypeScript checks;
- run builds;
- update ROADMAP.md;
- update architecture documentation if needed;
- commit-ready state.

Do not begin by attempting to write the entire product in one uncontrolled pass.

The root folder should ultimately contain a coherent family of independently deployable, independently GitHub-hostable Ohm Audit repositories.

The finished architecture should feel like one platform even though deployments are separated.

---

# 113. Desired first usable prototype

The first genuinely usable prototype should allow this scenario:

1. User signs up.
2. User creates an Organisation.
3. 30-day module trial starts.
4. User uploads their company logo and details.
5. User creates/imports a Customer.
6. User creates a Site.
7. User adds several EV chargers.
8. Admin schedules a Visit.
9. Admin assigns an EV inspection.
10. Admin creates a Guest Engineer link.
11. Engineer downloads the Visit.
12. Engineer goes offline.
13. Engineer confirms charger details.
14. Engineer enters supply and connector test results.
15. Engineer photographs charger/data plate.
16. Engineer records a defect with photographs.
17. Engineer signs.
18. Engineer submits.
19. Device reconnects.
20. Inspection synchronises.
21. Admin reviews proposed asset changes.
22. Admin approves inspection.
23. Admin dynamically generates a branded PDF certificate.
24. Inspection creates/updates the next service occurrence.
25. Calendar immediately displays the next inspection date.
26. Reminder infrastructure knows when to notify the Organisation.
27. Asset history shows the completed inspection.
28. Old inspection revision remains available permanently.

If this workflow works cleanly, quickly and reliably, the foundation of Ohm Audit is correct.

Everything else should build on top of it.