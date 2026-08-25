import { asc, count, desc, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { course, level as levelTable, stage, stageItem } from '$lib/server/db/schema';
import { buildEmptyLevel, InvalidLevel } from '$lib/server/levels';
import { parseLevel } from '$lib/game/editor/parse';
import { shift, type Direction } from '$lib/ordering';
import type { Level } from '$lib/game/level';

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
						levelDescription: levelTable.description
					})
					.from(stageItem)
					.leftJoin(levelTable, eq(levelTable.itemId, stageItem.id))
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
						title: item.title ?? 'Untitled',
						body: item.body ?? ''
					}
				: {
						id: item.id,
						kind: 'level',
						position: item.position,
						// A level item without its level row is only possible if a
						// write was interrupted; showing it as a placeholder beats
						// dropping it silently out of the stage.
						levelId: item.levelId ?? '',
						name: item.levelName ?? 'Missing level',
						description: item.levelDescription ?? null
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
		title: title.trim() || 'Untitled course',
		ownerId: ownerId ?? null
	});
	return id;
}

export async function updateCourse(
	courseId: string,
	patch: { title?: string; description?: string | null; published?: boolean }
): Promise<void> {
	const set: Record<string, unknown> = { updatedAt: new Date() };
	if (patch.title !== undefined) set.title = patch.title.trim() || 'Untitled course';
	if (patch.description !== undefined) set.description = patch.description?.trim() || null;
	if (patch.published !== undefined) set.published = patch.published;

	await db.update(course).set(set).where(eq(course.id, courseId));
}

/** One delete — the cascade clears stages, items and their levels. */
export async function deleteCourse(courseId: string): Promise<void> {
	await db.delete(course).where(eq(course.id, courseId));
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
				title: title.trim() || 'Untitled stage',
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
	if (patch.title !== undefined) set.title = patch.title.trim() || 'Untitled stage';
	if (patch.description !== undefined) set.description = patch.description?.trim() || null;
	if (patch.gated !== undefined) set.gated = patch.gated;
	if (patch.ordered !== undefined) set.ordered = patch.ordered;

	await db.update(stage).set(set).where(eq(stage.id, stageId));
}

export async function deleteStage(stageId: string): Promise<void> {
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
	if (input.title.trim().length === 0) errors.push('a theory block needs a title');
	if (input.body.trim().length === 0) errors.push('a theory block needs some text');
	if (input.body.length > MAX_THEORY_BODY) {
		errors.push(`the text is too long (max ${MAX_THEORY_BODY} characters)`);
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
