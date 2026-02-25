-- PostgreSQL treats NULLs as distinct in unique indexes, so the existing
-- composite uniques on (organization_id, ...) do NOT prevent duplicates
-- when organization_id IS NULL.  Add partial indexes to cover that case.

-- Remove duplicate clients (same email, null org) keeping the newest
DELETE FROM "clients" a
  USING "clients" b
  WHERE a."organization_id" IS NULL
    AND b."organization_id" IS NULL
    AND a."email" IS NOT NULL
    AND a."email" = b."email"
    AND a."updated_at" < b."updated_at";

-- Remove duplicate clients (same name+phone, null org) keeping the newest
DELETE FROM "clients" a
  USING "clients" b
  WHERE a."organization_id" IS NULL
    AND b."organization_id" IS NULL
    AND a."phone" IS NOT NULL
    AND a."first_name" = b."first_name"
    AND a."last_name"  = b."last_name"
    AND a."phone"      = b."phone"
    AND a."updated_at" < b."updated_at";

-- Remove duplicate case numbers (null org) keeping the newest
DELETE FROM "cases" a
  USING "cases" b
  WHERE a."organization_id" IS NULL
    AND b."organization_id" IS NULL
    AND a."case_number" = b."case_number"
    AND a."updated_at" < b."updated_at";

-- Unique email when org is null
CREATE UNIQUE INDEX "clients_null_org_email_key"
  ON "clients"("email")
  WHERE "organization_id" IS NULL AND "email" IS NOT NULL;

-- Unique (first_name, last_name, phone) when org is null
CREATE UNIQUE INDEX "clients_null_org_name_phone_key"
  ON "clients"("first_name", "last_name", "phone")
  WHERE "organization_id" IS NULL AND "phone" IS NOT NULL;

-- Unique case_number when org is null
CREATE UNIQUE INDEX "cases_null_org_case_number_key"
  ON "cases"("case_number")
  WHERE "organization_id" IS NULL;
