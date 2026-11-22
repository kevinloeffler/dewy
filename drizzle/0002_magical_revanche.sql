CREATE TABLE `llm_config` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`course_id` text,
	`base_url` text NOT NULL,
	`model` text NOT NULL,
	`reasoning_effort` text,
	`api_key_ciphertext` text NOT NULL,
	`api_key_hint` text NOT NULL,
	`last_error` text,
	`last_error_at` integer,
	`last_ok_at` integer,
	`updated_by_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`updated_by_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "llm_config_scope_shape" CHECK(("llm_config"."scope" = 'app' AND "llm_config"."course_id" IS NULL)
			 OR ("llm_config"."scope" = 'course' AND "llm_config"."course_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `llm_config_course_idx` ON `llm_config` (`course_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `llm_config_app_idx` ON `llm_config` (`scope`) WHERE "llm_config"."scope" = 'app';--> statement-breakpoint
CREATE TABLE `llm_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`at` integer NOT NULL,
	`feature` text NOT NULL,
	`user_id` text,
	`course_id` text,
	`config_scope` text,
	`fell_back` integer DEFAULT false NOT NULL,
	`outcome` text NOT NULL,
	`model` text,
	`prompt_tokens` integer,
	`completion_tokens` integer,
	`latency_ms` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`course_id`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `llm_usage_at_idx` ON `llm_usage` (`at`);--> statement-breakpoint
CREATE INDEX `llm_usage_course_idx` ON `llm_usage` (`course_id`);