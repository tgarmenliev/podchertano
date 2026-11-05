CREATE TABLE "source_images" (
	"source_id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"mime" text DEFAULT 'image/jpeg' NOT NULL,
	"bytes" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "source_images" ADD CONSTRAINT "source_images_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_images" ADD CONSTRAINT "source_images_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;