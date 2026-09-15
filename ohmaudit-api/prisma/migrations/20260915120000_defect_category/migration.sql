CREATE TYPE "DefectCategory" AS ENUM ('ADVICE', 'NOTE', 'FAULT', 'CONDITION');

ALTER TABLE "defects"
ADD COLUMN "category" "DefectCategory" NOT NULL DEFAULT 'FAULT';
