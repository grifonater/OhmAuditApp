ALTER TABLE "visits" ADD COLUMN "ev_discovery_enabled" BOOLEAN NOT NULL DEFAULT false;

UPDATE "visits"
SET "ev_discovery_enabled" = true
WHERE EXISTS (
    SELECT 1
    FROM "visit_tasks"
    WHERE "visit_tasks"."visit_id" = "visits"."id"
      AND "visit_tasks"."module_key" = 'ev-charging'
);
