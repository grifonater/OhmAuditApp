ALTER TABLE "assets"
ADD COLUMN "created_during_visit_id" UUID;

WITH unambiguous_events AS (
  SELECT
    event."entity_id" AS asset_id,
    MIN(event."data" ->> 'visitId') AS visit_id,
    MIN(event."data" ->> 'siteId') AS site_id,
    MIN(event."organisation_id"::text) AS organisation_id
  FROM "audit_events" event
  WHERE event."event_type" = 'EngineerEvAssetCreated'
    AND event."entity_type" = 'Asset'
    AND event."organisation_id" IS NOT NULL
    AND event."data" ->> 'visitId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND event."data" ->> 'siteId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  GROUP BY event."entity_id"
  HAVING COUNT(*) = 1
)
UPDATE "assets" asset
SET "created_during_visit_id" = candidate.visit_id::uuid
FROM unambiguous_events candidate
JOIN "visits" visit ON visit."id" = candidate.visit_id::uuid
WHERE asset."id"::text = candidate.asset_id
  AND asset."status" = 'PROPOSED'
  AND candidate.organisation_id::uuid = asset."organisation_id"
  AND candidate.site_id::uuid = asset."site_id"
  AND visit."organisation_id" = asset."organisation_id"
  AND visit."site_id" = asset."site_id";

CREATE INDEX "assets_created_during_visit_id_idx"
ON "assets"("created_during_visit_id");

ALTER TABLE "assets"
ADD CONSTRAINT "assets_created_during_visit_id_fkey"
FOREIGN KEY ("created_during_visit_id") REFERENCES "visits"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
