-- CreateTable (id as TEXT to match cases.default_persona_id / simulations.persona_id)
CREATE TABLE "personas" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "template_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "system_modifier" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "legacy_slug" TEXT,

    CONSTRAINT "personas_pkey" PRIMARY KEY ("id")
);

-- Backfill personas from deposition_templates.personas JSON
INSERT INTO "personas" ("id", "template_id", "name", "description", "system_modifier", "created_at", "updated_at", "legacy_slug")
SELECT
    gen_random_uuid()::text,
    t.id,
    COALESCE(elem->>'name', 'Persona'),
    NULLIF(trim(elem->>'description'), ''),
    COALESCE(NULLIF(trim(elem->>'systemModifier'), ''), ''),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    elem->>'id'
FROM "deposition_templates" t,
     jsonb_array_elements(COALESCE(t.personas::jsonb, '[]'::jsonb)) AS elem;

-- Update cases: set default_persona_id to new persona UUID where legacy slug matches
UPDATE "cases" c
SET "default_persona_id" = p.id
FROM "personas" p
WHERE p."template_id" = c."template_id"
  AND p."legacy_slug" = c."default_persona_id"
  AND c."default_persona_id" IS NOT NULL;

-- Update simulations: set persona_id to new persona UUID
UPDATE "simulations" s
SET "persona_id" = (
    SELECT p.id
    FROM "personas" p
    JOIN "cases" c ON c."id" = s."case_id" AND p."template_id" = c."template_id"
    WHERE p."legacy_slug" = s."persona_id"
    LIMIT 1
)
WHERE s."persona_id" IS NOT NULL;

-- Safety: legacy cases/sims may still have slug persona ids (or other invalid values).
-- Null them out so foreign keys can be added safely.
UPDATE "cases"
SET "default_persona_id" = NULL
WHERE "default_persona_id" IS NOT NULL
  AND "default_persona_id" NOT IN (SELECT "id" FROM "personas");

UPDATE "simulations"
SET "persona_id" = NULL
WHERE "persona_id" IS NOT NULL
  AND "persona_id" NOT IN (SELECT "id" FROM "personas");

-- Drop temporary column
ALTER TABLE "personas" DROP COLUMN "legacy_slug";

-- Drop personas JSON from deposition_templates
ALTER TABLE "deposition_templates" DROP COLUMN "personas";

-- AddForeignKey
ALTER TABLE "personas" ADD CONSTRAINT "personas_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "deposition_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (cases.default_persona_id -> personas.id)
ALTER TABLE "cases" ADD CONSTRAINT "cases_default_persona_id_fkey" FOREIGN KEY ("default_persona_id") REFERENCES "personas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey (simulations.persona_id -> personas.id)
ALTER TABLE "simulations" ADD CONSTRAINT "simulations_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "personas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
