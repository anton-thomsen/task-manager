ALTER TABLE "Subtask"
ADD COLUMN "description" TEXT,
ADD COLUMN "referenceLinks" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
