# Offline sync

A downloaded Visit Pack contains the minimum site, asset, template, guidance, and media data required for assigned work. IndexedDB stores packs, drafts, pending media, an idempotent mutation outbox, sync state, and version metadata.

Every mutation has a client mutation ID. Replays cannot duplicate records. Important canonical conflicts create a conflict or Proposed Asset Change rather than silent last-write-wins. Submitted revisions are immutable. UX uses calm states such as “Saved on device”, “Syncing”, and “Conflict requires review”.

Milestone 5 implements IndexedDB tables for visit packs, inspection drafts, captured photo blobs, and an ordered mutation outbox. Permanent and guest engineers can download a visit, work without signal, and queue submission. Reconnect processing uses a unique client mutation ID on inspection revisions so a network retry cannot create a duplicate revision. Guest tokens are SHA-256 hashed, expire by default after seven days, and expose only their assigned visit and tasks.

Inspection photographs are uploaded before an online submission or during outbox replay after reconnect. Authenticated and guest engineers use separately authorised upload routes, and uploaded fault images are linked to the submitted defect through immutable media IDs.
