CREATE TYPE "EntitlementStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');
CREATE TYPE "BillingProviderType" AS ENUM ('STRIPE');

CREATE TABLE "module_definitions" (
  "id" UUID NOT NULL,
  "key" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "display_order" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "capabilities" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "module_definitions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "module_definitions_key_key" ON "module_definitions"("key");

CREATE TABLE "organisation_module_entitlements" (
  "id" UUID NOT NULL,
  "organisation_id" UUID NOT NULL,
  "module_id" UUID NOT NULL,
  "status" "EntitlementStatus" NOT NULL DEFAULT 'TRIAL',
  "trial_started_at" TIMESTAMP(3),
  "trial_ends_at" TIMESTAMP(3),
  "current_period_ends_at" TIMESTAMP(3),
  "stripe_subscription_id" TEXT,
  "stripe_subscription_item_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "organisation_module_entitlements_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "organisation_module_entitlements_organisation_id_module_id_key" ON "organisation_module_entitlements"("organisation_id", "module_id");
CREATE INDEX "organisation_module_entitlements_organisation_id_status_idx" ON "organisation_module_entitlements"("organisation_id", "status");

CREATE TABLE "organisation_brand_profiles" (
  "id" UUID NOT NULL,
  "organisation_id" UUID NOT NULL,
  "trading_name" TEXT,
  "registered_name" TEXT,
  "address_line_1" TEXT,
  "address_line_2" TEXT,
  "city" TEXT,
  "county" TEXT,
  "postcode" TEXT,
  "country_code" TEXT NOT NULL DEFAULT 'GB',
  "telephone" TEXT,
  "email" TEXT,
  "website" TEXT,
  "primary_colour" TEXT NOT NULL DEFAULT '#006B66',
  "secondary_colour" TEXT NOT NULL DEFAULT '#243B53',
  "logo_media_id" UUID,
  "timezone" TEXT NOT NULL DEFAULT 'Europe/London',
  "date_format" TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
  "onboarding_step" TEXT NOT NULL DEFAULT 'organisation-details',
  "onboarding_completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "organisation_brand_profiles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "organisation_brand_profiles_organisation_id_key" ON "organisation_brand_profiles"("organisation_id");

CREATE TABLE "organisation_accreditations" (
  "id" UUID NOT NULL,
  "organisation_id" UUID NOT NULL,
  "scheme" TEXT NOT NULL,
  "registration_number" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "organisation_accreditations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "organisation_accreditations_organisation_id_scheme_registration_number_key" ON "organisation_accreditations"("organisation_id", "scheme", "registration_number");
CREATE INDEX "organisation_accreditations_organisation_id_idx" ON "organisation_accreditations"("organisation_id");

CREATE TABLE "organisation_invitations" (
  "id" UUID NOT NULL,
  "organisation_id" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "role_id" UUID NOT NULL,
  "token_hash" TEXT NOT NULL,
  "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
  "expires_at" TIMESTAMP(3) NOT NULL,
  "invited_by_user_id" UUID NOT NULL,
  "accepted_by_user_id" UUID,
  "accepted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "organisation_invitations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "organisation_invitations_token_hash_key" ON "organisation_invitations"("token_hash");
CREATE INDEX "organisation_invitations_organisation_id_status_idx" ON "organisation_invitations"("organisation_id", "status");
CREATE INDEX "organisation_invitations_email_status_idx" ON "organisation_invitations"("email", "status");

CREATE TABLE "billing_customers" (
  "id" UUID NOT NULL,
  "organisation_id" UUID NOT NULL,
  "provider" "BillingProviderType" NOT NULL DEFAULT 'STRIPE',
  "provider_customer_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "billing_customers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "billing_customers_organisation_id_key" ON "billing_customers"("organisation_id");
CREATE UNIQUE INDEX "billing_customers_provider_customer_id_key" ON "billing_customers"("provider_customer_id");

CREATE TABLE "billing_webhook_events" (
  "id" UUID NOT NULL,
  "provider" "BillingProviderType" NOT NULL DEFAULT 'STRIPE',
  "provider_event_id" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "processed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_webhook_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "billing_webhook_events_provider_provider_event_id_key" ON "billing_webhook_events"("provider", "provider_event_id");

ALTER TABLE "organisation_module_entitlements" ADD CONSTRAINT "organisation_module_entitlements_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organisation_module_entitlements" ADD CONSTRAINT "organisation_module_entitlements_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "module_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organisation_brand_profiles" ADD CONSTRAINT "organisation_brand_profiles_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organisation_accreditations" ADD CONSTRAINT "organisation_accreditations_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organisation_invitations" ADD CONSTRAINT "organisation_invitations_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organisation_invitations" ADD CONSTRAINT "organisation_invitations_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organisation_invitations" ADD CONSTRAINT "organisation_invitations_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organisation_invitations" ADD CONSTRAINT "organisation_invitations_accepted_by_user_id_fkey" FOREIGN KEY ("accepted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "billing_customers" ADD CONSTRAINT "billing_customers_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "capabilities" ("id", "key") VALUES (gen_random_uuid(), 'organisation.manage') ON CONFLICT ("key") DO NOTHING;
INSERT INTO "role_capabilities" ("role_id", "capability_id")
SELECT r."id", c."id" FROM "roles" r CROSS JOIN "capabilities" c
WHERE r."key" IN ('organisation-owner', 'organisation-administrator') AND c."key" = 'organisation.manage'
ON CONFLICT DO NOTHING;

INSERT INTO "module_definitions" ("id", "key", "name", "description", "display_order", "capabilities", "updated_at") VALUES
  (gen_random_uuid(), 'ev-charging', 'EV Charging', 'EV charger assets, inspections, tests, certificates and integrations.', 0, '["ev.assets.manage","ev.inspections.perform","ev.certificates.issue"]'::jsonb, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'emergency-lighting', 'Emergency Lighting', 'Lighting systems, fittings, functional and duration testing.', 1, '["emergency-lighting.assets.manage","emergency-lighting.inspections.perform"]'::jsonb, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'solar-pv', 'Solar PV', 'Solar systems, topology, inspections and test results.', 2, '["solar.assets.manage","solar.inspections.perform"]'::jsonb, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "organisation_module_entitlements" ("id", "organisation_id", "module_id", "status", "trial_started_at", "trial_ends_at", "updated_at")
SELECT gen_random_uuid(), o."id", m."id", 'TRIAL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + INTERVAL '30 days', CURRENT_TIMESTAMP
FROM "organisations" o CROSS JOIN "module_definitions" m
ON CONFLICT ("organisation_id", "module_id") DO NOTHING;

INSERT INTO "organisation_brand_profiles" ("id", "organisation_id", "trading_name", "updated_at")
SELECT gen_random_uuid(), o."id", o."name", CURRENT_TIMESTAMP FROM "organisations" o
ON CONFLICT ("organisation_id") DO NOTHING;
