DROP INDEX "assets_organisation_id_asset_reference_key";

CREATE UNIQUE INDEX "assets_organisation_id_site_id_asset_reference_key"
ON "assets"("organisation_id", "site_id", "asset_reference");
