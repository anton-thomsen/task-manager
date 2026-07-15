ALTER TABLE "Task"
VALIDATE CONSTRAINT "Task_estimate_hours_range_check";

ALTER TABLE "Subtask"
VALIDATE CONSTRAINT "Subtask_estimated_hours_check";

ALTER TABLE "TaskLog"
VALIDATE CONSTRAINT "TaskLog_hours_spent_check";
