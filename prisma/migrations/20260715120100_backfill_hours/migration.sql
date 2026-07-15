UPDATE "Task"
SET
  "estimateMinHours" = "estimateMinMinutes" / 60.0,
  "estimateMaxHours" = "estimateMaxMinutes" / 60.0;

UPDATE "Subtask"
SET "estimatedHours" = "estimatedMinutes" / 60.0;

UPDATE "TaskLog"
SET "hoursSpent" = "minutesSpent" / 60.0;
