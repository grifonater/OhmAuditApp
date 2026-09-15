CREATE TABLE "visit_findings" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "visit_id" UUID NOT NULL,
    "client_finding_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "DefectCategory" NOT NULL,
    "severity" "DefectSeverity" NOT NULL,
    "status" "DefectStatus" NOT NULL,
    "photo_media_ids" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visit_findings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "visit_findings_visit_id_client_finding_id_key"
ON "visit_findings"("visit_id", "client_finding_id");

CREATE INDEX "visit_findings_organisation_id_status_severity_idx"
ON "visit_findings"("organisation_id", "status", "severity");

CREATE INDEX "visit_findings_organisation_id_visit_id_idx"
ON "visit_findings"("organisation_id", "visit_id");

ALTER TABLE "visit_findings"
ADD CONSTRAINT "visit_findings_organisation_id_fkey"
FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "visit_findings"
ADD CONSTRAINT "visit_findings_visit_id_fkey"
FOREIGN KEY ("visit_id") REFERENCES "visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
