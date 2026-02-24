-- Not launched yet: reset simulation history for single-record stage model
TRUNCATE TABLE "simulations" CASCADE;

ALTER TABLE "simulations"
  ADD COLUMN IF NOT EXISTS "stage_payloads" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "selected_stage" INTEGER NOT NULL DEFAULT 1;
