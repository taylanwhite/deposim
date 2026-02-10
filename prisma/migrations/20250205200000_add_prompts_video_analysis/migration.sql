-- CreateEnum
CREATE TYPE "PromptType" AS ENUM ('system', 'first_message', 'media_analysis');

-- CreateTable
CREATE TABLE "prompts" (
    "id" TEXT NOT NULL,
    "type" "PromptType" NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prompts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_analyses" (
    "id" TEXT NOT NULL,
    "youtube_url" TEXT NOT NULL,
    "prompt_id" TEXT,
    "model" TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
    "analysis_text" TEXT NOT NULL,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "video_analyses_pkey" PRIMARY KEY ("id")
);

-- Seed default body-language analysis prompt
INSERT INTO "prompts" ("id", "type", "name", "content", "is_active", "created_at", "updated_at")
VALUES (
    'default_media_analysis',
    'media_analysis',
    'Body Language Analysis',
    'You are an expert body language and behavioral analyst specializing in deposition video review. Analyze this video carefully and provide:

1. **Overall Demeanor**: Describe the subject''s general composure, confidence level, and emotional state throughout.
2. **Key Body Language Signals**: Identify specific non-verbal cues (eye movement, posture shifts, hand gestures, facial micro-expressions, head tilts, lip compression, self-touching/adaptor behaviors).
3. **Stress Indicators**: Note any signs of discomfort, anxiety, or deception (gaze aversion, increased blink rate, throat clearing, fidgeting, defensive posturing).
4. **Credibility Assessment**: Based on observable behavior, assess consistency between verbal statements and non-verbal signals.
5. **Timeline of Notable Moments**: Reference specific timestamps where significant behavioral changes occur.
6. **Summary & Recommendations**: Provide a concise overall assessment with actionable observations for legal strategy.

Be specific, cite timestamps where possible, and distinguish between observed behavior and interpretation.',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);
