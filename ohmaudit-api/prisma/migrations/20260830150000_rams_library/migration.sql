CREATE TABLE "rams_templates" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalised_name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "data" JSONB NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "rams_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rams_method_statement_groups" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalised_name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "steps" JSONB NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "rams_method_statement_groups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rams_templates_organisation_id_normalised_name_key" ON "rams_templates"("organisation_id", "normalised_name");
CREATE INDEX "rams_templates_organisation_id_status_name_idx" ON "rams_templates"("organisation_id", "status", "name");
CREATE UNIQUE INDEX "rams_method_statement_groups_organisation_id_normalised_name_key" ON "rams_method_statement_groups"("organisation_id", "normalised_name");
CREATE INDEX "rams_method_statement_groups_organisation_id_status_name_idx" ON "rams_method_statement_groups"("organisation_id", "status", "name");

ALTER TABLE "rams_templates" ADD CONSTRAINT "rams_templates_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rams_method_statement_groups" ADD CONSTRAINT "rams_method_statement_groups_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
