-- Add image_analysis to PromptType enum (DB may already have it from prior changes)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'image_analysis'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'PromptType')
  ) THEN
    ALTER TYPE "PromptType" ADD VALUE 'image_analysis';
  END IF;
END
$$;
