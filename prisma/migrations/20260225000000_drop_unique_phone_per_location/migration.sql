-- Remove location-scoped phone uniqueness constraints.
-- Phone uniqueness is already handled at the org level via (organization_id, first_name, last_name, phone).

DROP INDEX IF EXISTS "clients_location_id_phone_key";
DROP INDEX IF EXISTS "clients_null_location_phone_key";
