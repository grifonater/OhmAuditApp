CREATE TABLE "rams_visits" (
    "rams_id" UUID NOT NULL,
    "visit_id" UUID NOT NULL,
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rams_visits_pkey" PRIMARY KEY ("rams_id", "visit_id")
);

INSERT INTO "rams_visits" ("rams_id", "visit_id")
SELECT "id", "visit_id"
FROM "rams";

CREATE INDEX "rams_visits_visit_id_idx" ON "rams_visits"("visit_id");

ALTER TABLE "rams_visits" ADD CONSTRAINT "rams_visits_rams_id_fkey" FOREIGN KEY ("rams_id") REFERENCES "rams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rams_visits" ADD CONSTRAINT "rams_visits_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "rams" DROP CONSTRAINT "rams_visit_id_fkey";
DROP INDEX "rams_visit_id_key";
DROP INDEX "rams_organisation_id_visit_id_idx";
ALTER TABLE "rams" DROP COLUMN "visit_id";

CREATE TABLE "rams_acknowledgements" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "rams_revision_id" UUID NOT NULL,
    "visit_id" UUID NOT NULL,
    "signer_subject" TEXT NOT NULL,
    "signer_name" TEXT NOT NULL,
    "signer_email" TEXT,
    "signer_role" TEXT NOT NULL,
    "signature_data" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "signed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rams_acknowledgements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rams_acknowledgements_rams_revision_id_visit_id_signer_subject_key" ON "rams_acknowledgements"("rams_revision_id", "visit_id", "signer_subject");
CREATE INDEX "rams_acknowledgements_organisation_id_visit_id_signed_at_idx" ON "rams_acknowledgements"("organisation_id", "visit_id", "signed_at");

ALTER TABLE "rams_acknowledgements" ADD CONSTRAINT "rams_acknowledgements_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rams_acknowledgements" ADD CONSTRAINT "rams_acknowledgements_rams_revision_id_fkey" FOREIGN KEY ("rams_revision_id") REFERENCES "rams_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rams_acknowledgements" ADD CONSTRAINT "rams_acknowledgements_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
