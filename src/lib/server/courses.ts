import { and, asc, count, desc, eq, inArray, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { db } from '$lib/server/db';
import {
	classCourse,
	classMember,
	course,
	courseShare,
	levelShare,
	level as levelTable,
	schoolClass,
	stage,
	stageItem,
	user
} from '$lib/server/db/schema';
import { buildEmptyLevel, InvalidLevel } from '$lib/server/levels';
import { parseLevel } from '$lib/game/editor/parse';
import { shift, type Direction } from '$lib/ordering';
import { Forbidden, type Actor } from '$lib/server/users';
import { isStaff, roleOf } from '$lib/roles';
import type { Level } from '$lib/game/level';

/**
 * A level a stage borrows rather than owns. It hangs off
 * `stage_item.linked_level_id`, so resolving it needs a second join against the
 * same table as the owned one.
 */
const linkedLevel = alias(levelTable, 'linked_level');

/**
 * Reading and writing courses, stages and stage items.
 *
 * This module is the only writer of the curriculum tables, so it is also where
 * the invariants live: positions stay dense, a theory item always has a title
 * and body, and a level item always has exactly one level pointing at it. The
 * database backstops all three (a CHECK on `stage_item`, `UNIQUE` on
 * `level.item_id`), but the readable version of the rule is here.
 *
 * A note that matters at every `db.transaction` below: better-sqlite3 is a
 * **synchronous** driver and throws if the callback returns a promise. Inside a
 * transaction use `.all()` / `.get()` / `.run()`, never `await`. The exported
 * functions stay `async` to match `levels.ts` and to leave room for a different
 * driver later.
 */

export const MAX_THEORY_BODY = 20_000;

export type CourseSummary = {
	id: string;
	title: string;
	description: string | null;
	published: boolean;
	stageCount: number;
	itemCount: number;
	updatedAt: Date;
};

export type StageItemView =
	| { id: string; kind: 'theory'; position: number; title: string; body: string }
	| {
			id: string;
			kind: 'level';
			position: number;
			levelId: string;
			name: string;
			description: string | null;
			/**
			 * A level this stage borrows from another teacher rather than owns.
			 * It plays identically; it just cannot be edited from here.
			 */
			linked: boolean;
	  };

export type StageView = {
	id: string;
	title: string;
	description: string | null;
	position: number;
	/** Shut until the stage before it is finished. See `$lib/progress`. */
	gated: boolean;
	/** Items have to be taken top to bottom. See `$lib/progress`. */
	ordered: boolean;
	items: StageItemView[];
};

export type CourseOutline = {
	id: string;
	title: string;
	description: string | null;
	published: boolean;
	stages: StageView[];
};

/** Everything the player needs for one item, including where it sits. */
export type ItemContext = {
	course: { id: string; title: string };
	stage: { id: string; title: string };
	item: StageItemView;
	/** Parsed from the blob for a level item; `null` for theory. */
	level: Level | null;
	prevItemId: string | null;
	nextItemId: string | null;
	/** 1-based across the whole course. */
	index: number;
	total: number;
};

export class InvalidItem extends Error {
	constructor(readonly errors: string[]) {
		super(`invalid item: ${errors.join('; ')}`);
	}
}

// ============================================================
// Who may edit a course
// ============================================================

/**
 * Sharing, in two flavours.
 *
 * A **clone** is a live read-only link: `course_share` records who can see the
 * owner's course, the owner's later edits reach them, and `assertCanEditCourse`
 * is what stops them writing to it. A **copy** is `duplicateCourse` — a deep
 * duplicate the recipient owns outright, with `copiedFromId` left behind purely
 * as provenance.
 *
 * Ownership is `course.ownerId`, which has been recorded since courses existed
 * against exactly this day:
 *
 * > "writing the author down now means turning ownership on later is a guard,
 * > not a migration."
 */

/** Who owns a course, and `null` for a course written before ownership was read. */
async function ownerOf(courseId: string): Promise<string | null | undefined> {
	const row = await db
		.select({ ownerId: course.ownerId })
		.from(course)
		.where(eq(course.id, courseId))
		.get();
	return row ? row.ownerId : undefined;
}

export async function canEditCourse(actor: Actor, courseId: string): Promise<boolean> {
	if (roleOf(actor.user) === 'admin') return true;

	const ownerId = await ownerOf(courseId);
	if (ownerId === undefined) return false;

	// A course from before roles existed has no owner. Refusing every teacher
	// would strand the existing curriculum; any teacher may adopt it by editing.
	return ownerId === null || ownerId === actor.user.id;
}

/**
 * The gate on every write below.
 *
 * A recipient of a clone fails this — that is the whole of "can't be edited".
 * A recipient of a copy owns their own row and passes.
 */
export async function assertCanEditCourse(actor: Actor, courseId: string): Promise<void> {
	if (!(await canEditCourse(actor, courseId))) {
		throw new Forbidden('Dieser Kurs gehört einer anderen Lehrperson.');
	}
}

/** The stage's course, so stage- and item-level writes can be gated the same way. */
async function courseOfStage(stageId: string): Promise<string | null> {
	const row = await db
		.select({ courseId: stage.courseId })
		.from(stage)
		.where(eq(stage.id, stageId))
		.get();
	return row?.courseId ?? null;
}

async function courseOfItem(itemId: string): Promise<string | null> {
	const row = await db
		.select({ courseId: stage.courseId })
		.from(stageItem)
		.innerJoin(stage, eq(stage.id, stageItem.stageId))
		.where(eq(stageItem.id, itemId))
		.get();
	return row?.courseId ?? null;
}

export async function assertCanEditStage(actor: Actor, stageId: string): Promise<void> {
	const courseId = await courseOfStage(stageId);
	if (!courseId) throw new Forbidden('Dieses Kapitel gibt es nicht.');
	await assertCanEditCourse(actor, courseId);
}

export async function assertCanEditItem(actor: Actor, itemId: string): Promise<void> {
	const courseId = await courseOfItem(itemId);
	if (!courseId) throw new Forbidden('Dieses Element gibt es nicht.');
	await assertCanEditCourse(actor, courseId);
}

// ============================================================
// Courses
// ============================================================

export async function listCourses(
	options: { publishedOnly?: boolean } = {}
): Promise<CourseSummary[]> {
	const rows = await db.select().from(course).orderBy(asc(course.title));
	const visible = options.publishedOnly ? rows.filter((row) => row.published) : rows;
	if (visible.length === 0) return [];

	const ids = visible.map((row) => row.id);

	const stageCounts = await db
		.select({ courseId: stage.courseId, total: count() })
		.from(stage)
		.where(inArray(stage.courseId, ids))
		.groupBy(stage.courseId);

	const itemCounts = await db
		.select({ courseId: stage.courseId, total: count() })
		.from(stageItem)
		.innerJoin(stage, eq(stage.id, stageItem.stageId))
		.where(inArray(stage.courseId, ids))
		.groupBy(stage.courseId);

	const stagesBy = new Map(stageCounts.map((row) => [row.courseId, row.total]));
	const itemsBy = new Map(itemCounts.map((row) => [row.courseId, row.total]));

	return visible.map((row) => ({
		id: row.id,
		title: row.title,
		description: row.description,
		published: row.published,
		stageCount: stagesBy.get(row.id) ?? 0,
		itemCount: itemsBy.get(row.id) ?? 0,
		updatedAt: row.updatedAt
	}));
}

/** Just enough of a session user to answer "what may they see?". */
export type Viewer = { id: string; role?: string | null } | null | undefined;

/**
 * The catalogue for one student.
 *
 * A student sees the courses their classes were assigned, and nothing else. No
 * assignment means an empty catalogue, not the whole shelf: what a class is
 * given is the curriculum, and a student who has been given nothing yet is
 * waiting for their teacher rather than free to roam.
 *
 * Staff and signed-out visitors still see every published course — the former
 * because `/courses` is how they preview what they publish, the latter because
 * the catalogue is the public front door.
 */
export async function listCoursesFor(user: Viewer): Promise<CourseSummary[]> {
	if (!user || isStaff(user)) return listCourses({ publishedOnly: true });

	const assigned = await db
		.selectDistinct({ courseId: classCourse.courseId })
		.from(classCourse)
		.innerJoin(classMember, eq(classMember.classId, classCourse.classId))
		.innerJoin(schoolClass, eq(schoolClass.id, classCourse.classId))
		.where(and(eq(classMember.userId, user.id), isNull(schoolClass.archivedAt)));

	// Nothing assigned, nothing to list — and no reason to read the shelf first.
	if (assigned.length === 0) return [];

	const ids = new Set(assigned.map((row) => row.courseId));
	return (await listCourses({ publishedOnly: true })).filter((row) => ids.has(row.id));
}

/** Whether this course is reachable by this student, for the course page's 404. */
export async function canSeeCourse(user: Viewer, courseId: string): Promise<boolean> {
	return (await listCoursesFor(user)).some((row) => row.id === courseId);
}

/**
 * The whole course tree.
 *
 * Deliberately does not select `level.data`: a twelve-item course would drag
 * twelve full level blobs into memory to render a list of names. Only
 * `findItem` parses a blob, and only the one it needs.
 */
export async function findCourse(courseId: string): Promise<CourseOutline | null> {
	const [row] = await db.select().from(course).where(eq(course.id, courseId)).limit(1);
	if (!row) return null;

	const stages = await db
		.select()
		.from(stage)
		.where(eq(stage.courseId, courseId))
		.orderBy(asc(stage.position));

	const items =
		stages.length === 0
			? []
			: await db
					.select({
						id: stageItem.id,
						stageId: stageItem.stageId,
						kind: stageItem.kind,
						title: stageItem.title,
						body: stageItem.body,
						position: stageItem.position,
						levelId: levelTable.id,
						levelName: levelTable.name,
						levelDescription: levelTable.description,
						linkedId: linkedLevel.id,
						linkedName: linkedLevel.name,
						linkedDescription: linkedLevel.description
					})
					.from(stageItem)
					.leftJoin(levelTable, eq(levelTable.itemId, stageItem.id))
					.leftJoin(linkedLevel, eq(linkedLevel.id, stageItem.linkedLevelId))
					.where(
						inArray(
							stageItem.stageId,
							stages.map((s) => s.id)
						)
					)
					.orderBy(asc(stageItem.position));

	const byStage = new Map<string, StageItemView[]>();
	for (const item of items) {
		const view: StageItemView =
			item.kind === 'theory'
				? {
						id: item.id,
						kind: 'theory',
						position: item.position,
						title: item.title ?? 'Ohne Titel',
						body: item.body ?? ''
					}
				: {
						id: item.id,
						kind: 'level',
						position: item.position,
						// A level item without its level row is only possible if a
						// write was interrupted; showing it as a placeholder beats
						// dropping it silently out of the stage.
						levelId: item.levelId ?? item.linkedId ?? '',
						name: item.levelName ?? item.linkedName ?? 'Fehlendes Level',
						description: item.levelDescription ?? item.linkedDescription ?? null,
						linked: item.levelId === null && item.linkedId !== null
					};

		const list = byStage.get(item.stageId);
		if (list) list.push(view);
		else byStage.set(item.stageId, [view]);
	}

	return {
		id: row.id,
		title: row.title,
		description: row.description,
		published: row.published,
		stages: stages.map((s) => ({
			id: s.id,
			title: s.title,
			description: s.description,
			position: s.position,
			gated: s.gated,
			ordered: s.ordered,
			items: byStage.get(s.id) ?? []
		}))
	};
}

export async function createCourse(title: string, ownerId?: string): Promise<string> {
	const id = crypto.randomUUID();
	await db.insert(course).values({
		id,
		title: title.trim() || 'Kurs ohne Titel',
		ownerId: ownerId ?? null
	});
	return id;
}

export async function updateCourse(
	courseId: string,
	patch: { title?: string; description?: string | null; published?: boolean }
): Promise<void> {
	const set: Record<string, unknown> = { updatedAt: new Date() };
	if (patch.title !== undefined) set.title = patch.title.trim() || 'Kurs ohne Titel';
	if (patch.description !== undefined) set.description = patch.description?.trim() || null;
	if (patch.published !== undefined) set.published = patch.published;

	await db.update(course).set(set).where(eq(course.id, courseId));
}

/** One delete — the cascade clears stages, items and their levels. */
/**
 * Refuses to delete anything that would take a level out from under a course
 * borrowing it.
 *
 * Deleting a course, a stage or a level item cascades down to the `level` rows
 * beneath it — and a level another teacher linked into their own stage is
 * protected by a `restrict` foreign key, so the delete fails anyway. It fails as
 * `FOREIGN KEY constraint failed`, which is true and useless. This turns it into
 * the sentence the teacher needs, before the write is attempted.
 */
async function assertNoBorrowedLevels(levelIds: string[]): Promise<void> {
	if (levelIds.length === 0) return;

	const borrowed = await db
		.select({ name: levelTable.name })
		.from(stageItem)
		.innerJoin(levelTable, eq(levelTable.id, stageItem.linkedLevelId))
		.where(inArray(stageItem.linkedLevelId, levelIds))
		.limit(1);

	if (borrowed.length > 0) {
		throw new Forbidden(
			`Der Kurs einer anderen Lehrperson verwendet „${borrowed[0].name}“. Heb die Freigabe auf, bevor du löschst.`
		);
	}
}

/** Every level owned by an item in this course. */
async function levelIdsOfCourse(courseId: string): Promise<string[]> {
	const rows = await db
		.select({ id: levelTable.id })
		.from(levelTable)
		.innerJoin(stageItem, eq(stageItem.id, levelTable.itemId))
		.innerJoin(stage, eq(stage.id, stageItem.stageId))
		.where(eq(stage.courseId, courseId));
	return rows.map((row) => row.id);
}

async function levelIdsOfStage(stageId: string): Promise<string[]> {
	const rows = await db
		.select({ id: levelTable.id })
		.from(levelTable)
		.innerJoin(stageItem, eq(stageItem.id, levelTable.itemId))
		.where(eq(stageItem.stageId, stageId));
	return rows.map((row) => row.id);
}

async function levelIdsOfItem(itemId: string): Promise<string[]> {
	const rows = await db.select({ id: levelTable.id }).from(levelTable).where(eq(levelTable.itemId, itemId));
	return rows.map((row) => row.id);
}

export async function deleteCourse(courseId: string): Promise<void> {
	await assertNoBorrowedLevels(await levelIdsOfCourse(courseId));
	await db.delete(course).where(eq(course.id, courseId));
}

// ============================================================
// Sharing
// ============================================================

export type SharedCourse = CourseSummary & { ownerName: string | null };

/** What a teacher sees in `/admin/courses`: their own courses, and the clones they hold. */
export async function listCoursesForTeacher(
	actor: Actor
): Promise<{ owned: CourseSummary[]; shared: SharedCourse[] }> {
	const all = await listCourses();

	if (roleOf(actor.user) === 'admin') return { owned: all, shared: [] };

	// A course with no owner predates ownership; `canEditCourse` lets any teacher
	// adopt it, so it belongs in the editable list rather than nowhere.
	const owned = [];
	for (const row of all) {
		if (await canEditCourse(actor, row.id)) owned.push(row);
	}

	const shares = await db
		.select({ courseId: courseShare.courseId, ownerName: user.name })
		.from(courseShare)
		.leftJoin(course, eq(course.id, courseShare.courseId))
		.leftJoin(user, eq(user.id, course.ownerId))
		.where(eq(courseShare.teacherId, actor.user.id));

	const ownedIds = new Set(owned.map((row) => row.id));
	const ownerBy = new Map(shares.map((row) => [row.courseId, row.ownerName]));

	const shared = all
		.filter((row) => ownerBy.has(row.id) && !ownedIds.has(row.id))
		.map((row) => ({ ...row, ownerName: ownerBy.get(row.id) ?? null }));

	return { owned, shared };
}

/** Whether this teacher may *see* the course at all — to open, clone or copy it. */
export async function canViewCourse(actor: Actor, courseId: string): Promise<boolean> {
	if (await canEditCourse(actor, courseId)) return true;

	const share = await db
		.select({ id: courseShare.id })
		.from(courseShare)
		.where(and(eq(courseShare.courseId, courseId), eq(courseShare.teacherId, actor.user.id)))
		.get();

	return Boolean(share);
}

export async function listCourseShares(
	actor: Actor,
	courseId: string
): Promise<{ teacherId: string; name: string; email: string }[]> {
	await assertCanEditCourse(actor, courseId);

	return db
		.select({ teacherId: courseShare.teacherId, name: user.name, email: user.email })
		.from(courseShare)
		.innerJoin(user, eq(user.id, courseShare.teacherId))
		.where(eq(courseShare.courseId, courseId))
		.orderBy(asc(user.name));
}

export async function shareCourse(
	actor: Actor,
	courseId: string,
	teacherId: string
): Promise<void> {
	await assertCanEditCourse(actor, courseId);
	if (teacherId === actor.user.id) return;

	await db.insert(courseShare).values({ courseId, teacherId }).onConflictDoNothing();
}

export async function unshareCourse(
	actor: Actor,
	courseId: string,
	teacherId: string
): Promise<void> {
	await assertCanEditCourse(actor, courseId);
	await db
		.delete(courseShare)
		.where(and(eq(courseShare.courseId, courseId), eq(courseShare.teacherId, teacherId)));
}

/**
 * A copy: the whole tree duplicated, owned by the person who asked for it.
 *
 * Every id is minted fresh and each level blob's `data.id` is rewritten to match
 * its new row — the same rule `saveLevel` enforces, so the copy is as valid as
 * anything the designer writes. A **linked** level is copied as a link, not
 * deep-copied: it was never the source course's to hand on.
 *
 * The copy starts unpublished. Somebody else's course appearing live in your
 * catalogue the instant you duplicate it is not what anyone means by "copy".
 */
export async function duplicateCourse(actor: Actor, courseId: string): Promise<string> {
	if (!(await canViewCourse(actor, courseId))) {
		throw new Forbidden('Dieser Kurs wurde nicht mit dir geteilt.');
	}

	const source = await db.select().from(course).where(eq(course.id, courseId)).get();
	if (!source) throw new Forbidden('Diesen Kurs gibt es nicht.');

	const stages = await db
		.select()
		.from(stage)
		.where(eq(stage.courseId, courseId))
		.orderBy(asc(stage.position));

	const items =
		stages.length === 0
			? []
			: await db
					.select({
						item: stageItem,
						level: levelTable
					})
					.from(stageItem)
					.leftJoin(levelTable, eq(levelTable.itemId, stageItem.id))
					.where(
						inArray(
							stageItem.stageId,
							stages.map((row) => row.id)
						)
					)
					.orderBy(asc(stageItem.position));

	const newCourseId = crypto.randomUUID();

	// Synchronous throughout: better-sqlite3 throws if the callback returns a
	// promise, so every id is minted before the transaction opens.
	db.transaction((tx) => {
		tx.insert(course)
			.values({
				id: newCourseId,
				title: `${source.title} (copy)`,
				description: source.description,
				ownerId: actor.user.id,
				copiedFromId: source.id,
				published: false
			})
			.run();

		for (const sourceStage of stages) {
			const newStageId = crypto.randomUUID();
			tx.insert(stage)
				.values({
					id: newStageId,
					courseId: newCourseId,
					title: sourceStage.title,
					description: sourceStage.description,
					position: sourceStage.position,
					gated: sourceStage.gated,
					ordered: sourceStage.ordered
				})
				.run();

			for (const row of items) {
				if (row.item.stageId !== sourceStage.id) continue;

				const newItemId = crypto.randomUUID();
				tx.insert(stageItem)
					.values({
						id: newItemId,
						stageId: newStageId,
						kind: row.item.kind,
						title: row.item.title,
						body: row.item.body,
						position: row.item.position,
						// A borrowed level stays borrowed — copying a course does not
						// give you a level its author only lent to it.
						linkedLevelId: row.item.linkedLevelId
					})
					.run();

				if (row.level) {
					const newLevelId = crypto.randomUUID();
					tx.insert(levelTable)
						.values({
							id: newLevelId,
							itemId: newItemId,
							name: row.level.name,
							description: row.level.description,
							// `data.id` must equal the row id, exactly as `saveLevel` keeps it.
							data: { ...row.level.data, id: newLevelId }
						})
						.run();
				}
			}
		}
	});

	return newCourseId;
}

// ============================================================
// Sharing levels
// ============================================================

export type SharedLevel = {
	id: string;
	name: string;
	description: string | null;
	ownerName: string | null;
	courseTitle: string | null;
};

/** Levels other teachers have shared with this one, for the "add a level" picker. */
export async function listSharedLevels(actor: Actor): Promise<SharedLevel[]> {
	return db
		.select({
			id: levelTable.id,
			name: levelTable.name,
			description: levelTable.description,
			ownerName: user.name,
			courseTitle: course.title
		})
		.from(levelShare)
		.innerJoin(levelTable, eq(levelTable.id, levelShare.levelId))
		.leftJoin(stageItem, eq(stageItem.id, levelTable.itemId))
		.leftJoin(stage, eq(stage.id, stageItem.stageId))
		.leftJoin(course, eq(course.id, stage.courseId))
		.leftJoin(user, eq(user.id, course.ownerId))
		.where(eq(levelShare.teacherId, actor.user.id))
		.orderBy(asc(levelTable.name));
}

/**
 * Who may edit or share a level — asked of the course it sits in, or, for a
 * playground, of the level itself.
 *
 * The two halves of the level table answer this differently. A level inside a
 * course inherits the course's permissions, which is what makes a clone
 * read-only all the way down. A playground has no course, so `level.owner_id`
 * is the whole answer, read exactly as `canEditCourse` reads `course.owner_id`:
 * a null owner is a row from before ownership existed and any teacher may adopt
 * it, rather than one nobody can touch.
 */
export async function assertCanEditLevel(actor: Actor, levelId: string): Promise<void> {
	const row = await db
		.select({ courseId: stage.courseId, ownerId: levelTable.ownerId })
		.from(levelTable)
		// Left, not inner: a playground has no item and no stage, and must still
		// come back as a row so its owner can be read.
		.leftJoin(stageItem, eq(stageItem.id, levelTable.itemId))
		.leftJoin(stage, eq(stage.id, stageItem.stageId))
		.where(eq(levelTable.id, levelId))
		.get();

	if (!row) return;
	if (row.courseId) return assertCanEditCourse(actor, row.courseId);

	if (roleOf(actor.user) === 'admin') return;
	if (row.ownerId === null || row.ownerId === actor.user.id) return;

	throw new Forbidden('Dieses Playground gehört einer anderen Lehrperson.');
}

export async function shareLevel(actor: Actor, levelId: string, teacherId: string): Promise<void> {
	await assertCanEditLevel(actor, levelId);
	if (teacherId === actor.user.id) return;

	await db.insert(levelShare).values({ levelId, teacherId }).onConflictDoNothing();
}

export async function unshareLevel(
	actor: Actor,
	levelId: string,
	teacherId: string
): Promise<void> {
	await assertCanEditLevel(actor, levelId);
	await db
		.delete(levelShare)
		.where(and(eq(levelShare.levelId, levelId), eq(levelShare.teacherId, teacherId)));
}

export async function listLevelShares(
	actor: Actor,
	levelId: string
): Promise<{ teacherId: string; name: string }[]> {
	await assertCanEditLevel(actor, levelId);

	return db
		.select({ teacherId: levelShare.teacherId, name: user.name })
		.from(levelShare)
		.innerJoin(user, eq(user.id, levelShare.teacherId))
		.where(eq(levelShare.levelId, levelId))
		.orderBy(asc(user.name));
}

/** Whether this teacher holds a share on this level. */
async function holdsLevelShare(actor: Actor, levelId: string): Promise<boolean> {
	const share = await db
		.select({ id: levelShare.id })
		.from(levelShare)
		.where(and(eq(levelShare.levelId, levelId), eq(levelShare.teacherId, actor.user.id)))
		.get();
	return Boolean(share);
}

/**
 * Adds a shared level to a stage as a **live link** — the item points at the
 * original, which keeps updating, and the borrowing teacher cannot edit it.
 */
export async function linkLevel(actor: Actor, stageId: string, levelId: string): Promise<string> {
	await assertCanEditStage(actor, stageId);
	if (!(await holdsLevelShare(actor, levelId))) {
		throw new Forbidden('Dieses Level wurde nicht mit dir geteilt.');
	}

	const itemId = crypto.randomUUID();
	db.transaction((tx) => {
		tx.insert(stageItem)
			.values({
				id: itemId,
				stageId,
				kind: 'level',
				position: nextItemPosition(tx, stageId),
				linkedLevelId: levelId
			})
			.run();
	});

	return itemId;
}

/** Adds a shared level as an independent duplicate the borrowing teacher owns. */
export async function copyLevel(
	actor: Actor,
	stageId: string,
	levelId: string
): Promise<{ itemId: string; levelId: string }> {
	await assertCanEditStage(actor, stageId);
	if (!(await holdsLevelShare(actor, levelId))) {
		throw new Forbidden('Dieses Level wurde nicht mit dir geteilt.');
	}

	const source = await db.select().from(levelTable).where(eq(levelTable.id, levelId)).get();
	if (!source) throw new Forbidden('Dieses Level gibt es nicht.');

	const itemId = crypto.randomUUID();
	const newLevelId = crypto.randomUUID();

	db.transaction((tx) => {
		tx.insert(stageItem)
			.values({ id: itemId, stageId, kind: 'level', position: nextItemPosition(tx, stageId) })
			.run();

		tx.insert(levelTable)
			.values({
				id: newLevelId,
				itemId,
				name: source.name,
				description: source.description,
				data: { ...source.data, id: newLevelId }
			})
			.run();
	});

	return { itemId, levelId: newLevelId };
}

// ============================================================
// Stages
// ============================================================

export async function createStage(courseId: string, title: string): Promise<string> {
	const id = crypto.randomUUID();

	// See the module note: this callback must stay synchronous.
	db.transaction((tx) => {
		const [last] = tx
			.select({ position: stage.position })
			.from(stage)
			.where(eq(stage.courseId, courseId))
			.orderBy(desc(stage.position))
			.limit(1)
			.all();

		tx.insert(stage)
			.values({
				id,
				courseId,
				title: title.trim() || 'Kapitel ohne Titel',
				position: (last?.position ?? -1) + 1
			})
			.run();
	});

	return id;
}

export async function updateStage(
	stageId: string,
	patch: { title?: string; description?: string | null; gated?: boolean; ordered?: boolean }
): Promise<void> {
	const set: Record<string, unknown> = { updatedAt: new Date() };
	if (patch.title !== undefined) set.title = patch.title.trim() || 'Kapitel ohne Titel';
	if (patch.description !== undefined) set.description = patch.description?.trim() || null;
	if (patch.gated !== undefined) set.gated = patch.gated;
	if (patch.ordered !== undefined) set.ordered = patch.ordered;

	await db.update(stage).set(set).where(eq(stage.id, stageId));
}

export async function deleteStage(stageId: string): Promise<void> {
	await assertNoBorrowedLevels(await levelIdsOfStage(stageId));

	db.transaction((tx) => {
		const [row] = tx
			.select({ courseId: stage.courseId })
			.from(stage)
			.where(eq(stage.id, stageId))
			.limit(1)
			.all();
		if (!row) return;

		tx.delete(stage).where(eq(stage.id, stageId)).run();
		renumberStages(tx, row.courseId);
	});
}

export async function moveStage(stageId: string, direction: Direction): Promise<void> {
	db.transaction((tx) => {
		const [row] = tx
			.select({ courseId: stage.courseId })
			.from(stage)
			.where(eq(stage.id, stageId))
			.limit(1)
			.all();
		if (!row) return;

		const ids = tx
			.select({ id: stage.id })
			.from(stage)
			.where(eq(stage.courseId, row.courseId))
			.orderBy(asc(stage.position))
			.all()
			.map((s) => s.id);

		writeStagePositions(tx, shift(ids, stageId, direction));
	});
}

// ============================================================
// Items
// ============================================================

function validateTheory(input: { title: string; body: string }): string[] {
	const errors: string[] = [];
	if (input.title.trim().length === 0) errors.push('ein Theorieblock braucht einen Titel');
	if (input.body.trim().length === 0) errors.push('ein Theorieblock braucht Text');
	if (input.body.length > MAX_THEORY_BODY) {
		errors.push(`der Text ist zu lang (höchstens ${MAX_THEORY_BODY} Zeichen)`);
	}
	return errors;
}

export async function addTheoryItem(
	stageId: string,
	input: { title: string; body: string }
): Promise<string> {
	const errors = validateTheory(input);
	if (errors.length > 0) throw new InvalidItem(errors);

	const id = crypto.randomUUID();

	db.transaction((tx) => {
		tx.insert(stageItem)
			.values({
				id,
				stageId,
				kind: 'theory',
				title: input.title.trim(),
				body: input.body,
				position: nextItemPosition(tx, stageId)
			})
			.run();
	});

	return id;
}

/**
 * Creates a level item and the level it owns.
 *
 * Both inserts go in one transaction: a `kind: 'level'` item with no level row
 * would render as a placeholder in every stage listing.
 */
export async function addLevelItem(
	stageId: string,
	name: string
): Promise<{ itemId: string; levelId: string }> {
	const itemId = crypto.randomUUID();
	const levelId = crypto.randomUUID();
	const data = buildEmptyLevel(levelId, name);

	db.transaction((tx) => {
		tx.insert(stageItem)
			.values({ id: itemId, stageId, kind: 'level', position: nextItemPosition(tx, stageId) })
			.run();

		tx.insert(levelTable)
			.values({
				id: levelId,
				itemId,
				name: data.name,
				description: data.description,
				data
			})
			.run();
	});

	return { itemId, levelId };
}

export async function updateTheoryItem(
	itemId: string,
	input: { title: string; body: string }
): Promise<void> {
	const errors = validateTheory(input);
	if (errors.length > 0) throw new InvalidItem(errors);

	await db
		.update(stageItem)
		.set({ title: input.title.trim(), body: input.body, updatedAt: new Date() })
		.where(eq(stageItem.id, itemId));
}

/** The cascade takes the owned level with it. */
export async function deleteItem(itemId: string): Promise<void> {
	await assertNoBorrowedLevels(await levelIdsOfItem(itemId));

	db.transaction((tx) => {
		const [row] = tx
			.select({ stageId: stageItem.stageId })
			.from(stageItem)
			.where(eq(stageItem.id, itemId))
			.limit(1)
			.all();
		if (!row) return;

		tx.delete(stageItem).where(eq(stageItem.id, itemId)).run();
		renumberItems(tx, row.stageId);
	});
}

export async function moveItem(itemId: string, direction: Direction): Promise<void> {
	db.transaction((tx) => {
		const [row] = tx
			.select({ stageId: stageItem.stageId })
			.from(stageItem)
			.where(eq(stageItem.id, itemId))
			.limit(1)
			.all();
		if (!row) return;

		const ids = tx
			.select({ id: stageItem.id })
			.from(stageItem)
			.where(eq(stageItem.stageId, row.stageId))
			.orderBy(asc(stageItem.position))
			.all()
			.map((i) => i.id);

		writeItemPositions(tx, shift(ids, itemId, direction));
	});
}

// ============================================================
// Playing one item
// ============================================================

export async function findItem(courseId: string, itemId: string): Promise<ItemContext | null> {
	const outline = await findCourse(courseId);
	if (!outline) return null;

	const flat = flattenOutline(outline);
	const index = flat.findIndex((entry) => entry.item.id === itemId);
	if (index === -1) return null;

	const { item, stage: owningStage } = flat[index];

	let level: Level | null = null;
	if (item.kind === 'level') {
		const [row] = await db
			.select({ data: levelTable.data })
			.from(levelTable)
			.where(eq(levelTable.id, item.levelId))
			.limit(1);

		if (row) {
			const result = parseLevel(row.data);
			if (!result.ok) throw new InvalidLevel(result.errors);
			level = result.level;
		}
	}

	return {
		course: { id: outline.id, title: outline.title },
		stage: { id: owningStage.id, title: owningStage.title },
		item,
		level,
		prevItemId: index > 0 ? flat[index - 1].item.id : null,
		nextItemId: index < flat.length - 1 ? flat[index + 1].item.id : null,
		index: index + 1,
		total: flat.length
	};
}

/** The course as one ordered run, which is the order a student walks it in. */
export function flattenOutline(
	outline: CourseOutline
): { item: StageItemView; stage: StageView }[] {
	return outline.stages.flatMap((s) => s.items.map((item) => ({ item, stage: s })));
}

// ============================================================
// Position bookkeeping
// ============================================================

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function nextItemPosition(tx: Tx, stageId: string): number {
	const [last] = tx
		.select({ position: stageItem.position })
		.from(stageItem)
		.where(eq(stageItem.stageId, stageId))
		.orderBy(desc(stageItem.position))
		.limit(1)
		.all();

	return (last?.position ?? -1) + 1;
}

function writeStagePositions(tx: Tx, ids: string[]): void {
	ids.forEach((id, position) => {
		tx.update(stage).set({ position }).where(eq(stage.id, id)).run();
	});
}

function writeItemPositions(tx: Tx, ids: string[]): void {
	ids.forEach((id, position) => {
		tx.update(stageItem).set({ position }).where(eq(stageItem.id, id)).run();
	});
}

/** Rewrites the run so positions stay dense after a delete. */
function renumberStages(tx: Tx, courseId: string): void {
	const ids = tx
		.select({ id: stage.id })
		.from(stage)
		.where(eq(stage.courseId, courseId))
		.orderBy(asc(stage.position))
		.all()
		.map((s) => s.id);

	writeStagePositions(tx, ids);
}

function renumberItems(tx: Tx, stageId: string): void {
	const ids = tx
		.select({ id: stageItem.id })
		.from(stageItem)
		.where(eq(stageItem.stageId, stageId))
		.orderBy(asc(stageItem.position))
		.all()
		.map((i) => i.id);

	writeItemPositions(tx, ids);
}
