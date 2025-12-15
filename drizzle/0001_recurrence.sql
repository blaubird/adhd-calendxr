ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "recurrence_rule" text;
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "recurrence_tz" text NOT NULL DEFAULT 'Europe/Paris';
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "recurrence_until_day" date;
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "recurrence_count" integer;
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "recurrence_exdates" date[] NOT NULL DEFAULT '{}';
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "parent_id" integer REFERENCES "items"("id") ON DELETE CASCADE;
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "occurrence_day" date;

CREATE INDEX IF NOT EXISTS "items_parent_occurrence_idx" ON "items" ("parent_id", "occurrence_day");
CREATE INDEX IF NOT EXISTS "items_recurrence_idx" ON "items" ("id") WHERE recurrence_rule IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "items_parent_occurrence_unique" ON "items" ("parent_id", "occurrence_day");
