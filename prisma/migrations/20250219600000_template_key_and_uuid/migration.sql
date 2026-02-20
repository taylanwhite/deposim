-- Add stable key for templates (e.g. "default")
ALTER TABLE "deposition_templates" ADD COLUMN "key" TEXT;

-- Backfill key from existing id (previously id was often "default" or a uuid string)
UPDATE "deposition_templates"
SET "key" = "id"
WHERE "key" IS NULL;

-- Convert the legacy default template id ("default") into a uuid, keeping key="default"
-- Persona foreign key has ON UPDATE CASCADE; case.template_id does not, so we update cases below.
UPDATE "deposition_templates"
SET "id" = gen_random_uuid()::text
WHERE "key" = 'default' AND "id" = 'default';

-- Update cases.template_id to point at the new uuid id when it still uses the legacy key
UPDATE "cases" c
SET "template_id" = dt."id"
FROM "deposition_templates" dt
WHERE c."template_id" IS NOT NULL
  AND c."template_id" = dt."key";

-- Enforce constraints
ALTER TABLE "deposition_templates" ALTER COLUMN "key" SET NOT NULL;
ALTER TABLE "deposition_templates" ADD CONSTRAINT "deposition_templates_key_key" UNIQUE ("key");

