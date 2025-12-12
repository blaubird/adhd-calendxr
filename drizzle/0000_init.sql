CREATE TYPE "item_kind" AS ENUM('event', 'task');
CREATE TYPE "task_status" AS ENUM('todo', 'done', 'canceled');

CREATE TABLE IF NOT EXISTS "users" (
  "id" serial PRIMARY KEY NOT NULL,
  "email" varchar(255) NOT NULL UNIQUE,
  "password" varchar(255) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "items" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "kind" "item_kind" NOT NULL,
  "day" date NOT NULL,
  "time_start" time,
  "time_end" time,
  "title" varchar(255) NOT NULL,
  "details" text,
  "status" "task_status",
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "items_day_idx" ON "items" ("day", "user_id");
CREATE INDEX IF NOT EXISTS "items_user_idx" ON "items" ("user_id");
