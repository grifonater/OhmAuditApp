CREATE TABLE "emergency_lighting_systems" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organisation_id" UUID NOT NULL,
  "asset_id" UUID NOT NULL,
  "description" TEXT,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "emergency_lighting_systems_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "emergency_lighting_locations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "organisation_id" UUID NOT NULL,
  "system_id" UUID NOT NULL, "name" TEXT NOT NULL, "description" TEXT,
  "display_order" INTEGER NOT NULL DEFAULT 0, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "emergency_lighting_locations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "emergency_lighting_groups" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "organisation_id" UUID NOT NULL,
  "system_id" UUID NOT NULL, "name" TEXT NOT NULL, "description" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "emergency_lighting_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "emergency_lighting_keyswitches" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "organisation_id" UUID NOT NULL,
  "system_id" UUID NOT NULL, "location_id" UUID, "reference" TEXT NOT NULL,
  "description" TEXT, "notes" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "emergency_lighting_keyswitches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "emergency_lighting_keyswitch_groups" (
  "keyswitch_id" UUID NOT NULL, "group_id" UUID NOT NULL,
  CONSTRAINT "emergency_lighting_keyswitch_groups_pkey" PRIMARY KEY ("keyswitch_id", "group_id")
);

CREATE TABLE "emergency_lighting_fittings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "organisation_id" UUID NOT NULL,
  "system_id" UUID NOT NULL, "location_id" UUID, "reference" TEXT NOT NULL,
  "description" TEXT, "fitting_type" TEXT, "operation_mode" TEXT, "manufacturer" TEXT,
  "model" TEXT, "serial_number" TEXT, "rated_duration_minutes" INTEGER,
  "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE', "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "emergency_lighting_fittings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "emergency_lighting_fitting_groups" (
  "fitting_id" UUID NOT NULL, "group_id" UUID NOT NULL,
  CONSTRAINT "emergency_lighting_fitting_groups_pkey" PRIMARY KEY ("fitting_id", "group_id")
);

CREATE TABLE "emergency_lighting_fitting_results" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "organisation_id" UUID NOT NULL,
  "fitting_id" UUID NOT NULL, "inspection_id" UUID, "inspection_revision_id" UUID,
  "outcome" TEXT NOT NULL, "test_type" TEXT NOT NULL, "duration_minutes" INTEGER,
  "notes" TEXT, "is_override" BOOLEAN NOT NULL DEFAULT false, "snapshot" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "emergency_lighting_fitting_results_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "emergency_lighting_result_owner_check" CHECK (
    ("inspection_id" IS NOT NULL AND "inspection_revision_id" IS NULL) OR
    ("inspection_id" IS NULL AND "inspection_revision_id" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "emergency_lighting_systems_asset_id_key" ON "emergency_lighting_systems"("asset_id");
CREATE INDEX "emergency_lighting_systems_organisation_id_idx" ON "emergency_lighting_systems"("organisation_id");
CREATE UNIQUE INDEX "emergency_lighting_locations_system_id_name_key" ON "emergency_lighting_locations"("system_id", "name");
CREATE INDEX "emergency_lighting_locations_organisation_id_system_id_idx" ON "emergency_lighting_locations"("organisation_id", "system_id");
CREATE UNIQUE INDEX "emergency_lighting_groups_system_id_name_key" ON "emergency_lighting_groups"("system_id", "name");
CREATE INDEX "emergency_lighting_groups_organisation_id_system_id_idx" ON "emergency_lighting_groups"("organisation_id", "system_id");
CREATE UNIQUE INDEX "emergency_lighting_keyswitches_system_id_reference_key" ON "emergency_lighting_keyswitches"("system_id", "reference");
CREATE INDEX "emergency_lighting_keyswitches_organisation_id_system_id_idx" ON "emergency_lighting_keyswitches"("organisation_id", "system_id");
CREATE INDEX "emergency_lighting_keyswitch_groups_group_id_idx" ON "emergency_lighting_keyswitch_groups"("group_id");
CREATE UNIQUE INDEX "emergency_lighting_fittings_system_id_reference_key" ON "emergency_lighting_fittings"("system_id", "reference");
CREATE INDEX "emergency_lighting_fittings_organisation_id_system_id_status_reference_idx" ON "emergency_lighting_fittings"("organisation_id", "system_id", "status", "reference");
CREATE INDEX "emergency_lighting_fittings_organisation_id_location_id_idx" ON "emergency_lighting_fittings"("organisation_id", "location_id");
CREATE INDEX "emergency_lighting_fitting_groups_group_id_idx" ON "emergency_lighting_fitting_groups"("group_id");
CREATE UNIQUE INDEX "emergency_lighting_fitting_results_inspection_id_fitting_id_key" ON "emergency_lighting_fitting_results"("inspection_id", "fitting_id");
CREATE UNIQUE INDEX "emergency_lighting_fitting_results_inspection_revision_id_fitting_id_key" ON "emergency_lighting_fitting_results"("inspection_revision_id", "fitting_id");
CREATE INDEX "el_fitting_results_draft_idx" ON "emergency_lighting_fitting_results"("organisation_id", "inspection_id");
CREATE INDEX "el_fitting_results_revision_idx" ON "emergency_lighting_fitting_results"("organisation_id", "inspection_revision_id");

ALTER TABLE "emergency_lighting_systems" ADD CONSTRAINT "emergency_lighting_systems_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "emergency_lighting_systems" ADD CONSTRAINT "emergency_lighting_systems_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "emergency_lighting_locations" ADD CONSTRAINT "emergency_lighting_locations_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "emergency_lighting_locations" ADD CONSTRAINT "emergency_lighting_locations_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "emergency_lighting_systems"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "emergency_lighting_groups" ADD CONSTRAINT "emergency_lighting_groups_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "emergency_lighting_groups" ADD CONSTRAINT "emergency_lighting_groups_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "emergency_lighting_systems"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "emergency_lighting_keyswitches" ADD CONSTRAINT "emergency_lighting_keyswitches_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "emergency_lighting_keyswitches" ADD CONSTRAINT "emergency_lighting_keyswitches_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "emergency_lighting_systems"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "emergency_lighting_keyswitches" ADD CONSTRAINT "emergency_lighting_keyswitches_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "emergency_lighting_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "emergency_lighting_keyswitch_groups" ADD CONSTRAINT "emergency_lighting_keyswitch_groups_keyswitch_id_fkey" FOREIGN KEY ("keyswitch_id") REFERENCES "emergency_lighting_keyswitches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "emergency_lighting_keyswitch_groups" ADD CONSTRAINT "emergency_lighting_keyswitch_groups_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "emergency_lighting_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "emergency_lighting_fittings" ADD CONSTRAINT "emergency_lighting_fittings_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "emergency_lighting_fittings" ADD CONSTRAINT "emergency_lighting_fittings_system_id_fkey" FOREIGN KEY ("system_id") REFERENCES "emergency_lighting_systems"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "emergency_lighting_fittings" ADD CONSTRAINT "emergency_lighting_fittings_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "emergency_lighting_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "emergency_lighting_fitting_groups" ADD CONSTRAINT "emergency_lighting_fitting_groups_fitting_id_fkey" FOREIGN KEY ("fitting_id") REFERENCES "emergency_lighting_fittings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "emergency_lighting_fitting_groups" ADD CONSTRAINT "emergency_lighting_fitting_groups_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "emergency_lighting_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "emergency_lighting_fitting_results" ADD CONSTRAINT "emergency_lighting_fitting_results_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "emergency_lighting_fitting_results" ADD CONSTRAINT "emergency_lighting_fitting_results_fitting_id_fkey" FOREIGN KEY ("fitting_id") REFERENCES "emergency_lighting_fittings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "emergency_lighting_fitting_results" ADD CONSTRAINT "emergency_lighting_fitting_results_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "emergency_lighting_fitting_results" ADD CONSTRAINT "emergency_lighting_fitting_results_inspection_revision_id_fkey" FOREIGN KEY ("inspection_revision_id") REFERENCES "inspection_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "emergency_lighting_systems" ("organisation_id", "asset_id", "updated_at")
SELECT "organisation_id", "id", CURRENT_TIMESTAMP
FROM "assets"
WHERE "asset_type" ~* 'emergency[[:space:]]*lighting'
ON CONFLICT ("asset_id") DO NOTHING;

INSERT INTO "capabilities" ("id", "key") VALUES
  (gen_random_uuid(), 'emergency-lighting.assets.read'),
  (gen_random_uuid(), 'emergency-lighting.assets.manage'),
  (gen_random_uuid(), 'emergency-lighting.inspections.perform'),
  (gen_random_uuid(), 'emergency-lighting.certificates.issue')
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "role_capabilities" ("role_id", "capability_id")
SELECT r."id", c."id" FROM "roles" r JOIN "capabilities" c ON (
  (c."key" = 'emergency-lighting.assets.read' AND r."key" IN ('organisation-owner','organisation-administrator','contract-manager','office-administrator','engineer','read-only')) OR
  (c."key" = 'emergency-lighting.assets.manage' AND r."key" IN ('organisation-owner','organisation-administrator','contract-manager','office-administrator')) OR
  (c."key" = 'emergency-lighting.inspections.perform' AND r."key" IN ('organisation-owner','organisation-administrator','engineer')) OR
  (c."key" = 'emergency-lighting.certificates.issue' AND r."key" IN ('organisation-owner','organisation-administrator','contract-manager'))
) ON CONFLICT DO NOTHING;

UPDATE "module_definitions" SET "capabilities" = '["emergency-lighting.assets.read","emergency-lighting.assets.manage","emergency-lighting.inspections.perform","emergency-lighting.certificates.issue"]'::jsonb, "updated_at" = CURRENT_TIMESTAMP WHERE "key" = 'emergency-lighting';
