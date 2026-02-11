-- Rename win_ready and win_ready_reason to score and score_reason
ALTER TABLE "simulations" RENAME COLUMN "win_ready" TO "score";
ALTER TABLE "simulations" RENAME COLUMN "win_ready_reason" TO "score_reason";
