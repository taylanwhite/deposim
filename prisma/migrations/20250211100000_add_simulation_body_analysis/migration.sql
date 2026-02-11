-- Add body language analysis fields to simulations
ALTER TABLE "simulations" ADD COLUMN "body_analysis" TEXT;
ALTER TABLE "simulations" ADD COLUMN "body_analysis_model" TEXT;
