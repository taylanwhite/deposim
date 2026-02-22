-- CreateTable: integrations (per location, per integration type)
CREATE TABLE "integrations" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "location_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT,
    "access_token_id" TEXT,
    "secret" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- Unique: one config per location + integration type
CREATE UNIQUE INDEX "integrations_location_id_type_key" ON "integrations"("location_id", "type");

-- Index for lookups
CREATE INDEX "integrations_location_id_idx" ON "integrations"("location_id");

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

