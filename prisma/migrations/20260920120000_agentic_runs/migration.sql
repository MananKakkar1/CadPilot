ALTER TYPE "ArtifactKind" ADD VALUE IF NOT EXISTS 'MARKDOWN';
ALTER TYPE "ArtifactKind" ADD VALUE IF NOT EXISTS 'MERMAID';
ALTER TYPE "ArtifactKind" ADD VALUE IF NOT EXISTS 'LATEX';
ALTER TYPE "ArtifactKind" ADD VALUE IF NOT EXISTS 'BLUEPRINT_SVG';
ALTER TYPE "ArtifactKind" ADD VALUE IF NOT EXISTS 'BLUEPRINT_PDF';
ALTER TYPE "ArtifactKind" ADD VALUE IF NOT EXISTS 'BLUEPRINT_DXF';
ALTER TYPE "ArtifactKind" ADD VALUE IF NOT EXISTS 'SKETCH_SVG';
ALTER TYPE "ArtifactKind" ADD VALUE IF NOT EXISTS 'SKETCH_DXF';
ALTER TYPE "ArtifactKind" ADD VALUE IF NOT EXISTS 'THREE_MF';
ALTER TYPE "ArtifactKind" ADD VALUE IF NOT EXISTS 'VALIDATION_REPORT';
ALTER TYPE "ArtifactKind" ADD VALUE IF NOT EXISTS 'AGENT_REPORT';

CREATE TYPE "AgentRunStatus" AS ENUM ('QUEUED', 'PLANNING', 'AWAITING_APPROVAL', 'EXECUTING', 'VALIDATING', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "AgentStepStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'AWAITING_APPROVAL');
CREATE TYPE "AgentStepType" AS ENUM ('PLAN', 'TOOL', 'SUBAGENT', 'VALIDATION', 'OUTPUT');
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE "agent_runs" (
  "id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "build_job_id" UUID,
  "prompt" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'execute',
  "status" "AgentRunStatus" NOT NULL DEFAULT 'QUEUED',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "agent_runs_build_job_id_key" ON "agent_runs"("build_job_id");
CREATE INDEX "agent_runs_project_id_created_at_idx" ON "agent_runs"("project_id", "created_at");
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_build_job_id_fkey" FOREIGN KEY ("build_job_id") REFERENCES "build_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "agent_steps" (
  "id" UUID NOT NULL,
  "run_id" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "type" "AgentStepType" NOT NULL,
  "status" "AgentStepStatus" NOT NULL DEFAULT 'PENDING',
  "title" TEXT NOT NULL,
  "summary" TEXT,
  "input" JSONB,
  "output" JSONB,
  "started_at" TIMESTAMP(3),
  "finished_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_steps_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "agent_steps_run_id_sequence_key" ON "agent_steps"("run_id", "sequence");
CREATE INDEX "agent_steps_run_id_created_at_idx" ON "agent_steps"("run_id", "created_at");
ALTER TABLE "agent_steps" ADD CONSTRAINT "agent_steps_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "agent_events" (
  "id" UUID NOT NULL,
  "run_id" UUID NOT NULL,
  "sequence" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "payload" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "agent_events_run_id_sequence_key" ON "agent_events"("run_id", "sequence");
CREATE INDEX "agent_events_run_id_created_at_idx" ON "agent_events"("run_id", "created_at");
ALTER TABLE "agent_events" ADD CONSTRAINT "agent_events_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "agent_subagents" (
  "id" UUID NOT NULL,
  "run_id" UUID NOT NULL,
  "role" TEXT NOT NULL,
  "status" "AgentStepStatus" NOT NULL DEFAULT 'PENDING',
  "summary" TEXT,
  "thread_ref" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "agent_subagents_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "agent_subagents_run_id_created_at_idx" ON "agent_subagents"("run_id", "created_at");
ALTER TABLE "agent_subagents" ADD CONSTRAINT "agent_subagents_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "agent_outputs" (
  "id" UUID NOT NULL,
  "run_id" UUID NOT NULL,
  "step_id" UUID,
  "artifact_id" UUID,
  "kind" TEXT NOT NULL,
  "inline_body" TEXT,
  "mime_type" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_outputs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "agent_outputs_run_id_created_at_idx" ON "agent_outputs"("run_id", "created_at");
ALTER TABLE "agent_outputs" ADD CONSTRAINT "agent_outputs_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_outputs" ADD CONSTRAINT "agent_outputs_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "agent_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "agent_outputs" ADD CONSTRAINT "agent_outputs_artifact_id_fkey" FOREIGN KEY ("artifact_id") REFERENCES "artifacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "approval_requests" (
  "id" UUID NOT NULL,
  "run_id" UUID NOT NULL,
  "step_id" UUID,
  "action" TEXT NOT NULL,
  "risk" TEXT NOT NULL,
  "explanation" TEXT NOT NULL,
  "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "decided_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "approval_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "approval_requests_run_id_status_idx" ON "approval_requests"("run_id", "status");
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_step_id_fkey" FOREIGN KEY ("step_id") REFERENCES "agent_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;
