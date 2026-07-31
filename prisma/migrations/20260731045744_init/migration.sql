-- Enable extensions
CREATE EXTENSION IF NOT EXISTS citext;

-- CreateTable
CREATE TABLE "user" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" CITEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_list" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,
    "is_inbox" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "task_list_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "list_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "notes" TEXT,
    "due_at" TIMESTAMPTZ,
    "priority" VARCHAR(4) NOT NULL DEFAULT 'none',
    "position" DOUBLE PRECISION NOT NULL,
    "completed_at" TIMESTAMPTZ,
    "version" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "task_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "task_list_id_user_id_key" ON "task_list"("id", "user_id");

-- AddForeignKey
ALTER TABLE "task_list" ADD CONSTRAINT "task_list_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_list_id_user_id_fkey" FOREIGN KEY ("list_id", "user_id") REFERENCES "task_list"("id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task" ADD CONSTRAINT "task_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Check constraints
ALTER TABLE "task" ADD CONSTRAINT "ck_task_title_not_blank" CHECK (trim(title) <> '');
ALTER TABLE "task" ADD CONSTRAINT "ck_task_priority_valid" CHECK (priority IN ('none', 'low', 'med', 'high'));

-- Partial indexes
CREATE INDEX "ix_task_user_list" ON "task" ("user_id", "list_id") WHERE "deleted_at" IS NULL;
CREATE INDEX "ix_task_position" ON "task" ("list_id", "position") WHERE "deleted_at" IS NULL;
CREATE INDEX "ix_task_purge" ON "task" ("deleted_at") WHERE "deleted_at" IS NOT NULL;
