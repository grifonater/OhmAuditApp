CREATE TABLE "inspection_drafts" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "inspection_id" UUID NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inspection_drafts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "inspection_drafts_inspection_id_key" ON "inspection_drafts"("inspection_id");
CREATE INDEX "inspection_drafts_organisation_id_updated_at_idx" ON "inspection_drafts"("organisation_id", "updated_at");

ALTER TABLE "inspection_drafts" ADD CONSTRAINT "inspection_drafts_organisation_id_fkey"
FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inspection_drafts" ADD CONSTRAINT "inspection_drafts_inspection_id_fkey"
FOREIGN KEY ("inspection_id") REFERENCES "inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
