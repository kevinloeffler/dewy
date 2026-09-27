import {
	blob,
	check,
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
	type AnySQLiteColumn
} from 'drizzle-orm/sqlite-core';
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
	/**
	 * Where a copy came from. Provenance only — access is never read from it, so
	 * losing the original (`set null`) costs a breadcrumb and nothing else.
	 */
	copiedFromId: text('copied_from_id').references((): AnySQLiteColumn => course.id, {
		onDelete: 'set null'
	}),
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
		/**
		 * A level this item *borrows* rather than owns — the live end of a shared
		 * level.
		 *
		 * `level.item_id` points up at its item and is `UNIQUE`, which is what
		 * makes "owned by exactly one stage" a database guarantee; a shared level
		 * appearing in a second course must not touch that. So a level item has
		 * one of two shapes and `courses.ts` keeps them apart:
		 *
		 *   owned  — a `level` row with `item_id = this item`, and this column null
		 *   linked — this column set, and no `level` row pointing here
		 *
		 * `restrict` rather than `cascade`: the owner deleting a level that another
		 * teacher's course is showing should be refused, not silently punch a hole
		 * in someone else's stage. `levels.deleteLevel` is where that is said out
		 * loud.
		 */
		linkedLevelId: text('linked_level_id').references((): AnySQLiteColumn => level.id, {
			onDelete: 'restrict'
		}),
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
 * A row with no `item_id` is a **playground**: a standalone level that belongs
 * to no course. Playgrounds are a thing teachers make on purpose (`/admin/playgrounds`),
 * not the leftovers bucket they started as, which is why `owner_id` exists.
 *
 * Built-in levels stay TypeScript modules in `src/lib/game/levels/` —
 * `tutorial01` is a fixture for the engine tests and must not need a database.
 */
export const level = sqliteTable('level', {
	id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
	/**
	 * The stage item that owns this level, or `null` for a playground.
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
	/**
	 * Who may edit this level when no course answers that question — i.e. for a
	 * playground. A level inside a course takes its permissions from the course
	 * and this column is only provenance there.
	 *
	 * `null` means "written before playgrounds had owners"; `assertCanEditLevel`
	 * lets any teacher adopt one, exactly as `canEditCourse` does for a course
	 * with no owner. `set null` on user delete for the same reason as `course`:
	 * losing the author must not take the level with it.
	 */
	ownerId: text('owner_id').references(() => user.id, { onDelete: 'set null' }),
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

/**
 * A class: the group a teacher actually works with, and the unit that carries
 * course access.
 *
 * Exported as `schoolClass` because `class` is a reserved word; the table is
 * `class`. `ownerId` is the teacher who runs it, and it is read — unlike
 * `course.ownerId` was before roles existed, this one is the whole authorization
 * story for teachers: `users.ts` decides who may touch a student by asking
 * whether they share a class with the teacher asking.
 */
export const schoolClass = sqliteTable('class', {
	id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
	name: text('name').notNull(),
	ownerId: text('owner_id').references(() => user.id, { onDelete: 'set null' }),
	/**
	 * Set when the class is put away at the end of a year. Its students keep
	 * their accounts and their progress; the class simply stops appearing.
	 */
	archivedAt: integer('archived_at', { mode: 'timestamp' }),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
});

/**
 * Students in a class. Students only — co-teaching a class is deliberately not
 * modelled yet, and adding it later is one nullable `role` column here rather
 * than a reshape.
 *
 * "A student may be in one or more classes" needs no structure beyond this
 * table: it is simply several rows, and the unique index is what stops the same
 * student being added twice.
 */
export const classMember = sqliteTable(
	'class_member',
	{
		id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
		classId: text('class_id')
			.notNull()
			.references(() => schoolClass.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		addedAt: integer('added_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
	},
	(t) => [
		uniqueIndex('class_member_class_user_idx').on(t.classId, t.userId),
		index('class_member_user_idx').on(t.userId)
	]
);

/**
 * The courses a class works through.
 *
 * This is what a signed-in student's catalogue is built from. A student who
 * belongs to no class still sees every published course, which is the behaviour
 * `/courses` had before classes existed and the behaviour anonymous visitors
 * keep.
 */
export const classCourse = sqliteTable(
	'class_course',
	{
		id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
		classId: text('class_id')
			.notNull()
			.references(() => schoolClass.id, { onDelete: 'cascade' }),
		courseId: text('course_id')
			.notNull()
			.references(() => course.id, { onDelete: 'cascade' }),
		assignedAt: integer('assigned_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
	},
	(t) => [
		uniqueIndex('class_course_idx').on(t.classId, t.courseId),
		index('class_course_course_idx').on(t.courseId)
	]
);

/**
 * A course shared with another teacher as a **live, read-only link**.
 *
 * The recipient sees the owner's course as it is now — later edits by the owner
 * show up for them too — and may assign it to their classes, but never edit it.
 * That is the whole difference from a copy, which is a deep duplicate the
 * recipient owns outright (`course.copiedFromId` records where it came from).
 *
 * `courses.assertCanEditCourse` is what enforces the read-only half; this table
 * only records who can see it.
 */
export const courseShare = sqliteTable(
	'course_share',
	{
		id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
		courseId: text('course_id')
			.notNull()
			.references(() => course.id, { onDelete: 'cascade' }),
		teacherId: text('teacher_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
	},
	(t) => [
		uniqueIndex('course_share_idx').on(t.courseId, t.teacherId),
		index('course_share_teacher_idx').on(t.teacherId)
	]
);

/** The same arrangement for a single level, which `stage_item.linked_level_id` consumes. */
export const levelShare = sqliteTable(
	'level_share',
	{
		id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
		levelId: text('level_id')
			.notNull()
			.references(() => level.id, { onDelete: 'cascade' }),
		teacherId: text('teacher_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
	},
	(t) => [
		uniqueIndex('level_share_idx').on(t.levelId, t.teacherId),
		index('level_share_teacher_idx').on(t.teacherId)
	]
);

/**
 * An image a teacher dropped into a markdown editor, served at `/images/[id]`.
 *
 * The bytes live in the database rather than on disk so the one `/data` volume
 * stays the whole backup. Content refers to an image by URL only, which is why
 * copying or sharing a course needs no image bookkeeping — and why nothing here
 * is deleted when the text that used it changes: a copy or an undo may still
 * point at it. `owner_id` is provenance, not permission; serving is public by
 * unguessable id, just as published courses are readable without signing in.
 */
export const image = sqliteTable('image', {
	id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
	ownerId: text('owner_id').references(() => user.id, { onDelete: 'set null' }),
	mime: text('mime').notNull(),
	bytes: blob('bytes', { mode: 'buffer' }).notNull(),
	size: integer('size').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date())
});

export * from './auth.schema';
