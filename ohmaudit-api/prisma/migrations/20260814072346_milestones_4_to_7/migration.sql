-- CreateEnum
CREATE TYPE "ScheduleOccurrenceStatus" AS ENUM ('FUTURE', 'UPCOMING', 'DUE', 'OVERDUE', 'COMPLETED', 'SKIPPED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "NotificationEventStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'SUBMITTED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VisitTaskStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'SUBMITTED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InspectionStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "DefectSeverity" AS ENUM ('ADVISORY', 'MINOR', 'MAJOR', 'DANGEROUS');

-- CreateEnum
CREATE TYPE "DefectStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "SyncMutationStatus" AS ENUM ('PENDING', 'APPLIED', 'CONFLICT', 'REJECTED');

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "inspection_revision_id" UUID,
ADD COLUMN     "snapshot" JSONB,
ADD COLUMN     "template_key" TEXT,
ADD COLUMN     "template_version" INTEGER;

-- CreateTable
CREATE TABLE "schedule_rules" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "customer_id" UUID,
    "site_id" UUID NOT NULL,
    "asset_id" UUID,
    "title" TEXT NOT NULL,
    "module_key" TEXT NOT NULL,
    "frequency_months" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "notification_lead_days" INTEGER NOT NULL DEFAULT 30,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_occurrences" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "schedule_rule_id" UUID NOT NULL,
    "due_date" DATE NOT NULL,
    "window_starts_at" DATE,
    "window_ends_at" DATE,
    "status" "ScheduleOccurrenceStatus" NOT NULL DEFAULT 'FUTURE',
    "completed_at" TIMESTAMP(3),
    "visit_id" UUID,
    "inspection_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_occurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "in_app_enabled" BOOLEAN NOT NULL DEFAULT true,
    "email_enabled" BOOLEAN NOT NULL DEFAULT true,
    "default_lead_days" INTEGER NOT NULL DEFAULT 30,
    "overdue_reminders" BOOLEAN NOT NULL DEFAULT true,
    "inspection_submitted" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_events" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "schedule_occurrence_id" UUID,
    "event_type" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "recipient" TEXT,
    "dedupe_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "NotificationEventStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visits" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "reference" TEXT,
    "title" TEXT NOT NULL,
    "scheduled_start" TIMESTAMP(3) NOT NULL,
    "scheduled_end" TIMESTAMP(3),
    "status" "VisitStatus" NOT NULL DEFAULT 'DRAFT',
    "assigned_user_id" UUID,
    "guest_engineer_name" TEXT,
    "guest_email" TEXT,
    "guest_mobile" TEXT,
    "engineer_notes" TEXT,
    "submitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_tasks" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "visit_id" UUID NOT NULL,
    "asset_id" UUID,
    "module_key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "VisitTaskStatus" NOT NULL DEFAULT 'PENDING',
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visit_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guest_access_tokens" (
    "id" UUID NOT NULL,
    "visit_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guest_access_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspections" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "visit_id" UUID,
    "visit_task_id" UUID,
    "customer_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "asset_id" UUID,
    "module_key" TEXT NOT NULL,
    "inspection_type" TEXT NOT NULL,
    "status" "InspectionStatus" NOT NULL DEFAULT 'DRAFT',
    "current_revision_number" INTEGER NOT NULL DEFAULT 0,
    "effective_date" DATE,
    "submitted_at" TIMESTAMP(3),
    "reviewed_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "reviewed_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_revisions" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "inspection_id" UUID NOT NULL,
    "revision_number" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "validation" JSONB NOT NULL DEFAULT '{}',
    "snapshots" JSONB NOT NULL DEFAULT '{}',
    "created_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspection_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_signatures" (
    "id" UUID NOT NULL,
    "inspection_revision_id" UUID NOT NULL,
    "signer_name" TEXT NOT NULL,
    "signer_role" TEXT NOT NULL,
    "signature_data" TEXT NOT NULL,
    "signed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspection_signatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "defects" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "inspection_id" UUID NOT NULL,
    "asset_id" UUID,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severity" "DefectSeverity" NOT NULL,
    "status" "DefectStatus" NOT NULL DEFAULT 'OPEN',
    "photo_media_ids" JSONB NOT NULL DEFAULT '[]',
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "defects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_field_definitions" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "module_key" TEXT NOT NULL,
    "field_key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "data_type" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "configuration" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_field_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_templates" (
    "id" UUID NOT NULL,
    "organisation_id" UUID,
    "module_key" TEXT NOT NULL,
    "document_type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "html_template" TEXT NOT NULL,
    "css_template" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_mutations" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "visit_id" UUID NOT NULL,
    "client_mutation_id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "base_version" INTEGER,
    "status" "SyncMutationStatus" NOT NULL DEFAULT 'PENDING',
    "result" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_at" TIMESTAMP(3),

    CONSTRAINT "sync_mutations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposed_asset_changes" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "inspection_id" UUID,
    "proposed_data" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proposed_asset_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ev_charge_points" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "charge_point_id" TEXT,
    "operator_name" TEXT,
    "firmware_version" TEXT,
    "installation_date" DATE,
    "nominal_voltage" INTEGER,
    "phase_count" INTEGER,
    "maximum_power_kw" DECIMAL(8,2),
    "location_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ev_charge_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ev_supplies" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "charge_point_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "phase_count" INTEGER NOT NULL DEFAULT 1,
    "protective_device_type" TEXT,
    "protective_device_rating" INTEGER,
    "rcd_type" TEXT,
    "earthing_arrangement" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ev_supplies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ev_connectors" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "charge_point_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "connector_type" TEXT NOT NULL,
    "maximum_power_kw" DECIMAL(8,2),
    "serial_number" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ev_connectors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ev_connector_supplies" (
    "connector_id" UUID NOT NULL,
    "supply_id" UUID NOT NULL,

    CONSTRAINT "ev_connector_supplies_pkey" PRIMARY KEY ("connector_id","supply_id")
);

-- CreateTable
CREATE TABLE "ev_inspection_data" (
    "id" UUID NOT NULL,
    "inspection_revision_id" UUID NOT NULL,
    "stable_details" JSONB NOT NULL DEFAULT '{}',
    "supply_tests" JSONB NOT NULL DEFAULT '[]',
    "connector_tests" JSONB NOT NULL DEFAULT '[]',
    "functional_checks" JSONB NOT NULL DEFAULT '{}',
    "engineer_observations" TEXT,

    CONSTRAINT "ev_inspection_data_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "schedule_rules_organisation_id_active_idx" ON "schedule_rules"("organisation_id", "active");

-- CreateIndex
CREATE INDEX "schedule_rules_organisation_id_site_id_idx" ON "schedule_rules"("organisation_id", "site_id");

-- CreateIndex
CREATE INDEX "schedule_occurrences_organisation_id_due_date_status_idx" ON "schedule_occurrences"("organisation_id", "due_date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_occurrences_schedule_rule_id_due_date_key" ON "schedule_occurrences"("schedule_rule_id", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_organisation_id_key" ON "notification_preferences"("organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_events_dedupe_key_key" ON "notification_events"("dedupe_key");

-- CreateIndex
CREATE INDEX "notification_events_organisation_id_status_available_at_idx" ON "notification_events"("organisation_id", "status", "available_at");

-- CreateIndex
CREATE INDEX "visits_organisation_id_scheduled_start_status_idx" ON "visits"("organisation_id", "scheduled_start", "status");

-- CreateIndex
CREATE INDEX "visits_organisation_id_assigned_user_id_idx" ON "visits"("organisation_id", "assigned_user_id");

-- CreateIndex
CREATE INDEX "visit_tasks_organisation_id_visit_id_idx" ON "visit_tasks"("organisation_id", "visit_id");

-- CreateIndex
CREATE UNIQUE INDEX "guest_access_tokens_token_hash_key" ON "guest_access_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "guest_access_tokens_visit_id_expires_at_idx" ON "guest_access_tokens"("visit_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "inspections_visit_task_id_key" ON "inspections"("visit_task_id");

-- CreateIndex
CREATE INDEX "inspections_organisation_id_status_created_at_idx" ON "inspections"("organisation_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "inspections_organisation_id_site_id_idx" ON "inspections"("organisation_id", "site_id");

-- CreateIndex
CREATE INDEX "inspection_revisions_organisation_id_created_at_idx" ON "inspection_revisions"("organisation_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "inspection_revisions_inspection_id_revision_number_key" ON "inspection_revisions"("inspection_id", "revision_number");

-- CreateIndex
CREATE INDEX "inspection_signatures_inspection_revision_id_idx" ON "inspection_signatures"("inspection_revision_id");

-- CreateIndex
CREATE INDEX "defects_organisation_id_status_severity_idx" ON "defects"("organisation_id", "status", "severity");

-- CreateIndex
CREATE UNIQUE INDEX "custom_field_definitions_organisation_id_module_key_field_k_key" ON "custom_field_definitions"("organisation_id", "module_key", "field_key");

-- CreateIndex
CREATE INDEX "report_templates_module_key_document_type_active_idx" ON "report_templates"("module_key", "document_type", "active");

-- CreateIndex
CREATE UNIQUE INDEX "report_templates_organisation_id_module_key_document_type_v_key" ON "report_templates"("organisation_id", "module_key", "document_type", "version");

-- CreateIndex
CREATE INDEX "sync_mutations_organisation_id_visit_id_status_idx" ON "sync_mutations"("organisation_id", "visit_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "sync_mutations_organisation_id_client_mutation_id_key" ON "sync_mutations"("organisation_id", "client_mutation_id");

-- CreateIndex
CREATE INDEX "proposed_asset_changes_organisation_id_status_idx" ON "proposed_asset_changes"("organisation_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ev_charge_points_asset_id_key" ON "ev_charge_points"("asset_id");

-- CreateIndex
CREATE INDEX "ev_charge_points_organisation_id_idx" ON "ev_charge_points"("organisation_id");

-- CreateIndex
CREATE INDEX "ev_supplies_organisation_id_charge_point_id_idx" ON "ev_supplies"("organisation_id", "charge_point_id");

-- CreateIndex
CREATE INDEX "ev_connectors_organisation_id_charge_point_id_idx" ON "ev_connectors"("organisation_id", "charge_point_id");

-- CreateIndex
CREATE UNIQUE INDEX "ev_inspection_data_inspection_revision_id_key" ON "ev_inspection_data"("inspection_revision_id");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_inspection_revision_id_fkey" FOREIGN KEY ("inspection_revision_id") REFERENCES "inspection_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_rules" ADD CONSTRAINT "schedule_rules_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_rules" ADD CONSTRAINT "schedule_rules_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_rules" ADD CONSTRAINT "schedule_rules_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_rules" ADD CONSTRAINT "schedule_rules_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_occurrences" ADD CONSTRAINT "schedule_occurrences_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_occurrences" ADD CONSTRAINT "schedule_occurrences_schedule_rule_id_fkey" FOREIGN KEY ("schedule_rule_id") REFERENCES "schedule_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_events" ADD CONSTRAINT "notification_events_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_events" ADD CONSTRAINT "notification_events_schedule_occurrence_id_fkey" FOREIGN KEY ("schedule_occurrence_id") REFERENCES "schedule_occurrences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_tasks" ADD CONSTRAINT "visit_tasks_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_tasks" ADD CONSTRAINT "visit_tasks_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_tasks" ADD CONSTRAINT "visit_tasks_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guest_access_tokens" ADD CONSTRAINT "guest_access_tokens_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_visit_task_id_fkey" FOREIGN KEY ("visit_task_id") REFERENCES "visit_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_revisions" ADD CONSTRAINT "inspection_revisions_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_revisions" ADD CONSTRAINT "inspection_revisions_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "inspections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_signatures" ADD CONSTRAINT "inspection_signatures_inspection_revision_id_fkey" FOREIGN KEY ("inspection_revision_id") REFERENCES "inspection_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defects" ADD CONSTRAINT "defects_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defects" ADD CONSTRAINT "defects_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "inspections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defects" ADD CONSTRAINT "defects_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_field_definitions" ADD CONSTRAINT "custom_field_definitions_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_templates" ADD CONSTRAINT "report_templates_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_mutations" ADD CONSTRAINT "sync_mutations_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_mutations" ADD CONSTRAINT "sync_mutations_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposed_asset_changes" ADD CONSTRAINT "proposed_asset_changes_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposed_asset_changes" ADD CONSTRAINT "proposed_asset_changes_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ev_charge_points" ADD CONSTRAINT "ev_charge_points_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ev_charge_points" ADD CONSTRAINT "ev_charge_points_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ev_supplies" ADD CONSTRAINT "ev_supplies_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ev_supplies" ADD CONSTRAINT "ev_supplies_charge_point_id_fkey" FOREIGN KEY ("charge_point_id") REFERENCES "ev_charge_points"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ev_connectors" ADD CONSTRAINT "ev_connectors_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ev_connectors" ADD CONSTRAINT "ev_connectors_charge_point_id_fkey" FOREIGN KEY ("charge_point_id") REFERENCES "ev_charge_points"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ev_connector_supplies" ADD CONSTRAINT "ev_connector_supplies_connector_id_fkey" FOREIGN KEY ("connector_id") REFERENCES "ev_connectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ev_connector_supplies" ADD CONSTRAINT "ev_connector_supplies_supply_id_fkey" FOREIGN KEY ("supply_id") REFERENCES "ev_supplies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ev_inspection_data" ADD CONSTRAINT "ev_inspection_data_inspection_revision_id_fkey" FOREIGN KEY ("inspection_revision_id") REFERENCES "inspection_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "organisation_accreditations_organisation_id_scheme_registration" RENAME TO "organisation_accreditations_organisation_id_scheme_registra_key";
