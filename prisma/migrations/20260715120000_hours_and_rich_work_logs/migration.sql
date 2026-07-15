ALTER TABLE "Task"
  ADD COLUMN "estimateMinHours" DOUBLE PRECISION,
  ADD COLUMN "estimateMaxHours" DOUBLE PRECISION;

ALTER TABLE "Subtask"
  ADD COLUMN "estimatedHours" DOUBLE PRECISION;

ALTER TABLE "TaskLog"
  ADD COLUMN "hoursSpent" DOUBLE PRECISION,
  ADD COLUMN "details" TEXT;

CREATE FUNCTION sync_task_estimate_units()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."estimateMinHours" IS NOT NULL THEN
      NEW."estimateMinMinutes" := ROUND(NEW."estimateMinHours" * 60)::INTEGER;
    ELSE
      NEW."estimateMinHours" := NEW."estimateMinMinutes" / 60.0;
    END IF;

    IF NEW."estimateMaxHours" IS NOT NULL THEN
      NEW."estimateMaxMinutes" := ROUND(NEW."estimateMaxHours" * 60)::INTEGER;
    ELSE
      NEW."estimateMaxHours" := NEW."estimateMaxMinutes" / 60.0;
    END IF;
  ELSE
    IF NEW."estimateMinHours" IS DISTINCT FROM OLD."estimateMinHours" THEN
      NEW."estimateMinMinutes" := ROUND(NEW."estimateMinHours" * 60)::INTEGER;
    ELSIF NEW."estimateMinMinutes" IS DISTINCT FROM OLD."estimateMinMinutes" THEN
      NEW."estimateMinHours" := NEW."estimateMinMinutes" / 60.0;
    END IF;

    IF NEW."estimateMaxHours" IS DISTINCT FROM OLD."estimateMaxHours" THEN
      NEW."estimateMaxMinutes" := ROUND(NEW."estimateMaxHours" * 60)::INTEGER;
    ELSIF NEW."estimateMaxMinutes" IS DISTINCT FROM OLD."estimateMaxMinutes" THEN
      NEW."estimateMaxHours" := NEW."estimateMaxMinutes" / 60.0;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_task_estimate_units
BEFORE INSERT OR UPDATE ON "Task"
FOR EACH ROW
EXECUTE FUNCTION sync_task_estimate_units();

CREATE FUNCTION sync_subtask_estimate_units()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."estimatedHours" IS NOT NULL THEN
      NEW."estimatedMinutes" := ROUND(NEW."estimatedHours" * 60)::INTEGER;
    ELSE
      NEW."estimatedHours" := NEW."estimatedMinutes" / 60.0;
    END IF;
  ELSIF NEW."estimatedHours" IS DISTINCT FROM OLD."estimatedHours" THEN
    NEW."estimatedMinutes" := ROUND(NEW."estimatedHours" * 60)::INTEGER;
  ELSIF NEW."estimatedMinutes" IS DISTINCT FROM OLD."estimatedMinutes" THEN
    NEW."estimatedHours" := NEW."estimatedMinutes" / 60.0;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_subtask_estimate_units
BEFORE INSERT OR UPDATE ON "Subtask"
FOR EACH ROW
EXECUTE FUNCTION sync_subtask_estimate_units();

CREATE FUNCTION sync_task_log_units()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."hoursSpent" IS NOT NULL THEN
      NEW."minutesSpent" := ROUND(NEW."hoursSpent" * 60)::INTEGER;
    ELSE
      NEW."hoursSpent" := NEW."minutesSpent" / 60.0;
    END IF;
  ELSIF NEW."hoursSpent" IS DISTINCT FROM OLD."hoursSpent" THEN
    NEW."minutesSpent" := ROUND(NEW."hoursSpent" * 60)::INTEGER;
  ELSIF NEW."minutesSpent" IS DISTINCT FROM OLD."minutesSpent" THEN
    NEW."hoursSpent" := NEW."minutesSpent" / 60.0;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_task_log_units
BEFORE INSERT OR UPDATE ON "TaskLog"
FOR EACH ROW
EXECUTE FUNCTION sync_task_log_units();

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
