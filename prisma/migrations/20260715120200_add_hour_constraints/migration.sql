ALTER TABLE "Task"
ADD CONSTRAINT "Task_estimate_hours_range_check"
CHECK (
  ("estimateMinHours" IS NULL OR "estimateMinHours" > 0)
  AND ("estimateMaxHours" IS NULL OR "estimateMaxHours" > 0)
  AND (
    "estimateMinHours" IS NULL
    OR "estimateMaxHours" IS NULL
    OR "estimateMinHours" <= "estimateMaxHours"
  )
) NOT VALID;

ALTER TABLE "Subtask"
ADD CONSTRAINT "Subtask_estimated_hours_check"
CHECK ("estimatedHours" IS NULL OR ("estimatedHours" > 0 AND "estimatedHours" <= 5)) NOT VALID;

ALTER TABLE "TaskLog"
ADD CONSTRAINT "TaskLog_hours_spent_check"
CHECK ("hoursSpent" IS NULL OR "hoursSpent" > 0) NOT VALID;
