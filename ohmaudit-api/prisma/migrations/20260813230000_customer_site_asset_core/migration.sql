CREATE TYPE "RecordStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
CREATE TYPE "AssetStatus" AS ENUM ('PROPOSED', 'ACTIVE', 'INACTIVE', 'REMOVED', 'DECOMMISSIONED', 'REPLACED');
CREATE TYPE "AssetModelStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "MediaStatus" AS ENUM ('PENDING_UPLOAD', 'AVAILABLE', 'QUARANTINED', 'ARCHIVED');

CREATE TABLE "customers" ("id" UUID NOT NULL, "organisation_id" UUID NOT NULL, "name" TEXT NOT NULL, "reference" TEXT, "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE', "logo_media_id" UUID, "internal_notes" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "customers_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "customers_organisation_id_reference_key" ON "customers"("organisation_id", "reference");
CREATE INDEX "customers_organisation_id_status_name_idx" ON "customers"("organisation_id", "status", "name");

CREATE TABLE "sites" ("id" UUID NOT NULL, "organisation_id" UUID NOT NULL, "customer_id" UUID NOT NULL, "name" TEXT NOT NULL, "reference" TEXT, "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE', "address_line_1" TEXT, "address_line_2" TEXT, "city" TEXT, "county" TEXT, "postcode" TEXT, "country_code" TEXT NOT NULL DEFAULT 'GB', "latitude" DECIMAL(9,6), "longitude" DECIMAL(9,6), "location_accuracy" DECIMAL(8,2), "parking_information" TEXT, "access_instructions" TEXT, "opening_times" TEXT, "ppe_requirements" TEXT, "induction_information" TEXT, "internal_notes" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "sites_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "sites_organisation_id_reference_key" ON "sites"("organisation_id", "reference");
CREATE INDEX "sites_organisation_id_customer_id_status_idx" ON "sites"("organisation_id", "customer_id", "status");
CREATE INDEX "sites_organisation_id_postcode_idx" ON "sites"("organisation_id", "postcode");

CREATE TABLE "contacts" ("id" UUID NOT NULL, "organisation_id" UUID NOT NULL, "customer_id" UUID, "site_id" UUID, "name" TEXT NOT NULL, "role" TEXT, "email" TEXT, "telephone" TEXT, "mobile" TEXT, "primary" BOOLEAN NOT NULL DEFAULT false, "notes" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "contacts_pkey" PRIMARY KEY ("id"));
CREATE INDEX "contacts_organisation_id_customer_id_idx" ON "contacts"("organisation_id", "customer_id");
CREATE INDEX "contacts_organisation_id_site_id_idx" ON "contacts"("organisation_id", "site_id");

CREATE TABLE "asset_models" ("id" UUID NOT NULL, "manufacturer" TEXT NOT NULL, "model" TEXT NOT NULL, "category" TEXT NOT NULL, "status" "AssetModelStatus" NOT NULL DEFAULT 'DRAFT', "stock_image_media_id" UUID, "technical_notes" TEXT, "metadata" JSONB NOT NULL DEFAULT '{}', "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "asset_models_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "asset_models_manufacturer_model_category_key" ON "asset_models"("manufacturer", "model", "category");
CREATE INDEX "asset_models_status_category_idx" ON "asset_models"("status", "category");

CREATE TABLE "assets" ("id" UUID NOT NULL, "organisation_id" UUID NOT NULL, "customer_id" UUID NOT NULL, "site_id" UUID NOT NULL, "asset_model_id" UUID, "asset_type" TEXT NOT NULL, "asset_reference" TEXT NOT NULL, "display_name" TEXT NOT NULL, "manufacturer" TEXT, "model" TEXT, "serial_number" TEXT, "status" "AssetStatus" NOT NULL DEFAULT 'ACTIVE', "commissioned_at" DATE, "decommissioned_at" DATE, "replacement_asset_id" UUID, "latitude" DECIMAL(9,6), "longitude" DECIMAL(9,6), "location_accuracy" DECIMAL(8,2), "location_captured_at" TIMESTAMP(3), "location_source" TEXT, "notes" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "assets_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "assets_organisation_id_asset_reference_key" ON "assets"("organisation_id", "asset_reference");
CREATE INDEX "assets_organisation_id_site_id_status_idx" ON "assets"("organisation_id", "site_id", "status");
CREATE INDEX "assets_organisation_id_serial_number_idx" ON "assets"("organisation_id", "serial_number");
CREATE INDEX "assets_organisation_id_manufacturer_model_idx" ON "assets"("organisation_id", "manufacturer", "model");

CREATE TABLE "tags" ("id" UUID NOT NULL, "organisation_id" UUID NOT NULL, "name" TEXT NOT NULL, "colour" TEXT NOT NULL DEFAULT '#526D82', "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "tags_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "tags_organisation_id_name_key" ON "tags"("organisation_id", "name");
CREATE INDEX "tags_organisation_id_idx" ON "tags"("organisation_id");
CREATE TABLE "entity_tags" ("organisation_id" UUID NOT NULL, "tag_id" UUID NOT NULL, "entity_type" TEXT NOT NULL, "entity_id" UUID NOT NULL, CONSTRAINT "entity_tags_pkey" PRIMARY KEY ("tag_id", "entity_type", "entity_id"));
CREATE INDEX "entity_tags_organisation_id_entity_type_entity_id_idx" ON "entity_tags"("organisation_id", "entity_type", "entity_id");

CREATE TABLE "media" ("id" UUID NOT NULL, "organisation_id" UUID NOT NULL, "storage_key" TEXT NOT NULL, "entity_type" TEXT NOT NULL, "entity_id" UUID NOT NULL, "category" TEXT NOT NULL, "caption" TEXT, "captured_at" TIMESTAMP(3), "captured_by_user_id" UUID, "mime_type" TEXT NOT NULL, "width" INTEGER, "height" INTEGER, "size" INTEGER NOT NULL, "status" "MediaStatus" NOT NULL DEFAULT 'PENDING_UPLOAD', "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "media_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "media_storage_key_key" ON "media"("storage_key");
CREATE INDEX "media_organisation_id_entity_type_entity_id_idx" ON "media"("organisation_id", "entity_type", "entity_id");

CREATE TABLE "documents" ("id" UUID NOT NULL, "organisation_id" UUID NOT NULL, "entity_type" TEXT NOT NULL, "entity_id" UUID NOT NULL, "title" TEXT NOT NULL, "category" TEXT NOT NULL, "media_id" UUID, "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE', "issued_at" TIMESTAMP(3), "expires_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "documents_pkey" PRIMARY KEY ("id"));
CREATE INDEX "documents_organisation_id_entity_type_entity_id_idx" ON "documents"("organisation_id", "entity_type", "entity_id");
CREATE INDEX "documents_organisation_id_title_idx" ON "documents"("organisation_id", "title");

ALTER TABLE "customers" ADD CONSTRAINT "customers_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sites" ADD CONSTRAINT "sites_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sites" ADD CONSTRAINT "sites_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "assets" ADD CONSTRAINT "assets_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assets" ADD CONSTRAINT "assets_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assets" ADD CONSTRAINT "assets_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "assets" ADD CONSTRAINT "assets_asset_model_id_fkey" FOREIGN KEY ("asset_model_id") REFERENCES "asset_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "assets" ADD CONSTRAINT "assets_replacement_asset_id_fkey" FOREIGN KEY ("replacement_asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tags" ADD CONSTRAINT "tags_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "entity_tags" ADD CONSTRAINT "entity_tags_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "entity_tags" ADD CONSTRAINT "entity_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "media" ADD CONSTRAINT "media_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
