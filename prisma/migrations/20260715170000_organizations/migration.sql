-- Organizations, membership, invitations, task assignment, profiles, per-user tokens.
-- Expand (nullable columns + new tables), backfill existing single-user data into a
-- default organization, then contract (NOT NULL on organizationId columns).
-- Old app code inserting between this migration and the new deploy would fail the
-- NOT NULL constraints; acceptable for a single-operator deployment window.

-- CreateTable
CREATE TABLE "organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logo" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "inviterId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskAssignee" (
    "id" SERIAL NOT NULL,
    "taskId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskAssignee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserAvatar" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "UserAvatar_pkey" PRIMARY KEY ("id")
);

-- AlterTable (expand: nullable until backfilled)
ALTER TABLE "Client" ADD COLUMN "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Label" ADD COLUMN "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "createdById" TEXT,
ADD COLUMN "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Subtask" ADD COLUMN "completedById" TEXT;

-- AlterTable
ALTER TABLE "TaskLog" ADD COLUMN "authorId" TEXT,
ADD COLUMN "estimatedHours" DOUBLE PRECISION,
ADD COLUMN "subtaskId" INTEGER;

-- AlterTable
ALTER TABLE "session" ADD COLUMN "activeOrganizationId" TEXT;

-- AlterTable
ALTER TABLE "user" ADD COLUMN "apiToken" TEXT,
ADD COLUMN "calendarToken" TEXT;

-- Backfill: adopt all existing data into a default organization owned by the
-- earliest-created user. A database with no users has no domain rows either,
-- so the backfill is skipped and the NOT NULL constraints below apply to
-- empty tables.
DO $$
DECLARE
  owner_id TEXT;
  org_id TEXT;
BEGIN
  SELECT "id" INTO owner_id FROM "user" ORDER BY "createdAt" ASC, "id" ASC LIMIT 1;
  IF owner_id IS NULL THEN
    RETURN;
  END IF;

  org_id := replace(gen_random_uuid()::text, '-', '');
  INSERT INTO "organization" ("id", "name", "slug", "createdAt")
  VALUES (org_id, 'Searchminds', 'searchminds', CURRENT_TIMESTAMP);

  INSERT INTO "member" ("id", "organizationId", "userId", "role", "createdAt")
  VALUES (replace(gen_random_uuid()::text, '-', ''), org_id, owner_id, 'owner', CURRENT_TIMESTAMP);

  UPDATE "Client" SET "organizationId" = org_id;
  UPDATE "Label" SET "organizationId" = org_id;
  UPDATE "Task" SET "organizationId" = org_id, "createdById" = owner_id;
  UPDATE "TaskLog" SET "authorId" = owner_id;

  INSERT INTO "TaskAssignee" ("taskId", "userId", "assignedById")
  SELECT "id", owner_id, owner_id FROM "Task";

  UPDATE "user" SET
    "calendarToken" = encode(sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8')), 'hex'),
    "apiToken" = encode(sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8')), 'hex')
  WHERE "id" = owner_id;
END $$;

-- Contract: ownership is now mandatory
ALTER TABLE "Client" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Label" ALTER COLUMN "organizationId" SET NOT NULL;
ALTER TABLE "Task" ALTER COLUMN "organizationId" SET NOT NULL;

-- DropIndex
DROP INDEX "Client_name_key";

-- DropIndex
DROP INDEX "Label_name_key";

-- DropIndex
DROP INDEX "Task_status_sortOrder_idx";

-- CreateIndex
CREATE INDEX "TaskAssignee_userId_idx" ON "TaskAssignee"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskAssignee_taskId_userId_key" ON "TaskAssignee"("taskId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserAvatar_userId_key" ON "UserAvatar"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "organization_slug_key" ON "organization"("slug");

-- CreateIndex
CREATE INDEX "member_userId_idx" ON "member"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "member_organizationId_userId_key" ON "member"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "invitation_organizationId_idx" ON "invitation"("organizationId");

-- CreateIndex
CREATE INDEX "invitation_email_idx" ON "invitation"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Client_organizationId_name_key" ON "Client"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Label_organizationId_name_key" ON "Label"("organizationId", "name");

-- CreateIndex
CREATE INDEX "Task_organizationId_status_sortOrder_idx" ON "Task"("organizationId", "status", "sortOrder");

-- CreateIndex
CREATE INDEX "Task_createdById_idx" ON "Task"("createdById");

-- CreateIndex
CREATE INDEX "TaskLog_subtaskId_idx" ON "TaskLog"("subtaskId");

-- CreateIndex
CREATE UNIQUE INDEX "user_calendarToken_key" ON "user"("calendarToken");

-- CreateIndex
CREATE UNIQUE INDEX "user_apiToken_key" ON "user"("apiToken");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Label" ADD CONSTRAINT "Label_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignee" ADD CONSTRAINT "TaskAssignee_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignee" ADD CONSTRAINT "TaskAssignee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAssignee" ADD CONSTRAINT "TaskAssignee_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subtask" ADD CONSTRAINT "Subtask_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskLog" ADD CONSTRAINT "TaskLog_subtaskId_fkey" FOREIGN KEY ("subtaskId") REFERENCES "Subtask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskLog" ADD CONSTRAINT "TaskLog_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserAvatar" ADD CONSTRAINT "UserAvatar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member" ADD CONSTRAINT "member_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member" ADD CONSTRAINT "member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
