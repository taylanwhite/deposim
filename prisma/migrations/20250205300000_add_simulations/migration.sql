-- CreateTable
CREATE TABLE "simulations" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "conversation_id" TEXT,
    "event_type" TEXT,
    "agent_id" TEXT,
    "status" TEXT,
    "win_ready" INTEGER,
    "win_ready_reason" TEXT,
    "win_ready_analysis" TEXT,
    "transcript" JSONB,
    "call_duration_secs" INTEGER,
    "transcript_summary" TEXT,
    "call_summary_title" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "simulations_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "simulations" ADD CONSTRAINT "simulations_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
