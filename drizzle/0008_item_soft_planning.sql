DO $$ BEGIN
  CREATE TYPE "planning_period" AS ENUM ('morning', 'day', 'evening');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "planning_period" "planning_period";
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "planning_order" integer;
