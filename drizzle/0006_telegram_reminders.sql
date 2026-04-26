ALTER TABLE "telegram_user_settings"
  ADD COLUMN IF NOT EXISTS "reminders_enabled" boolean DEFAULT false NOT NULL;

CREATE TABLE IF NOT EXISTS "telegram_reminder_deliveries" (
  "id" serial PRIMARY KEY NOT NULL,
  "delivery_key" varchar(255) NOT NULL,
  "chat_id" varchar(64) NOT NULL,
  "item_id" varchar(64),
  "occurrence_day" date NOT NULL,
  "occurrence_time" time,
  "reminder_kind" varchar(40) NOT NULL,
  "scheduled_for" timestamp with time zone NOT NULL,
  "sent_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "telegram_reminder_deliveries_delivery_key_unique"
  ON "telegram_reminder_deliveries" ("delivery_key");

CREATE INDEX IF NOT EXISTS "telegram_reminder_deliveries_chat_kind_idx"
  ON "telegram_reminder_deliveries" ("chat_id", "reminder_kind");
