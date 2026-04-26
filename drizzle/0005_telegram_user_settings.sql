CREATE TABLE IF NOT EXISTS "telegram_user_settings" (
  "chat_id" varchar(64) PRIMARY KEY NOT NULL,
  "language" varchar(8) DEFAULT 'en' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
