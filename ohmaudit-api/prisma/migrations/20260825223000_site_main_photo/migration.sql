-- AlterTable: Add isPrimary to Media
ALTER TABLE "media" ADD COLUMN "is_primary" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: Add mainPhotoMediaId to Site
ALTER TABLE "sites" ADD COLUMN "main_photo_media_id" UUID;

-- CreateIndex: Create index on Media for primary lookups
CREATE INDEX "media_is_primary_idx" ON "media"("organisation_id", "entity_type", "entity_id", "is_primary") WHERE "is_primary" = true;
