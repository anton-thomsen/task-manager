ALTER TABLE "Task"
ADD CONSTRAINT "Task_estimate_range_check"
CHECK (
    "estimateMinMinutes" IS NULL
    OR "estimateMaxMinutes" IS NULL
    OR "estimateMinMinutes" <= "estimateMaxMinutes"
);
