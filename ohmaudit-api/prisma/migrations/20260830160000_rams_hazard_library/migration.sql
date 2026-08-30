CREATE TABLE "rams_hazard_library_items" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalised_name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "data" JSONB NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "rams_hazard_library_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "rams_hazard_library_items_organisation_id_normalised_name_key" ON "rams_hazard_library_items"("organisation_id", "normalised_name");
CREATE INDEX "rams_hazard_library_items_organisation_id_status_is_default_idx" ON "rams_hazard_library_items"("organisation_id", "status", "is_default");

ALTER TABLE "rams_hazard_library_items" ADD CONSTRAINT "rams_hazard_library_items_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;