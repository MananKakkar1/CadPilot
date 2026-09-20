ALTER TABLE "agent_runs"
  ADD COLUMN "parent_run_id" UUID,
  ADD COLUMN "parent_message_id" UUID,
  ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'PRIMARY',
  ADD COLUMN "title" TEXT,
  ADD COLUMN "model" TEXT,
  ADD COLUMN "reasoning_effort" TEXT,
  ADD COLUMN "started_at" TIMESTAMP(3),
  ADD COLUMN "finished_at" TIMESTAMP(3),
  ADD COLUMN "cancelled_at" TIMESTAMP(3),
  ADD COLUMN "error" TEXT,
  ADD COLUMN "metadata" JSONB;

ALTER TABLE "agent_runs"
  ADD CONSTRAINT "agent_runs_parent_run_id_fkey"
  FOREIGN KEY ("parent_run_id") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "agent_runs_parent_run_id_idx" ON "agent_runs"("parent_run_id");

ALTER TABLE "agent_steps"
  ADD COLUMN "parent_step_id" UUID,
  ADD COLUMN "agent_name" TEXT,
  ADD COLUMN "label" TEXT,
  ADD COLUMN "error" TEXT,
  ADD COLUMN "duration_ms" INTEGER;

ALTER TABLE "agent_steps"
  ADD CONSTRAINT "agent_steps_parent_step_id_fkey"
  FOREIGN KEY ("parent_step_id") REFERENCES "agent_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "agent_steps_parent_step_id_idx" ON "agent_steps"("parent_step_id");
