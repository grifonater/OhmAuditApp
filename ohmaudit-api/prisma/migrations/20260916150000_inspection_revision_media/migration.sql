ALTER TABLE "inspection_revisions"
ADD COLUMN "signature_source_revision_id" UUID;

ALTER TABLE "inspection_revisions"
ADD CONSTRAINT "inspection_revisions_signature_source_revision_id_fkey"
FOREIGN KEY ("signature_source_revision_id") REFERENCES "inspection_revisions"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "inspection_revision_media" (
  "inspection_revision_id" UUID NOT NULL,
  "media_id" UUID NOT NULL,
  "organisation_id" UUID NOT NULL,
  "defect_id" UUID,
  "category" TEXT NOT NULL,
  "caption" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inspection_revision_media_pkey" PRIMARY KEY ("inspection_revision_id", "media_id"),
  CONSTRAINT "inspection_revision_media_inspection_revision_id_fkey"
    FOREIGN KEY ("inspection_revision_id") REFERENCES "inspection_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "inspection_revision_media_media_id_fkey"
    FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inspection_revision_media_organisation_id_fkey"
    FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "inspection_revision_media_organisation_id_media_id_idx"
ON "inspection_revision_media"("organisation_id", "media_id");
CREATE INDEX "inspection_revision_media_inspection_revision_id_defect_id_idx"
ON "inspection_revision_media"("inspection_revision_id", "defect_id");

-- Snapshot current finding membership before mutable records can be edited.
INSERT INTO "inspection_revision_media" (
  "inspection_revision_id", "media_id", "organisation_id", "defect_id", "category", "caption", "sort_order"
)
SELECT revision."id", media."id", revision."organisation_id", defect."id", media."category", media."caption", media."sort_order"
FROM "inspection_revisions" revision
JOIN "inspections" inspection
  ON inspection."id" = revision."inspection_id"
 AND inspection."current_revision_number" = revision."revision_number"
JOIN "defects" defect ON defect."inspection_id" = inspection."id"
JOIN LATERAL jsonb_array_elements_text(defect."photo_media_ids") media_id ON true
JOIN "media" media ON media."id"::text = media_id AND media."organisation_id" = revision."organisation_id"
ON CONFLICT DO NOTHING;

-- Remaining inspection-scoped images are general evidence for the current revision.
INSERT INTO "inspection_revision_media" (
  "inspection_revision_id", "media_id", "organisation_id", "category", "caption", "sort_order"
)
SELECT revision."id", media."id", revision."organisation_id", media."category", media."caption", media."sort_order"
FROM "inspection_revisions" revision
JOIN "inspections" inspection
  ON inspection."id" = revision."inspection_id"
 AND inspection."current_revision_number" = revision."revision_number"
JOIN "media" media
  ON media."organisation_id" = revision."organisation_id"
 AND media."status" = 'AVAILABLE'
 AND (
   (media."entity_type" = 'Inspection' AND media."entity_id" = inspection."id")
   OR (inspection."asset_id" IS NOT NULL AND media."entity_type" = 'Asset'
       AND media."entity_id" = inspection."asset_id"
       AND media."tags" @> ARRAY['inspection:' || inspection."id"::text]::text[])
 )
ON CONFLICT DO NOTHING;
