-- CreateTable
CREATE TABLE "ev_test_instructions" (
    "id" UUID NOT NULL,
    "step" TEXT NOT NULL,
    "manufacturers" TEXT[] NOT NULL DEFAULT '{}',
    "title" TEXT NOT NULL,
    "steps" TEXT[] NOT NULL DEFAULT '{}',
    "notes" TEXT,
    "video_media_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ev_test_instructions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ev_test_instructions_step_idx" ON "ev_test_instructions"("step");