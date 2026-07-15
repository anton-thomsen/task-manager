-- Delegation acceptance: an assignee row with NULL acceptedAt is a pending
-- delegation. Creator rows and self-assignments count as accepted from the
-- start, including the rows backfilled by the organizations migration.

-- AlterTable
ALTER TABLE "TaskAssignee" ADD COLUMN "acceptedAt" TIMESTAMP(3);

-- Backfill: rows for the task creator and self-assigned rows are accepted.
UPDATE "TaskAssignee" ta
SET "acceptedAt" = ta."createdAt"
FROM "Task" t
WHERE ta."taskId" = t."id"
  AND (ta."userId" = t."createdById" OR ta."userId" = ta."assignedById");
