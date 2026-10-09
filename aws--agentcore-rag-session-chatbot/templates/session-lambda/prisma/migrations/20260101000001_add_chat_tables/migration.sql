-- The chat history, owned by the username the login form posts. Created
-- snake_case from the start: an earlier version of this stack created them
-- quoted-PascalCase and needed two follow-up migrations to rename them.

-- CreateTable
CREATE TABLE "user" (
    "username" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_pkey" PRIMARY KEY ("username")
);

-- CreateTable
CREATE TABLE "chat_session" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Untitled',
    "updated_at" TIMESTAMPTZ(6),
    "last_side_seq" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "chat_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_side_session" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "side_session_id" TEXT NOT NULL,
    "chat_session_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(6),
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "chat_side_session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chat_session_username_position_idx" ON "chat_session"("username", "position");

-- CreateIndex
CREATE UNIQUE INDEX "chat_session_username_session_id_key" ON "chat_session"("username", "session_id");

-- CreateIndex
CREATE INDEX "chat_side_session_chat_session_id_position_idx" ON "chat_side_session"("chat_session_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "chat_side_session_chat_session_id_side_session_id_key" ON "chat_side_session"("chat_session_id", "side_session_id");

-- AddForeignKey
ALTER TABLE "chat_session" ADD CONSTRAINT "chat_session_username_fkey" FOREIGN KEY ("username") REFERENCES "user"("username") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_side_session" ADD CONSTRAINT "chat_side_session_chat_session_id_fkey" FOREIGN KEY ("chat_session_id") REFERENCES "chat_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
