ALTER TABLE "media"
ADD COLUMN "original_filename" TEXT,
ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "organisation_equipment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organisation_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "equipment_type" TEXT NOT NULL,
  "manufacturer" TEXT,
  "model" TEXT,
  "serial_number" TEXT,
  "calibration_due_at" DATE,
  "notes" TEXT,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "organisation_equipment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "organisation_equipment_organisation_id_fkey"
    FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "organisation_equipment_organisation_id_status_equipment_type_idx"
  ON "organisation_equipment"("organisation_id", "status", "equipment_type");
CREATE INDEX "organisation_equipment_organisation_id_serial_number_idx"
  ON "organisation_equipment"("organisation_id", "serial_number");
