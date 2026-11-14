PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`is_primary` integer DEFAULT 0 NOT NULL,
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
INSERT INTO `__new_profiles`("id", "owner", "is_primary", "display_name", "lifecycle_stage", "status_subtype", "admission_basis", "program_end_date", "ead_end_date", "i94_expiration_date", "passport_expiration_date", "visa_expiration_date", "priority_date", "green_card_since", "green_card_expiration_date", "naturalization_basis", "created_at", "updated_at")
SELECT
	lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))),
	"owner",
	1,
	"display_name",
	"lifecycle_stage",
	"status_subtype",
	"admission_basis",
	"program_end_date",
	"ead_end_date",
	"i94_expiration_date",
	"passport_expiration_date",
	"visa_expiration_date",
	"priority_date",
	"green_card_since",
	"green_card_expiration_date",
	"naturalization_basis",
	"created_at",
	"updated_at"
FROM `profiles`;--> statement-breakpoint
INSERT INTO `__new_profiles` ("id", "owner", "is_primary", "display_name", "lifecycle_stage")
SELECT
	lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) || '-' || hex(randomblob(6))),
	"owners"."owner",
	1,
	'',
	'F1'
FROM (
	SELECT "owner" FROM `documents`
	UNION
	SELECT "owner" FROM `tracked_cases`
	UNION
	SELECT "owner" FROM `completed_actions`
) AS "owners"
WHERE NOT EXISTS (SELECT 1 FROM `__new_profiles` AS "p" WHERE "p"."owner" = "owners"."owner");--> statement-breakpoint
DROP TABLE `profiles`;--> statement-breakpoint
ALTER TABLE `__new_profiles` RENAME TO `profiles`;--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_owner_id_idx` ON `profiles` (`owner`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_owner_primary_idx` ON `profiles` (`owner`) WHERE "profiles"."is_primary" = 1;--> statement-breakpoint
CREATE INDEX `profiles_owner_idx` ON `profiles` (`owner`);--> statement-breakpoint
DROP INDEX `documents_owner_idx`;--> statement-breakpoint
ALTER TABLE `documents` ADD `profile_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `documents` SET `profile_id` = (SELECT `id` FROM `profiles` WHERE `profiles`.`owner` = `documents`.`owner` AND `profiles`.`is_primary` = 1 LIMIT 1) WHERE `profile_id` = '';--> statement-breakpoint
CREATE INDEX `documents_owner_idx` ON `documents` (`owner`);--> statement-breakpoint
CREATE INDEX `documents_owner_profile_idx` ON `documents` (`owner`,`profile_id`);--> statement-breakpoint
DROP INDEX `tracked_cases_owner_receipt_idx`;--> statement-breakpoint
ALTER TABLE `tracked_cases` ADD `profile_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `tracked_cases` SET `profile_id` = (SELECT `id` FROM `profiles` WHERE `profiles`.`owner` = `tracked_cases`.`owner` AND `profiles`.`is_primary` = 1 LIMIT 1) WHERE `profile_id` = '';--> statement-breakpoint
CREATE UNIQUE INDEX `tracked_cases_owner_profile_receipt_idx` ON `tracked_cases` (`owner`,`profile_id`,`receipt_number`);--> statement-breakpoint
CREATE INDEX `tracked_cases_owner_profile_idx` ON `tracked_cases` (`owner`,`profile_id`);--> statement-breakpoint
DROP INDEX `completed_actions_owner_key_idx`;--> statement-breakpoint
ALTER TABLE `completed_actions` ADD `profile_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `completed_actions` SET `profile_id` = (SELECT `id` FROM `profiles` WHERE `profiles`.`owner` = `completed_actions`.`owner` AND `profiles`.`is_primary` = 1 LIMIT 1) WHERE `profile_id` = '';--> statement-breakpoint
CREATE UNIQUE INDEX `completed_actions_owner_profile_key_idx` ON `completed_actions` (`owner`,`profile_id`,`action_key`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
