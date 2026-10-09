-- Baseline for the tables the `{{POSTGRES_SCHEMA}}` schema already has before
-- Prisma Migrate tracks it: `embeddings` and `tags` (both created by
-- vector_db/create_table.py), plus the `vector` extension they depend on.
--
-- These objects already exist in the database, so this migration must NOT be
-- run. Record it as applied instead:
--   yarn migrate:applied -- 20260101000000_baseline_existing_tables
-- After that, `yarn migrate:deploy` applies only the chat tables added since.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "{{POSTGRES_SCHEMA}}";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "public";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- The shadow database replays this with search_path set to
-- `{{POSTGRES_SCHEMA}}` only, so the `vector` type installed in `public` above
-- would not resolve. The real database already has `public` on its search_path.
SET search_path TO "{{POSTGRES_SCHEMA}}", "public";

-- CreateTable
CREATE TABLE "embeddings" (
    "id" TEXT NOT NULL,
    "content" TEXT,
    "metadata" JSONB,
    "embedding" vector(1536),

    CONSTRAINT "embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "tag" TEXT NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("tag")
);

-- CreateIndex
CREATE INDEX "embeddings_embedding_ivfflat" ON "embeddings"("embedding");
