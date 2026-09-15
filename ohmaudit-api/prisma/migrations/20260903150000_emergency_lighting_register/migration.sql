CREATE TABLE "emergency_lighting_fitting_types" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "organisation_id" UUID NOT NULL,
  "system_id" UUID NOT NULL, "name" TEXT NOT NULL, "display_order" INTEGER NOT NULL DEFAULT 0,
  "is_default" BOOLEAN NOT NULL DEFAULT false, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "emergency_lighting_fitting_types_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "emergency_lighting_devices" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "organisation_id" UUID NOT NULL,
  "system_id" UUID NOT NULL, "fitting_type_id" UUID, "make" TEXT NOT NULL, "model" TEXT NOT NULL,
  "description" TEXT, "notes" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "emergency_lighting_devices_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "emergency_lighting_fittings" ADD COLUMN "device_id" UUID;

CREATE UNIQUE INDEX "emergency_lighting_fitting_types_system_id_name_key" ON "emergency_lighting_fitting_types"("system_id", "name");
CREATE INDEX "emergency_lighting_fitting_types_organisation_id_system_id_idx" ON "emergency_lighting_fitting_types"("organisation_id", "system_id");

CREATE UNIQUE INDEX "emergency_lighting_devices_system_id_model_key" ON "emergency_lighting_devices"("system_id", "model");
CREATE INDEX "emergency_lighting_devices_organisation_id_system_id_idx" ON "emergency_lighting_devices"("organisation_id", "system_id");

ALTER TABLE "emergency_lighting_fitting_types" ADD CONSTRAINT "emergency_lighting_fitting_types_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "emergency_lighting_fitting_types" ADD CONSTRAINT "emergency_lighting_fitting_types_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "emergency_lighting_systems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "emergency_lighting_devices" ADD CONSTRAINT "emergency_lighting_devices_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "emergency_lighting_devices" ADD CONSTRAINT "emergency_lighting_devices_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "emergency_lighting_systems"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "emergency_lighting_devices" ADD CONSTRAINT "emergency_lighting_devices_fitting_type_id_fkey" FOREIGN KEY ("fitting_type_id") REFERENCES "emergency_lighting_fitting_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "emergency_lighting_fittings" ADD CONSTRAINT "emergency_lighting_fittings_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "emergency_lighting_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "emergency_lighting_fitting_types" ("organisation_id", "system_id", "name", "display_order", "is_default", "updated_at")
SELECT s."organisation_id", s."id", t."name", t."display_order", true, CURRENT_TIMESTAMP
FROM "emergency_lighting_systems" s
CROSS JOIN (VALUES
  ('Bulkhead', 0),
  ('Pin Spot', 1),
  ('Panel', 2),
  ('Exit Box', 3),
  ('Running Man', 4),
  ('High Bay', 5),
  ('Floodlight', 6),
  ('Twin Spot', 7),
  ('Other', 8)
) AS t("name", "display_order")
ON CONFLICT ("system_id", "name") DO NOTHING;
