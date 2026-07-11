ALTER TABLE "Task" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Subtask" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

WITH ranked AS (
    SELECT "id", ROW_NUMBER() OVER (
        PARTITION BY "status"
        ORDER BY "deadline" ASC NULLS LAST, "createdAt" DESC
    ) * 1024 AS position
    FROM "Task"
)
UPDATE "Task" SET "sortOrder" = ranked.position
FROM ranked WHERE "Task"."id" = ranked."id";

WITH ranked AS (
    SELECT "id", ROW_NUMBER() OVER (
        PARTITION BY "taskId", "status"
        ORDER BY "createdAt" ASC
    ) * 1024 AS position
    FROM "Subtask"
)
UPDATE "Subtask" SET "sortOrder" = ranked.position
FROM ranked WHERE "Subtask"."id" = ranked."id";

DROP INDEX "Task_status_idx";
DROP INDEX "Subtask_taskId_idx";
CREATE INDEX "Task_status_sortOrder_idx" ON "Task"("status", "sortOrder");
CREATE INDEX "Subtask_taskId_status_sortOrder_idx" ON "Subtask"("taskId", "status", "sortOrder");
