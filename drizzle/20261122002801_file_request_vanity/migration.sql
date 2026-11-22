ALTER TABLE "FileRequest" ADD COLUMN "vanity" text;--> statement-breakpoint
CREATE UNIQUE INDEX "file_request_vanity_key" ON "FileRequest" ("vanity");