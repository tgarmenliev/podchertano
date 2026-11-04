CREATE TABLE "encounters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"vocab_item_id" uuid NOT NULL,
	"source_id" uuid,
	"surface_form" text NOT NULL,
	"sentence" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invite_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"user_id" uuid NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"code" text PRIMARY KEY NOT NULL,
	"created_by" uuid,
	"max_uses" integer DEFAULT 1 NOT NULL,
	"used_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"role" text DEFAULT 'student' NOT NULL,
	"timezone" text DEFAULT 'Europe/Sofia' NOT NULL,
	"daily_photo_limit" integer DEFAULT 5 NOT NULL,
	"daily_new_words" integer DEFAULT 8 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"card_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"rating" integer NOT NULL,
	"correct" boolean NOT NULL,
	"typed_answer" text,
	"duration_ms" integer,
	"reviewed_at" timestamp with time zone NOT NULL,
	"card_state_before" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text DEFAULT 'reading_photo' NOT NULL,
	"title" text,
	"full_text" text,
	"words" jsonb,
	"image_path" text,
	"image_w" integer,
	"image_h" integer,
	"pipeline_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "srs_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"item_kind" text DEFAULT 'vocab' NOT NULL,
	"item_id" uuid NOT NULL,
	"due" timestamp with time zone DEFAULT now() NOT NULL,
	"stability" real DEFAULT 0 NOT NULL,
	"difficulty" real DEFAULT 0 NOT NULL,
	"elapsed_days" integer DEFAULT 0 NOT NULL,
	"scheduled_days" integer DEFAULT 0 NOT NULL,
	"learning_steps" integer DEFAULT 0 NOT NULL,
	"reps" integer DEFAULT 0 NOT NULL,
	"lapses" integer DEFAULT 0 NOT NULL,
	"state" integer DEFAULT 0 NOT NULL,
	"last_review" timestamp with time zone,
	"suspended" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"kind" text NOT NULL,
	"provider" text NOT NULL,
	"model" text,
	"tokens_in" integer,
	"tokens_out" integer,
	"images" integer,
	"est_cost_micro_eur" integer DEFAULT 0 NOT NULL,
	"ok" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vocab_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"lemma" text NOT NULL,
	"pos" text DEFAULT '' NOT NULL,
	"phrase" text,
	"phrase_kind" text,
	"translation_bg" text NOT NULL,
	"translation_alt_bg" text,
	"meaning_bg" text,
	"definition_en" text,
	"example_en" text,
	"cefr_guess" text,
	"notes" text,
	"status" text DEFAULT 'new' NOT NULL,
	"ai_model" text,
	"enrich_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_vocab_item_id_vocab_items_id_fk" FOREIGN KEY ("vocab_item_id") REFERENCES "public"."vocab_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_redemptions" ADD CONSTRAINT "invite_redemptions_code_invites_code_fk" FOREIGN KEY ("code") REFERENCES "public"."invites"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_redemptions" ADD CONSTRAINT "invite_redemptions_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_logs" ADD CONSTRAINT "review_logs_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_logs" ADD CONSTRAINT "review_logs_card_id_srs_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."srs_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "srs_cards" ADD CONSTRAINT "srs_cards_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vocab_items" ADD CONSTRAINT "vocab_items_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "encounters_item_idx" ON "encounters" USING btree ("vocab_item_id");--> statement-breakpoint
CREATE INDEX "review_logs_user_time_idx" ON "review_logs" USING btree ("user_id","reviewed_at");--> statement-breakpoint
CREATE INDEX "sources_user_created_idx" ON "sources" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "srs_cards_item_idx" ON "srs_cards" USING btree ("user_id","item_kind","item_id");--> statement-breakpoint
CREATE INDEX "srs_cards_due_idx" ON "srs_cards" USING btree ("user_id","due");--> statement-breakpoint
CREATE INDEX "usage_user_time_idx" ON "usage_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "vocab_items_unique_idx" ON "vocab_items" USING btree ("user_id","lemma","pos",coalesce("phrase", ''));--> statement-breakpoint
CREATE INDEX "vocab_items_user_status_idx" ON "vocab_items" USING btree ("user_id","status");