-- AlterTable: Case – template and default persona
ALTER TABLE "cases" ADD COLUMN "template_id" TEXT;
ALTER TABLE "cases" ADD COLUMN "default_persona_id" TEXT;

-- AlterTable: Simulation – which persona was used
ALTER TABLE "simulations" ADD COLUMN "persona_id" TEXT;
