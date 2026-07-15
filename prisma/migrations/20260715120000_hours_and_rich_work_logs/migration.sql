ALTER TABLE "Task" DROP CONSTRAINT "Task_estimate_range_check";

ALTER TABLE "Task" RENAME COLUMN "estimateMinMinutes" TO "estimateMinHours";
ALTER TABLE "Task" RENAME COLUMN "estimateMaxMinutes" TO "estimateMaxHours";
ALTER TABLE "Task"
  ALTER COLUMN "estimateMinHours" TYPE DOUBLE PRECISION USING "estimateMinHours" / 60.0,
  ALTER COLUMN "estimateMaxHours" TYPE DOUBLE PRECISION USING "estimateMaxHours" / 60.0;

ALTER TABLE "Subtask" RENAME COLUMN "estimatedMinutes" TO "estimatedHours";
ALTER TABLE "Subtask"
  ALTER COLUMN "estimatedHours" TYPE DOUBLE PRECISION USING "estimatedHours" / 60.0;

ALTER TABLE "TaskLog" RENAME COLUMN "minutesSpent" TO "hoursSpent";
ALTER TABLE "TaskLog"
  ALTER COLUMN "hoursSpent" TYPE DOUBLE PRECISION USING "hoursSpent" / 60.0,
  ADD COLUMN "details" TEXT;

ALTER TABLE "Task"
ADD CONSTRAINT "Task_estimate_range_check"
CHECK (
  ("estimateMinHours" IS NULL OR "estimateMinHours" > 0)
  AND ("estimateMaxHours" IS NULL OR "estimateMaxHours" > 0)
  AND (
    "estimateMinHours" IS NULL
    OR "estimateMaxHours" IS NULL
    OR "estimateMinHours" <= "estimateMaxHours"
  )
);

ALTER TABLE "Subtask"
ADD CONSTRAINT "Subtask_estimated_hours_check"
CHECK ("estimatedHours" IS NULL OR ("estimatedHours" > 0 AND "estimatedHours" <= 5));

ALTER TABLE "TaskLog"
ADD CONSTRAINT "TaskLog_hours_spent_check"
CHECK ("hoursSpent" IS NULL OR "hoursSpent" > 0);

CREATE TABLE "WorkLogImage" (
  "id" SERIAL NOT NULL,
  "taskLogId" INTEGER NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "data" BYTEA NOT NULL,

  CONSTRAINT "WorkLogImage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkLogImage_taskLogId_idx" ON "WorkLogImage"("taskLogId");

ALTER TABLE "WorkLogImage"
ADD CONSTRAINT "WorkLogImage_taskLogId_fkey"
FOREIGN KEY ("taskLogId") REFERENCES "TaskLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
