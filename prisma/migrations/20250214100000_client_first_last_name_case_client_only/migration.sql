-- Client: add firstName, lastName; migrate from name; drop name
ALTER TABLE "clients" ADD COLUMN "first_name" TEXT;
ALTER TABLE "clients" ADD COLUMN "last_name" TEXT;

UPDATE "clients" SET
  "first_name" = COALESCE(SPLIT_PART(TRIM("name"), ' ', 1), "name"),
  "last_name" = CASE
    WHEN POSITION(' ' IN TRIM("name")) > 0
    THEN SUBSTRING(TRIM("name") FROM POSITION(' ' IN TRIM("name")) + 1)
    ELSE ''
  END
WHERE "name" IS NOT NULL AND "name" != '';

UPDATE "clients" SET "first_name" = 'Unknown', "last_name" = '' WHERE "first_name" IS NULL OR "last_name" IS NULL;
ALTER TABLE "clients" ALTER COLUMN "first_name" SET NOT NULL;
ALTER TABLE "clients" ALTER COLUMN "last_name" SET NOT NULL;

ALTER TABLE "clients" DROP COLUMN "name";

-- Ensure we have an organization for new clients
INSERT INTO organizations (id, name, created_at, updated_at)
SELECT gen_random_uuid()::text, 'Default', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM organizations LIMIT 1);

-- Case: create clients from existing case data, then drop person columns
DO $$
DECLARE
  r RECORD;
  org_id TEXT;
  new_client_id TEXT;
BEGIN
  org_id := (SELECT id FROM organizations LIMIT 1);
  
  FOR r IN SELECT c.id, c.first_name, c.last_name, c.phone, c.email FROM cases c WHERE c.client_id IS NULL
  LOOP
    INSERT INTO clients (id, organization_id, first_name, last_name, phone, email, consent_camera, consent_microphone, created_at, updated_at)
    VALUES (
      gen_random_uuid()::text,
      org_id,
      COALESCE(r.first_name, 'Unknown'),
      COALESCE(r.last_name, ''),
      COALESCE(r.phone, ''),
      r.email,
      false,
      false,
      NOW(),
      NOW()
    )
    RETURNING id INTO new_client_id;
    
    UPDATE cases SET client_id = new_client_id WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE "cases" DROP COLUMN IF EXISTS "first_name";
ALTER TABLE "cases" DROP COLUMN IF EXISTS "last_name";
ALTER TABLE "cases" DROP COLUMN IF EXISTS "phone";
ALTER TABLE "cases" DROP COLUMN IF EXISTS "email";

ALTER TABLE "cases" ALTER COLUMN "client_id" SET NOT NULL;
