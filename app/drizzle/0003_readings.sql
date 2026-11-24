CREATE TABLE "readings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"words" jsonb NOT NULL,
	"questions" jsonb NOT NULL,
	"model" text,
	"prompt_version" text,
	"cost_micro_eur" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"answers" jsonb,
	"score" integer,
	"peeked" jsonb,
	"duration_ms" integer,
	"reported" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "readings" ADD CONSTRAINT "readings_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "readings_user_created_idx" ON "readings" USING btree ("user_id","created_at");