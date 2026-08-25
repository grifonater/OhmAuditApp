ALTER TABLE "inspection_revisions"
ADD COLUMN "client_mutation_id" TEXT;

CREATE UNIQUE INDEX "inspection_revisions_client_mutation_id_key"
ON "inspection_revisions"("client_mutation_id");
