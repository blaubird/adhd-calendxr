CREATE TABLE IF NOT EXISTS "telegram_pending_drafts" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "chat_id" varchar(64) NOT NULL,
  "draft" jsonb NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "telegram_pending_drafts_chat_status_idx"
  ON "telegram_pending_drafts" ("chat_id", "status");

CREATE INDEX IF NOT EXISTS "telegram_pending_drafts_expires_at_idx"
  ON "telegram_pending_drafts" ("expires_at");
