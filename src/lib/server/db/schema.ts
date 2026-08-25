import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { user } from './auth.schema';
import type { Level } from '$lib/game/level';

export const task = sqliteTable('task', {
	id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
	title: text('title').notNull(),
	priority: integer('priority').notNull().default(1)
});

/**
 * A course is the unit a class works through: an ordered run of stages, each an
 * ordered run of items.
 *
 * `ownerId` is recorded even though nothing reads it yet. There are no roles and
 * `/courses` is unauthenticated — matching `/designer` — but writing the author
 * down now means turning ownership on later is a guard, not a migration.
 */
export const course = sqliteTable('course', {
	id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
	title: text('title').notNull(),
	description: text('description'),
	ownerId: text('owner_id').references(() => user.id, { onDelete: 'set null' }),
	published: integer('published', { mode: 'boolean' }).notNull().default(false),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
});

export const stage = sqliteTable(
	'stage',
	{
		id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
		courseId: text('course_id')
			.notNull()
			.references(() => course.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		description: text('description'),
		/** Dense and 0-based within the course. `courses.ts` is what keeps it dense. */
		position: integer('position').notNull(),
		/**
		 * When set, this stage stays shut until every level in the stage before it
		 * is complete — a checkpoint a class crosses together, rather than the
		 * item-by-item unlocking that applies everywhere else.
		 *
		 * The rule itself lives in `$lib/progress`; this column only records the
		 * teacher's intent. The first stage of a course has nothing in front of it,
		 * so the flag is inert there.
		 */
		gated: integer('gated', { mode: 'boolean' }).notNull().default(false),
		/**
		 * Whether the items inside this stage have to be taken in order.
		 *
		 * Defaults to on, which is how the course behaved before the flag existed.
		 * Turned off, the whole stage opens at once and a class can pick its way
		 * through in any order — a stage of practice levels rather than a sequence
		 * that builds. `$lib/progress` holds the rule.
		 */
		ordered: integer('ordered', { mode: 'boolean' }).notNull().default(true),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
	},
	(t) => [index('stage_course_position_idx').on(t.courseId, t.position)]
);

/**
 * The ordering spine — one row per item, whatever kind it is.
 *
 * Levels and theory blocks interleave inside a stage, so the student's path has
 * to be a single indexed sequence rather than two lists merged at read time.
 * That is also what lets `item_progress` point at one table instead of a
 * polymorphic pair.
 *
 * `title` and `body` are theory-only. A level item takes its label from the
 * level that points at it, so there is no denormalised name to keep in sync.
 */
export const stageItem = sqliteTable(
	'stage_item',
	{
		id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
		stageId: text('stage_id')
			.notNull()
			.references(() => stage.id, { onDelete: 'cascade' }),
		kind: text('kind', { enum: ['level', 'theory'] }).notNull(),
		title: text('title'),
		/** Markdown source. Rendered by `$lib/markdown`, never stored as HTML. */
		body: text('body'),
		position: integer('position').notNull(),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
		updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
	},
	(t) => [
		index('stage_item_stage_position_idx').on(t.stageId, t.position),
		// A backstop, not the enforcement of record — `courses.ts` is the only writer.
		check(
			'stage_item_shape',
			sql`(${t.kind} = 'theory' AND ${t.title} IS NOT NULL AND ${t.body} IS NOT NULL)
			 OR (${t.kind} = 'level' AND ${t.title} IS NULL AND ${t.body} IS NULL)`
		)
	]
);

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
	/**
	 * The stage item that owns this level, or `null` for a level that belongs to
	 * no course.
	 *
	 * The reference points *up* on purpose: deleting the item — or the stage or
	 * course above it — takes the level with it, which is the direction the data
	 * actually flows. The alternative edge (`stage_item.level_id`) would leave
	 * app code chasing orphans every time a stage was removed. `UNIQUE` is what
	 * makes "owned by exactly one stage" a database guarantee.
	 */
	itemId: text('item_id')
		.unique()
		.references(() => stageItem.id, { onDelete: 'cascade' }),
	name: text('name').notNull(),
	description: text('description'),
	data: text('data', { mode: 'json' }).$type<Level>().notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
});

/**
 * Per-user completion. The row existing *is* the completion, so there is no
 * boolean to fall out of sync.
 *
 * `code` keeps the program that solved a level. Completion is client-asserted
 * today — the engine runs in the browser — and storing the source means
 * re-verifying it server-side later is a feature rather than a migration:
 * `GameEngine` is already DOM-free and runs under vitest in plain Node.
 */
export const itemProgress = sqliteTable(
	'item_progress',
	{
		id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		itemId: text('item_id')
			.notNull()
			.references(() => stageItem.id, { onDelete: 'cascade' }),
		completedAt: integer('completed_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		attempts: integer('attempts').notNull().default(1),
		code: text('code')
	},
	(t) => [
		uniqueIndex('item_progress_user_item_idx').on(t.userId, t.itemId),
		index('item_progress_user_idx').on(t.userId)
	]
);

export * from './auth.schema';
