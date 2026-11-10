CREATE TABLE `agent_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`token_hash` text NOT NULL,
	`label` text NOT NULL,
	`scopes` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL,
	`last_used_at` text,
	`revoked_at` text,
	CONSTRAINT "agent_tokens_scopes_check" CHECK("agent_tokens"."scopes" IN ('read', 'write'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_tokens_hash_idx` ON `agent_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `agent_tokens_owner_idx` ON `agent_tokens` (`owner`);