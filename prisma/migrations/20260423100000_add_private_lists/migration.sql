-- Add explicit private-list flag
ALTER TABLE "list"
ADD COLUMN IF NOT EXISTS "isPrivate" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "list_groupId_isPrivate_idx" ON "list"("groupId", "isPrivate");
