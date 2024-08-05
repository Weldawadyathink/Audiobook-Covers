CREATE TABLE IF NOT EXISTS "audiobook-covers-next_image" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source" text,
	"extension" text,
	"hash" text,
	"embedding" vector(768),
	"searchable" boolean,
	CONSTRAINT "audiobook-covers-next_image_hash_unique" UNIQUE("hash")
);
