CREATE TABLE IF NOT EXISTS "telegram_item_contexts" (
  "chat_id" varchar(64) PRIMARY KEY NOT NULL,
  "context_id" varchar(64) NOT NULL,
  "context_type" varchar(20) NOT NULL,
  "items" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "telegram_item_contexts_context_id_idx"
  ON "telegram_item_contexts" ("context_id");

CREATE INDEX IF NOT EXISTS "telegram_item_contexts_expires_at_idx"
  ON "telegram_item_contexts" ("expires_at");
