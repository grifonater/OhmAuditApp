CREATE TYPE "EmailAuditStatus" AS ENUM (
  'PENDING',
  'SENT',
  'DELIVERED',
  'DEFERRED',
  'BOUNCED',
  'FAILED',
  'REJECTED',
  'COMPLAINED'
);

CREATE TABLE "email_audits" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "message_id" TEXT,
  "from_address" TEXT NOT NULL,
  "from_name" TEXT,
  "to_addresses" TEXT[] NOT NULL,
  "subject" TEXT NOT NULL,
  "status" "EmailAuditStatus" NOT NULL DEFAULT 'PENDING',
  "status_reason" TEXT,
  "smtp_status_code" TEXT,
  "smtp_enhanced_status" TEXT,
  "smtp_response" TEXT,
  "actor_user_id" UUID,
  "sent_at" TIMESTAMP(3),
  "delivered_at" TIMESTAMP(3),
  "failed_at" TIMESTAMP(3),
  "last_event_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "email_audits_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "email_audit_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "email_audit_id" UUID NOT NULL,
  "event_id" TEXT NOT NULL,
  "message_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "status" "EmailAuditStatus" NOT NULL,
  "reason" TEXT,
  "smtp_status_code" TEXT,
  "smtp_enhanced_status" TEXT,
  "smtp_response" TEXT,
  "metadata" JSONB NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "email_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email_audits_message_id_key" ON "email_audits"("message_id");
CREATE INDEX "email_audits_status_created_at_idx" ON "email_audits"("status", "created_at");
CREATE INDEX "email_audits_created_at_idx" ON "email_audits"("created_at");
CREATE INDEX "email_audits_actor_user_id_idx" ON "email_audits"("actor_user_id");
CREATE UNIQUE INDEX "email_audit_events_event_id_key" ON "email_audit_events"("event_id");
CREATE INDEX "email_audit_events_email_audit_id_occurred_at_idx" ON "email_audit_events"("email_audit_id", "occurred_at");
CREATE INDEX "email_audit_events_message_id_idx" ON "email_audit_events"("message_id");

ALTER TABLE "email_audits"
  ADD CONSTRAINT "email_audits_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "email_audit_events"
  ADD CONSTRAINT "email_audit_events_email_audit_id_fkey"
  FOREIGN KEY ("email_audit_id") REFERENCES "email_audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;
