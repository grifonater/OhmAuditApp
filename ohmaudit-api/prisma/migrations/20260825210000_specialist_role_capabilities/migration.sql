INSERT INTO "capabilities" ("id", "key") VALUES
  (gen_random_uuid(), 'ev.assets.read'),
  (gen_random_uuid(), 'ev.assets.manage'),
  (gen_random_uuid(), 'ev.inspections.perform'),
  (gen_random_uuid(), 'ev.certificates.issue'),
  (gen_random_uuid(), 'thermal.equipment.read'),
  (gen_random_uuid(), 'thermal.equipment.manage'),
  (gen_random_uuid(), 'thermal.inspections.perform'),
  (gen_random_uuid(), 'thermal.reports.issue')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_capabilities" ("role_id", "capability_id")
SELECT r."id", c."id"
FROM "roles" r
JOIN "capabilities" c ON (
  (c."key" IN ('ev.assets.read', 'thermal.equipment.read') AND r."key" IN (
    'organisation-owner', 'organisation-administrator', 'contract-manager',
    'office-administrator', 'engineer', 'read-only'
  )) OR
  (c."key" = 'ev.assets.manage' AND r."key" IN (
    'organisation-owner', 'organisation-administrator', 'contract-manager', 'office-administrator'
  )) OR
  (c."key" IN ('ev.inspections.perform', 'thermal.inspections.perform') AND r."key" IN (
    'organisation-owner', 'organisation-administrator', 'engineer'
  )) OR
  (c."key" IN ('ev.certificates.issue', 'thermal.reports.issue') AND r."key" IN (
    'organisation-owner', 'organisation-administrator', 'contract-manager'
  )) OR
  (c."key" = 'thermal.equipment.manage' AND r."key" IN (
    'organisation-owner', 'organisation-administrator'
  ))
)
ON CONFLICT DO NOTHING;

UPDATE "roles" r
SET "is_privileged" = true
WHERE r."key" IN ('organisation-owner', 'organisation-administrator', 'contract-manager')
  AND EXISTS (
    SELECT 1
    FROM "role_capabilities" rc
    JOIN "capabilities" c ON c."id" = rc."capability_id"
    WHERE rc."role_id" = r."id"
      AND c."key" IN ('ev.certificates.issue', 'thermal.equipment.manage', 'thermal.reports.issue')
  );

UPDATE "module_definitions"
SET "capabilities" = '["ev.assets.read","ev.assets.manage","ev.inspections.perform","ev.certificates.issue"]'::jsonb,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "key" = 'ev-charging';

UPDATE "module_definitions"
SET "capabilities" = '["thermal.inspections.perform","thermal.reports.issue","thermal.equipment.read","thermal.equipment.manage"]'::jsonb,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "key" = 'thermal-imaging';
