CREATE TYPE "RamsStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'APPROVED', 'RETURNED');

CREATE TABLE "rams" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "visit_id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "RamsStatus" NOT NULL DEFAULT 'DRAFT',
    "current_revision_number" INTEGER NOT NULL DEFAULT 0,
    "effective_from" DATE,
    "draft_data" JSONB NOT NULL,
    "prepared_by_user_id" UUID NOT NULL,
    "submitted_at" TIMESTAMP(3),
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by_user_id" UUID,
    "approved_at" TIMESTAMP(3),
    "approved_by_user_id" UUID,
    "review_comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "rams_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rams_revisions" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "rams_id" UUID NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rams_revisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rams_visit_id_key" ON "rams"("visit_id");
CREATE INDEX "rams_organisation_id_status_updated_at_idx" ON "rams"("organisation_id", "status", "updated_at");
CREATE INDEX "rams_organisation_id_visit_id_idx" ON "rams"("organisation_id", "visit_id");
CREATE UNIQUE INDEX "rams_revisions_rams_id_revision_number_key" ON "rams_revisions"("rams_id", "revision_number");
CREATE INDEX "rams_revisions_organisation_id_created_at_idx" ON "rams_revisions"("organisation_id", "created_at");

ALTER TABLE "rams" ADD CONSTRAINT "rams_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rams" ADD CONSTRAINT "rams_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rams" ADD CONSTRAINT "rams_prepared_by_user_id_fkey" FOREIGN KEY ("prepared_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rams" ADD CONSTRAINT "rams_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "rams" ADD CONSTRAINT "rams_approved_by_user_id_fkey" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "rams_revisions" ADD CONSTRAINT "rams_revisions_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rams_revisions" ADD CONSTRAINT "rams_revisions_rams_id_fkey" FOREIGN KEY ("rams_id") REFERENCES "rams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rams_revisions" ADD CONSTRAINT "rams_revisions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "capabilities" ("id", "key", "description") VALUES
  (gen_random_uuid(), 'rams.read', 'View risk assessments and method statements linked to jobs.'),
  (gen_random_uuid(), 'rams.manage', 'Create, edit and submit RAMS for review.'),
  (gen_random_uuid(), 'rams.review', 'Review submitted RAMS and return them for changes.'),
  (gen_random_uuid(), 'rams.approve', 'Approve RAMS revisions for use on jobs.')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_capabilities" ("role_id", "capability_id")
SELECT r."id", c."id"
FROM "roles" r
JOIN "capabilities" c ON (
  (c."key" = 'rams.read' AND r."key" IN ('organisation-owner', 'organisation-administrator', 'contract-manager', 'office-administrator', 'engineer', 'read-only')) OR
  (c."key" = 'rams.manage' AND r."key" IN ('organisation-owner', 'organisation-administrator', 'contract-manager', 'office-administrator', 'engineer')) OR
  (c."key" IN ('rams.review', 'rams.approve') AND r."key" IN ('organisation-owner', 'organisation-administrator', 'contract-manager'))
)
ON CONFLICT DO NOTHING;

UPDATE "roles"
SET "is_privileged" = true
WHERE "key" IN ('organisation-owner', 'organisation-administrator', 'contract-manager')
  AND EXISTS (
    SELECT 1 FROM "role_capabilities" rc
    JOIN "capabilities" c ON c."id" = rc."capability_id"
    WHERE rc."role_id" = "roles"."id" AND c."key" = 'rams.approve'
  );
