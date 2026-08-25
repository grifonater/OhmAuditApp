CREATE TABLE "platform_support_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "platform_admin_user_id" UUID NOT NULL,
    "target_user_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_support_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "platform_support_sessions_token_hash_key"
ON "platform_support_sessions"("token_hash");

CREATE INDEX "platform_support_sessions_platform_admin_user_id_expires_at_idx"
ON "platform_support_sessions"("platform_admin_user_id", "expires_at");

CREATE INDEX "platform_support_sessions_organisation_id_target_user_id_idx"
ON "platform_support_sessions"("organisation_id", "target_user_id");

ALTER TABLE "platform_support_sessions"
ADD CONSTRAINT "platform_support_sessions_platform_admin_user_id_fkey"
FOREIGN KEY ("platform_admin_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "platform_support_sessions"
ADD CONSTRAINT "platform_support_sessions_target_user_id_fkey"
FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "platform_support_sessions"
ADD CONSTRAINT "platform_support_sessions_organisation_id_fkey"
FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "module_definitions" (
    "id", "key", "name", "description", "display_order", "active", "capabilities", "created_at", "updated_at"
)
VALUES (
    gen_random_uuid(),
    'thermal-imaging',
    'Thermal Imaging',
    'Thermal surveys, paired image galleries, findings and client reports.',
    1,
    TRUE,
    '["thermal.inspections.perform","thermal.reports.issue","thermal.equipment.manage"]'::jsonb,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("key") DO UPDATE SET
    "name" = EXCLUDED."name",
    "description" = EXCLUDED."description",
    "display_order" = EXCLUDED."display_order",
    "active" = TRUE,
    "capabilities" = EXCLUDED."capabilities",
    "updated_at" = CURRENT_TIMESTAMP;
