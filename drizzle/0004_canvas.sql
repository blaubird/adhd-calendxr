DO $$ BEGIN
  CREATE TYPE "public"."board_scope" AS ENUM ('day', 'month');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "public"."canvas_element_type" AS ENUM ('text', 'checklist', 'stroke');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "canvas_boards" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "scope" "board_scope" NOT NULL,
  "scope_key" varchar(10) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "canvas_elements" (
  "id" serial PRIMARY KEY NOT NULL,
  "board_id" integer NOT NULL,
  "type" "canvas_element_type" NOT NULL,
  "x" integer DEFAULT 0 NOT NULL,
  "y" integer DEFAULT 0 NOT NULL,
  "width" integer DEFAULT 200 NOT NULL,
  "height" integer DEFAULT 100 NOT NULL,
  "z_index" integer DEFAULT 0 NOT NULL,
  "data" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "canvas_boards" ADD CONSTRAINT "canvas_boards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "canvas_elements" ADD CONSTRAINT "canvas_elements_board_id_canvas_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."canvas_boards"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "canvas_boards_user_scope_key_unique" ON "canvas_boards" USING btree ("user_id", "scope", "scope_key");
CREATE INDEX IF NOT EXISTS "canvas_elements_board_idx" ON "canvas_elements" USING btree ("board_id");
