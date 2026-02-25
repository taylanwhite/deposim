-- Enforce unique phone number per location.

-- Deduplicate: same phone + same location_id (non-null), keep newest
DELETE FROM "clients" a
  USING "clients" b
  WHERE a."location_id" IS NOT NULL
    AND a."location_id" = b."location_id"
    AND a."phone" IS NOT NULL
    AND a."phone" = b."phone"
    AND a."id" != b."id"
    AND a."updated_at" < b."updated_at";

-- Deduplicate: same phone, both location_id NULL, keep newest
DELETE FROM "clients" a
  USING "clients" b
  WHERE a."location_id" IS NULL
    AND b."location_id" IS NULL
    AND a."phone" IS NOT NULL
    AND a."phone" = b."phone"
    AND a."id" != b."id"
    AND a."updated_at" < b."updated_at";

-- Standard composite unique (covers non-null location_id)
CREATE UNIQUE INDEX "clients_location_id_phone_key"
  ON "clients"("location_id", "phone")
  WHERE "phone" IS NOT NULL;

-- Partial index for null location_id
CREATE UNIQUE INDEX "clients_null_location_phone_key"
  ON "clients"("phone")
  WHERE "location_id" IS NULL AND "phone" IS NOT NULL;
