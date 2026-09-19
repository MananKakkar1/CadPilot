CREATE TYPE "ProjectVisibility" AS ENUM ('PRIVATE', 'PUBLIC');
CREATE TYPE "BuildStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');
CREATE TYPE "ArtifactKind" AS ENUM ('SOURCE', 'INTENT', 'PLAN', 'PREVIEW_MESH', 'STEP', 'STL', 'AUDIT');

CREATE TABLE "profiles" (
  "id" UUID NOT NULL, "user_id" UUID NOT NULL, "display_name" TEXT, "bio" VARCHAR(280), "avatar_url" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "profiles_user_id_key" ON "profiles"("user_id");
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "projects" (
  "id" UUID NOT NULL, "owner_id" UUID NOT NULL, "slug" TEXT NOT NULL, "title" TEXT NOT NULL, "summary" VARCHAR(500),
  "visibility" "ProjectVisibility" NOT NULL DEFAULT 'PRIVATE', "published_revision_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "projects_slug_key" ON "projects"("slug");
CREATE UNIQUE INDEX "projects_published_revision_id_key" ON "projects"("published_revision_id");
CREATE INDEX "projects_owner_id_updated_at_idx" ON "projects"("owner_id", "updated_at");
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "revisions" (
  "id" UUID NOT NULL, "project_id" UUID NOT NULL, "revision_number" INTEGER NOT NULL, "parent_id" UUID, "prompt" TEXT NOT NULL,
  "intent" JSONB NOT NULL, "plan" JSONB NOT NULL, "metrics" JSONB, "validation" JSONB, "source_code" TEXT NOT NULL,
  "is_valid" BOOLEAN NOT NULL DEFAULT false, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "revisions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "revisions_project_id_revision_number_key" ON "revisions"("project_id", "revision_number");
CREATE INDEX "revisions_project_id_created_at_idx" ON "revisions"("project_id", "created_at");
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "projects" ADD CONSTRAINT "projects_published_revision_id_fkey" FOREIGN KEY ("published_revision_id") REFERENCES "revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "build_jobs" (
  "id" UUID NOT NULL, "project_id" UUID NOT NULL, "revision_id" UUID, "prompt" TEXT NOT NULL, "parent_id" UUID,
  "status" "BuildStatus" NOT NULL DEFAULT 'QUEUED', "error" TEXT, "claimed_at" TIMESTAMP(3), "started_at" TIMESTAMP(3), "finished_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "build_jobs_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "build_jobs_revision_id_key" ON "build_jobs"("revision_id");
CREATE INDEX "build_jobs_status_created_at_idx" ON "build_jobs"("status", "created_at");
ALTER TABLE "build_jobs" ADD CONSTRAINT "build_jobs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "build_jobs" ADD CONSTRAINT "build_jobs_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "build_events" (
  "id" UUID NOT NULL, "job_id" UUID NOT NULL, "sequence" INTEGER NOT NULL, "stage" TEXT NOT NULL, "agent" TEXT NOT NULL,
  "tool" TEXT, "summary" TEXT NOT NULL, "detail" JSONB, "duration_ms" INTEGER, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "build_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "build_events_job_id_sequence_key" ON "build_events"("job_id", "sequence");
CREATE INDEX "build_events_job_id_created_at_idx" ON "build_events"("job_id", "created_at");
ALTER TABLE "build_events" ADD CONSTRAINT "build_events_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "build_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "artifacts" (
  "id" UUID NOT NULL, "revision_id" UUID NOT NULL, "kind" "ArtifactKind" NOT NULL, "filename" TEXT NOT NULL, "mime_type" TEXT NOT NULL,
  "storage_key" TEXT NOT NULL, "byte_size" INTEGER NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "artifacts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "artifacts_revision_id_kind_key" ON "artifacts"("revision_id", "kind");
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "conversations" (
  "id" UUID NOT NULL, "project_id" UUID NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "conversations_project_id_key" ON "conversations"("project_id");
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "chat_messages" (
  "id" UUID NOT NULL, "conversation_id" UUID NOT NULL, "role" TEXT NOT NULL, "content" TEXT NOT NULL, "revision_id" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "chat_messages_conversation_id_created_at_idx" ON "chat_messages"("conversation_id", "created_at");
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
