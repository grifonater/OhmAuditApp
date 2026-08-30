CREATE TABLE "rams_requirement_defaults" (
    "organisation_id" UUID NOT NULL,
    "ppe" JSONB NOT NULL,
    "tools" JSONB NOT NULL,
    "competencies" JSONB NOT NULL,
    "emergency_arrangements" JSONB NOT NULL,
    "welfare" JSONB NOT NULL,
    "plant" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "rams_requirement_defaults_pkey" PRIMARY KEY ("organisation_id")
);

ALTER TABLE "rams_requirement_defaults" ADD CONSTRAINT "rams_requirement_defaults_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "rams_requirement_defaults" (
    "organisation_id",
    "ppe",
    "tools",
    "competencies",
    "emergency_arrangements",
    "welfare",
    "plant",
    "updated_at"
)
SELECT
    "id",
    '["Safety footwear","High-visibility clothing"]'::jsonb,
    '["Suitable, inspected tools and equipment for the task"]'::jsonb,
    '["Competent and authorised for the assigned work"]'::jsonb,
    '["Stop work, make the area safe and follow the site emergency procedure"]'::jsonb,
    '["Confirm suitable welfare facilities before work starts"]'::jsonb,
    '["Only trained and authorised persons may operate plant and machinery"]'::jsonb,
    CURRENT_TIMESTAMP
FROM "organisations";
