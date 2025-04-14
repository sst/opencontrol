DROP INDEX "account_number";--> statement-breakpoint
CREATE UNIQUE INDEX "account_number_region" ON "aws_account" USING btree ("workspace_id","account_number","region");