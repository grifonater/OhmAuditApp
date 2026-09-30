CREATE TABLE "site_contacts" (
  "site_id" UUID NOT NULL,
  "contact_id" UUID NOT NULL,
  "primary" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "site_contacts_pkey" PRIMARY KEY ("site_id", "contact_id")
);

INSERT INTO "site_contacts" ("site_id", "contact_id", "primary", "created_at")
SELECT "site_id", "id", "primary", "created_at"
FROM "contacts"
WHERE "site_id" IS NOT NULL;

CREATE INDEX "site_contacts_contact_id_idx" ON "site_contacts"("contact_id");

ALTER TABLE "site_contacts" ADD CONSTRAINT "site_contacts_site_id_fkey"
  FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "site_contacts" ADD CONSTRAINT "site_contacts_contact_id_fkey"
  FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep contacts.site_id for one release so the currently active API remains compatible
-- while this migration runs before the new Worker version is deployed.
