import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { Level } from '$lib/game/level';

export const task = sqliteTable('task', {
	id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
	title: text('title').notNull(),
	priority: integer('priority').notNull().default(1)
});

/**
 * Levels authored in `/designer`.
 *
 * `data` is the whole `Level` object — it is already immutable and
 * serializable by design, so there is nothing to gain from shredding it into
 * columns. `name` and `description` are mirrored out of it purely so the
 * level list does not have to parse every blob, and `saveLevel` keeps
 * `data.id` equal to `id` so the two can never disagree.
 *
 * Built-in levels stay TypeScript modules in `src/lib/game/levels/` —
 * `tutorial01` is a fixture for the engine tests and must not need a database.
 */
export const level = sqliteTable('level', {
	id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
	name: text('name').notNull(),
	description: text('description'),
	data: text('data', { mode: 'json' }).$type<Level>().notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
});

export *  from './auth.schema';
