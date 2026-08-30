ALTER TABLE "rams_revisions"
ADD COLUMN "context_snapshot" JSONB NOT NULL DEFAULT '{}';
