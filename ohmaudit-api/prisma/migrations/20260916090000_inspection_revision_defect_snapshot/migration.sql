ALTER TABLE "inspection_revisions"
ADD COLUMN "defect_snapshot" JSONB;

-- Only the current revision can be matched safely to the mutable defect table.
-- Historical revisions remain NULL and continue to use the legacy fallback.
UPDATE "inspection_revisions" AS revision
SET "defect_snapshot" = COALESCE(
  (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', defect."id",
        'assetId', defect."asset_id",
        'title', defect."title",
        'description', defect."description",
        'category', defect."category",
        'severity', defect."severity",
        'status', defect."status",
        'photoMediaIds', defect."photo_media_ids",
        'resolvedAt', defect."resolved_at"
      )
      ORDER BY defect."created_at", defect."id"
    )
    FROM "defects" AS defect
    WHERE defect."inspection_id" = revision."inspection_id"
  ),
  '[]'::jsonb
)
FROM "inspections" AS inspection
WHERE inspection."id" = revision."inspection_id"
  AND inspection."current_revision_number" = revision."revision_number";
