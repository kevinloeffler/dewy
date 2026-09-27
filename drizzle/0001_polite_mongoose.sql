CREATE TABLE `image` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text,
	`mime` text NOT NULL,
	`bytes` blob NOT NULL,
	`size` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
