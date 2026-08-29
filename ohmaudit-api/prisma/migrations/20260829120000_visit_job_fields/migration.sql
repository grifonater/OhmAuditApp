CREATE TABLE "job_categories" (
    "id" UUID NOT NULL,
    "organisation_id" UUID,
    "system_key" TEXT,
    "name" TEXT NOT NULL,
    "normalised_name" TEXT NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_categories_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "job_categories_owner_check" CHECK (
        ("organisation_id" IS NULL AND "system_key" IS NOT NULL) OR
        ("organisation_id" IS NOT NULL AND "system_key" IS NULL)
    )
);

CREATE UNIQUE INDEX "job_categories_system_key_key" ON "job_categories"("system_key");
CREATE UNIQUE INDEX "job_categories_system_name_key"
ON "job_categories"("normalised_name") WHERE "organisation_id" IS NULL;
CREATE UNIQUE INDEX "job_categories_organisation_name_key"
ON "job_categories"("organisation_id", "normalised_name") WHERE "organisation_id" IS NOT NULL;
CREATE INDEX "job_categories_organisation_id_status_name_idx"
ON "job_categories"("organisation_id", "status", "name");

ALTER TABLE "job_categories"
ADD CONSTRAINT "job_categories_organisation_id_fkey"
FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "job_categories" (
    "id", "system_key", "name", "normalised_name", "updated_at"
) VALUES
    ('10000000-0000-4000-8000-000000000001', 'ev-charging', 'EV Charging', 'ev charging', CURRENT_TIMESTAMP),
    ('10000000-0000-4000-8000-000000000002', 'solar', 'Solar', 'solar', CURRENT_TIMESTAMP),
    ('10000000-0000-4000-8000-000000000003', 'electrical-installation', 'Electrical Installation', 'electrical installation', CURRENT_TIMESTAMP),
    ('10000000-0000-4000-8000-000000000004', 'other', 'Other', 'other', CURRENT_TIMESTAMP);

ALTER TABLE "visits"
ADD COLUMN "job_category_id" UUID,
ADD COLUMN "external_reference" TEXT,
ADD COLUMN "description" TEXT,
ADD COLUMN "exclusions" TEXT,
ADD COLUMN "job_type" TEXT,
ADD COLUMN "created_by_user_id" UUID;

-- Existing assignments predate a foreign key and may contain stale or cross-tenant user IDs.
UPDATE "visits" AS "visit"
SET "assigned_user_id" = NULL
WHERE "assigned_user_id" IS NOT NULL
AND NOT EXISTS (
    SELECT 1
    FROM "organisation_memberships" AS "membership"
    WHERE "membership"."organisation_id" = "visit"."organisation_id"
      AND "membership"."user_id" = "visit"."assigned_user_id"
      AND "membership"."status" = 'ACTIVE'
);

CREATE INDEX "visits_organisation_id_job_category_id_idx"
ON "visits"("organisation_id", "job_category_id");

ALTER TABLE "visits"
ADD CONSTRAINT "visits_job_category_id_fkey"
FOREIGN KEY ("job_category_id") REFERENCES "job_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "visits"
ADD CONSTRAINT "visits_assigned_user_id_fkey"
FOREIGN KEY ("assigned_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "visits"
ADD CONSTRAINT "visits_created_by_user_id_fkey"
FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
