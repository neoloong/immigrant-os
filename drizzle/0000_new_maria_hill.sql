CREATE TABLE `completed_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`action_key` text NOT NULL,
	`completed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `completed_actions_owner_key_idx` ON `completed_actions` (`owner`,`action_key`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`kind` text DEFAULT 'Other' NOT NULL,
	`filename` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`object_key` text NOT NULL,
	`uploaded_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `documents_owner_idx` ON `documents` (`owner`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`owner` text PRIMARY KEY NOT NULL,
	`display_name` text DEFAULT '' NOT NULL,
	`lifecycle_stage` text NOT NULL,
	`status_subtype` text DEFAULT '' NOT NULL,
	`admission_basis` text DEFAULT '' NOT NULL,
	`program_end_date` text,
	`ead_end_date` text,
	`i94_expiration_date` text,
	`passport_expiration_date` text,
	`visa_expiration_date` text,
	`priority_date` text,
	`green_card_since` text,
	`green_card_expiration_date` text,
	`naturalization_basis` text DEFAULT 'five_year' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tracked_cases` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`receipt_number` text NOT NULL,
	`form_type` text DEFAULT '' NOT NULL,
	`nickname` text DEFAULT '' NOT NULL,
	`status_text` text DEFAULT 'Not checked' NOT NULL,
	`last_checked_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tracked_cases_owner_receipt_idx` ON `tracked_cases` (`owner`,`receipt_number`);