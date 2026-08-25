ALTER TABLE "visits" ADD COLUMN "completed_at" TIMESTAMP(3);

CREATE INDEX "visits_organisation_id_completed_at_idx"
ON "visits"("organisation_id", "completed_at");
