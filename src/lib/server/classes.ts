import { and, count, eq, inArray, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { classCourse, classMember, course, schoolClass, user } from '$lib/server/db/schema';
import { assertCanManageAll, assertOwnsClass, Forbidden, listPeople, type Actor } from '$lib/server/users';
import { roleOf } from '$lib/roles';

/**
 * Classes: the group a teacher works with.
 *
 * A class does two jobs. It is the scope of a teacher's authority — `users.ts`
 * decides who a teacher may touch by asking which classes they own — and it is
 * how courses reach students, through `class_course`.
 *
 * Ownership is checked here on every path. `assertOwnsClass` lives in `users.ts`
 * because that module is where the "who may do what" rules are stated; this one
 * only reads and writes the tables.
 */

export class InvalidClass extends Error {
	constructor(readonly errors: string[]) {
		super(`invalid class: ${errors.join('; ')}`);
	}
}

export type ClassSummary = {
	id: string;
	name: string;
	ownerId: string | null;
	ownerName: string | null;
	studentCount: number;
	courseCount: number;
	archivedAt: Date | null;
};

export type ClassDetail = ClassSummary & {
	students: { id: string; name: string; username: string | null; archivedAt: Date | null }[];
	courses: { id: string; title: string; published: boolean }[];
};

function cleanName(value: string): string {
	const name = value.trim().replace(/\s+/g, ' ');
	if (!name) throw new InvalidClass(['Eine Klasse braucht einen Namen.']);
	if (name.length > 80) throw new InvalidClass(['Dieser Name ist zu lang.']);
	return name;
}

// ============================================================
// Reads
// ============================================================

export async function listClasses(
	actor: Actor,
	options: { archived?: boolean } = {}
): Promise<ClassSummary[]> {
	const conditions = [
		options.archived
			? sql`${schoolClass.archivedAt} is not null`
			: sql`${schoolClass.archivedAt} is null`
	];

	// An admin sees every class; a teacher sees the ones they run.
	if (roleOf(actor.user) !== 'admin') conditions.push(eq(schoolClass.ownerId, actor.user.id));

	const rows = await db
		.select({
			id: schoolClass.id,
			name: schoolClass.name,
			ownerId: schoolClass.ownerId,
			ownerName: user.name,
			archivedAt: schoolClass.archivedAt
		})
		.from(schoolClass)
		.leftJoin(user, eq(user.id, schoolClass.ownerId))
		.where(and(...conditions))
		.orderBy(schoolClass.name);

	if (rows.length === 0) return [];

	const ids = rows.map((row) => row.id);
	const studentCounts = await db
		.select({ classId: classMember.classId, total: count() })
		.from(classMember)
		.where(inArray(classMember.classId, ids))
		.groupBy(classMember.classId);

	const courseCounts = await db
		.select({ classId: classCourse.classId, total: count() })
		.from(classCourse)
		.where(inArray(classCourse.classId, ids))
		.groupBy(classCourse.classId);

	const studentsBy = new Map(studentCounts.map((row) => [row.classId, row.total]));
	const coursesBy = new Map(courseCounts.map((row) => [row.classId, row.total]));

	return rows.map((row) => ({
		id: row.id,
		name: row.name,
		ownerId: row.ownerId,
		ownerName: row.ownerName,
		studentCount: studentsBy.get(row.id) ?? 0,
		courseCount: coursesBy.get(row.id) ?? 0,
		archivedAt: row.archivedAt
	}));
}

export async function findClass(actor: Actor, classId: string): Promise<ClassDetail | null> {
	await assertOwnsClass(actor, classId);

	const row = await db
		.select({
			id: schoolClass.id,
			name: schoolClass.name,
			ownerId: schoolClass.ownerId,
			ownerName: user.name,
			archivedAt: schoolClass.archivedAt
		})
		.from(schoolClass)
		.leftJoin(user, eq(user.id, schoolClass.ownerId))
		.where(eq(schoolClass.id, classId))
		.get();
	if (!row) return null;

	const students = await db
		.select({
			id: user.id,
			name: user.name,
			username: user.username,
			archivedAt: user.archivedAt
		})
		.from(classMember)
		.innerJoin(user, eq(user.id, classMember.userId))
		.where(eq(classMember.classId, classId))
		.orderBy(user.name);

	const courses = await db
		.select({ id: course.id, title: course.title, published: course.published })
		.from(classCourse)
		.innerJoin(course, eq(course.id, classCourse.courseId))
		.where(eq(classCourse.classId, classId))
		.orderBy(course.title);

	return {
		...row,
		studentCount: students.length,
		courseCount: courses.length,
		students,
		courses
	};
}

/** The classes a student belongs to. Drives their course catalogue. */
export async function classesOf(userId: string): Promise<string[]> {
	const rows = await db
		.select({ classId: classMember.classId })
		.from(classMember)
		.innerJoin(schoolClass, eq(schoolClass.id, classMember.classId))
		.where(and(eq(classMember.userId, userId), sql`${schoolClass.archivedAt} is null`));

	return rows.map((row) => row.classId);
}

export type AssignableStudent = {
	id: string;
	name: string;
	username: string | null;
	/** The classes they are already on, so a picker can say where they come from. */
	classes: string[];
};

/**
 * The students this actor could put on `classId` — everyone they may manage who
 * is not on the roster already.
 *
 * The scope is `listPeople`'s, deliberately: it is the same set the people list
 * shows, which for a teacher is the students in the classes they run and for an
 * admin is every student, including the ones no class has claimed yet. That
 * matches what `addMembers` will actually accept, so the picker never offers a
 * name the submit would refuse.
 */
export async function listAssignableStudents(
	actor: Actor,
	classId: string
): Promise<AssignableStudent[]> {
	await assertOwnsClass(actor, classId);

	const members = await db
		.select({ userId: classMember.userId })
		.from(classMember)
		.where(eq(classMember.classId, classId));
	const already = new Set(members.map((row) => row.userId));

	const students = await listPeople(actor, { role: 'student' });

	return students
		.filter((student) => !already.has(student.id))
		.map((student) => ({
			id: student.id,
			name: student.name,
			username: student.username,
			classes: student.classes.map((row) => row.name)
		}));
}

// ============================================================
// Writes
// ============================================================

export async function createClass(actor: Actor, name: string): Promise<string> {
	const id = crypto.randomUUID();
	await db.insert(schoolClass).values({ id, name: cleanName(name), ownerId: actor.user.id });
	return id;
}

export async function renameClass(actor: Actor, classId: string, name: string): Promise<void> {
	await assertOwnsClass(actor, classId);
	await db
		.update(schoolClass)
		.set({ name: cleanName(name), updatedAt: new Date() })
		.where(eq(schoolClass.id, classId));
}

/**
 * Puts a class away without touching anybody in it. Their accounts stay live —
 * archiving a *class* is the end of a school year, not the end of a student.
 */
export async function setClassArchived(
	actor: Actor,
	classId: string,
	archived: boolean
): Promise<void> {
	await assertOwnsClass(actor, classId);
	await db
		.update(schoolClass)
		.set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
		.where(eq(schoolClass.id, classId));
}

/** Hard delete, and only for an empty class — a roster is not something to lose by accident. */
export async function deleteClass(actor: Actor, classId: string): Promise<void> {
	await assertOwnsClass(actor, classId);

	const member = await db
		.select({ id: classMember.id })
		.from(classMember)
		.where(eq(classMember.classId, classId))
		.get();
	if (member) {
		throw new InvalidClass(['In dieser Klasse sind noch Schüler/innen — archivier sie stattdessen.']);
	}

	await db.delete(schoolClass).where(eq(schoolClass.id, classId));
}

export async function addMembers(actor: Actor, classId: string, userIds: string[]): Promise<void> {
	await assertOwnsClass(actor, classId);
	if (userIds.length === 0) return;

	// Owning the class is not enough. A roster is what `users.ts` reads to decide
	// who a teacher may touch, so adding somebody to your own class hands you
	// authority over them — a teacher who could post any id would grant it to
	// themselves. The same check that gates every other account write gates this.
	await assertCanManageAll(actor, userIds);

	// Only students go on a roster; a teacher added to their own class would
	// widen their own reach in `users.ts` without anybody deciding to.
	const students = await db
		.select({ id: user.id })
		.from(user)
		.where(and(inArray(user.id, userIds), eq(user.role, 'student')));

	if (students.length !== userIds.length) {
		throw new Forbidden('Nur Schüler/innen können einer Klasse hinzugefügt werden.');
	}

	await db
		.insert(classMember)
		.values(students.map((row) => ({ classId, userId: row.id })))
		.onConflictDoNothing();
}

export async function removeMembers(
	actor: Actor,
	classId: string,
	userIds: string[]
): Promise<void> {
	await assertOwnsClass(actor, classId);
	if (userIds.length === 0) return;

	await db
		.delete(classMember)
		.where(and(eq(classMember.classId, classId), inArray(classMember.userId, userIds)));
}

/** Both classes must be the actor's, or a teacher could move students out of reach. */
export async function moveMembers(
	actor: Actor,
	fromClassId: string,
	toClassId: string,
	userIds: string[]
): Promise<void> {
	await assertOwnsClass(actor, fromClassId);
	await assertOwnsClass(actor, toClassId);
	if (userIds.length === 0 || fromClassId === toClassId) return;

	await addMembers(actor, toClassId, userIds);
	await removeMembers(actor, fromClassId, userIds);
}

export async function assignCourse(
	actor: Actor,
	classId: string,
	courseId: string
): Promise<void> {
	await assertOwnsClass(actor, classId);
	await db.insert(classCourse).values({ classId, courseId }).onConflictDoNothing();
}

export async function unassignCourse(
	actor: Actor,
	classId: string,
	courseId: string
): Promise<void> {
	await assertOwnsClass(actor, classId);
	await db
		.delete(classCourse)
		.where(and(eq(classCourse.classId, classId), eq(classCourse.courseId, courseId)));
}
