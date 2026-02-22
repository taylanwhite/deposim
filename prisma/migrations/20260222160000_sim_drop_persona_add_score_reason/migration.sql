-- Remove persona_id from simulations (persona is on case.default_persona_id and simulation_stages.persona_id)
ALTER TABLE "simulations" DROP COLUMN IF EXISTS "persona_id";

-- Add score_reason to simulations for the combined score explanation
ALTER TABLE "simulations" ADD COLUMN IF NOT EXISTS "score_reason" TEXT;
