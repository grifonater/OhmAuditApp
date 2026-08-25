ALTER TABLE "ev_charge_points"
ADD COLUMN "dc_rcd_type" TEXT;

ALTER TABLE "ev_supplies"
DROP COLUMN "rcd_type";

ALTER TABLE "ev_connectors"
DROP COLUMN "maximum_power_kw",
DROP COLUMN "serial_number";

CREATE INDEX "proposed_asset_changes_inspection_id_idx"
ON "proposed_asset_changes"("inspection_id");

ALTER TABLE "proposed_asset_changes"
ADD CONSTRAINT "proposed_asset_changes_inspection_id_fkey"
FOREIGN KEY ("inspection_id") REFERENCES "inspections"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
