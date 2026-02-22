-- Wipe old simulation data (user confirmed)
TRUNCATE TABLE "simulations" CASCADE;

-- Drop all per-stage columns from simulations
ALTER TABLE "simulations"
  DROP COLUMN IF EXISTS "conversation_id",
  DROP COLUMN IF EXISTS "event_type",
  DROP COLUMN IF EXISTS "agent_id",
  DROP COLUMN IF EXISTS "status",
  DROP COLUMN IF EXISTS "score_reason",
  DROP COLUMN IF EXISTS "full_analysis",
  DROP COLUMN IF EXISTS "turn_scores",
  DROP COLUMN IF EXISTS "transcript",
  DROP COLUMN IF EXISTS "call_duration_secs",
  DROP COLUMN IF EXISTS "transcript_summary",
  DROP COLUMN IF EXISTS "call_summary_title",
  DROP COLUMN IF EXISTS "body_analysis",
  DROP COLUMN IF EXISTS "body_analysis_model",
  DROP COLUMN IF EXISTS "recording_s3_key",
  DROP COLUMN IF EXISTS "stage_payloads",
  DROP COLUMN IF EXISTS "stage",
  DROP COLUMN IF EXISTS "stage_status",
  DROP COLUMN IF EXISTS "retake_recommended",
  DROP COLUMN IF EXISTS "stage_summary";

-- Ensure kept columns exist
ALTER TABLE "simulations"
  ADD COLUMN IF NOT EXISTS "selected_stage" INTEGER NOT NULL DEFAULT 1;

-- Create simulation_stages table
CREATE TABLE "simulation_stages" (
  "id" TEXT NOT NULL,
  "simulation_id" TEXT NOT NULL,
  "stage" INTEGER NOT NULL,
  "conversation_id" TEXT,
  "status" TEXT,
  "score" INTEGER,
  "score_reason" TEXT,
  "full_analysis" TEXT,
  "turn_scores" JSONB,
  "transcript" JSONB,
  "call_duration_secs" INTEGER,
  "transcript_summary" TEXT,
  "call_summary_title" TEXT,
  "body_analysis" TEXT,
  "body_analysis_model" TEXT,
  "body_score" INTEGER,
  "recording_s3_key" TEXT,
  "stage_summary" TEXT,
  "retake_recommended" BOOLEAN NOT NULL DEFAULT false,
  "persona_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "simulation_stages_pkey" PRIMARY KEY ("id")
);

-- One row per stage per simulation
CREATE UNIQUE INDEX "simulation_stages_simulation_id_stage_key"
  ON "simulation_stages"("simulation_id", "stage");

-- Foreign keys
ALTER TABLE "simulation_stages"
  ADD CONSTRAINT "simulation_stages_simulation_id_fkey"
  FOREIGN KEY ("simulation_id") REFERENCES "simulations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "simulation_stages"
  ADD CONSTRAINT "simulation_stages_persona_id_fkey"
  FOREIGN KEY ("persona_id") REFERENCES "personas"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
