import { and, count, desc, eq, inArray, like, or, sql } from 'drizzle-orm';
import { APIError } from 'better-auth/api';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { classMember, itemProgress, schoolClass, session, user } from '$lib/server/db/schema';
import { generatePassword } from '$lib/server/passwords';
import { assignUsernames, isValidUsername, type StudentDraft } from '$lib/roster';
import { roleOf, type Role } from '$lib/roles';

/**
 * Accounts: who exists, who may touch whom, and what "archived" means.
 *
 * This module is the only writer of account state, so it is where the rules
 * live — the same arrangement `courses.ts` has with the curriculum tables.
 *
 * It exists because better-auth's permission model cannot express the rule this
 * app actually needs. Better-auth knows *"may create users"*; it does not know
 * *"may create users of role student, in a class you own"*. Its admin endpoints
 * will happily let a teacher mint an admin or ban one. So `$lib/roles` is the
 * outer fence and every function below re-checks the inner one:
 *
 *   admin   → anyone
 *   teacher → students who share a class they own
 *   student → nobody
 *
 * Where a call goes matters too. `createUser` is invoked **without** headers,
 * which by design skips better-auth's own gate (`admin/routes.mjs` only
 * challenges a request that carries one) — correct here, because the
 * authorization already happened above it and the role being written is ours,
 * never the client's. Everything else (`banUser`, `setUserPassword`, `setRole`)
 * goes through `adminMiddleware` and so must carry the caller's headers, which
 * means the caller's own role gates it a second time.
 */

/**
 * Students mostly have no school email, but better-auth requires one and
 * requires it unique. So a student's address is derived from their username and
 * never shown or sent to; the username is the identity they actually use.
 */
export const STUDENT_EMAIL_DOMAIN = 'students.dewy.local';

/** Matches better-auth's own default; `setUserPassword` rejects anything shorter. */
export const MIN_PASSWORD_LENGTH = 8;

export function studentEmail(username: string): string {
	return `${username}@${STUDENT_EMAIL_DOMAIN}`;
}

export function isStudentEmail(email: string): boolean {
	return email.endsWith(`@${STUDENT_EMAIL_DOMAIN}`);
}

/** The caller. `headers` is needed by every `auth.api` call that checks a session. */
export type Actor = {
	user: { id: string; role?: string | null };
	headers: Headers;
};

export class Forbidden extends Error {
	constructor(message = 'You are not allowed to do that.') {
		super(message);
	}
}

export class InvalidPerson extends Error {
	constructor(readonly errors: string[]) {
		super(`invalid account: ${errors.join('; ')}`);
	}
}

export type PersonRow = {
	id: string;
	name: string;
	role: Role;
	/** `null` for a teacher or admin, who sign in with their email. */
	username: string | null;
	/** `null` for a student on a synthetic address — there is nothing to show. */
	email: string | null;
	archivedAt: Date | null;
	classes: { id: string; name: string }[];
	completedItems: number;
};

export type CreatedAccount = {
	id: string;
	name: string;
	/** Shown once, on the credentials sheet. Never stored in plaintext. */
	password: string;
	username?: string;
	email?: string;
};

export type FailedDraft = { name: string; reason: string };

// ============================================================
// Who may touch whom
// ============================================================

/** The ids of every class this actor runs. Admins are not scoped by class. */
async function ownedClassIds(actorId: string): Promise<string[]> {
	const rows = await db
		.select({ id: schoolClass.id })
		.from(schoolClass)
		.where(eq(schoolClass.ownerId, actorId));
	return rows.map((row) => row.id);
}

/**
 * A teacher reaches a student who is in at least one class they own.
 *
 * Deliberately narrow. A teacher who has just created a student always shares a
 * class with them, because bulk creation targets a class, so the common path is
 * never blocked — and a student who moves on is out of reach the moment they
 * leave the class, which is the behaviour a school expects.
 */
export async function canManage(actor: Actor, targetId: string): Promise<boolean> {
	const role = roleOf(actor.user);
	if (role === 'admin') return true;
	if (role !== 'teacher') return false;
	if (targetId === actor.user.id) return true;

	const target = await db
		.select({ role: user.role })
		.from(user)
		.where(eq(user.id, targetId))
		.get();

	// A teacher may only ever act on students — never on a peer or an admin.
	if (!target || roleOf(target) !== 'student') return false;

	const classIds = await ownedClassIds(actor.user.id);
	if (classIds.length === 0) return false;

	const shared = await db
		.select({ id: classMember.id })
		.from(classMember)
		.where(and(eq(classMember.userId, targetId), inArray(classMember.classId, classIds)))
		.get();

	return Boolean(shared);
}

export async function assertCanManage(actor: Actor, targetId: string): Promise<void> {
	if (!(await canManage(actor, targetId))) throw new Forbidden();
}

export async function assertCanManageAll(actor: Actor, targetIds: string[]): Promise<void> {
	for (const id of targetIds) await assertCanManage(actor, id);
}

/** The class must exist and, for a teacher, be theirs. */
export async function assertOwnsClass(actor: Actor, classId: string): Promise<void> {
	const row = await db
		.select({ ownerId: schoolClass.ownerId })
		.from(schoolClass)
		.where(eq(schoolClass.id, classId))
		.get();

	if (!row) throw new Forbidden('No such class.');
	if (roleOf(actor.user) === 'admin') return;
	if (row.ownerId !== actor.user.id) throw new Forbidden('That class belongs to another teacher.');
}

function assertAdmin(actor: Actor): void {
	if (roleOf(actor.user) !== 'admin') throw new Forbidden('Only an administrator can do that.');
}

// ============================================================
// Reads
// ============================================================

export type PeopleFilter = {
	role?: Role;
	classId?: string;
	/** Defaults to active only — archived accounts are out of the way by default. */
	archived?: boolean;
	search?: string;
};

/**
 * The people this actor may see.
 *
 * Not `auth.api.listUsers`: the list has to be filtered and grouped by class,
 * which is a join better-auth's query interface cannot express, and a teacher's
 * visible set is defined by those same classes.
 */
export async function listPeople(actor: Actor, filter: PeopleFilter = {}): Promise<PersonRow[]> {
	const isAdmin = roleOf(actor.user) === 'admin';

	const conditions = [];
	if (filter.role) conditions.push(eq(user.role, filter.role));
	conditions.push(filter.archived ? sql`${user.archivedAt} is not null` : sql`${user.archivedAt} is null`);

	if (filter.search) {
		const term = `%${filter.search.toLowerCase()}%`;
		conditions.push(
			or(
				like(sql`lower(${user.name})`, term),
				like(sql`lower(${user.username})`, term),
				like(sql`lower(${user.email})`, term)
			)!
		);
	}

	// A teacher sees exactly the students in their classes. An explicit class
	// filter narrows that further, and for an admin it is the only scope.
	const scopeIds = isAdmin ? null : await visibleUserIds(actor);
	if (scopeIds) {
		if (scopeIds.length === 0) return [];
		conditions.push(inArray(user.id, scopeIds));
	}

	if (filter.classId) {
		const inClass = await db
			.select({ userId: classMember.userId })
			.from(classMember)
			.where(eq(classMember.classId, filter.classId));
		const ids = inClass.map((row) => row.userId);
		if (ids.length === 0) return [];
		conditions.push(inArray(user.id, ids));
	}

	const rows = await db
		.select({
			id: user.id,
			name: user.name,
			role: user.role,
			username: user.username,
			email: user.email,
			archivedAt: user.archivedAt
		})
		.from(user)
		.where(and(...conditions))
		.orderBy(user.name);

	return hydrate(rows);
}

/** Base columns every read selects, so `hydrate` has what it needs. */
type PersonBase = {
	id: string;
	name: string;
	role: string | null;
	username: string | null;
	email: string;
	archivedAt: Date | null;
};

/**
 * Attaches the two things a bare `user` row cannot answer: which classes the
 * person is in, and how far they have got. Shared by the list and the detail
 * page so the two can never disagree.
 */
async function hydrate(rows: PersonBase[]): Promise<PersonRow[]> {
	if (rows.length === 0) return [];

	const ids = rows.map((row) => row.id);
	const memberships = await db
		.select({ userId: classMember.userId, id: schoolClass.id, name: schoolClass.name })
		.from(classMember)
		.innerJoin(schoolClass, eq(schoolClass.id, classMember.classId))
		.where(inArray(classMember.userId, ids));

	const completions = await db
		.select({ userId: itemProgress.userId, total: count() })
		.from(itemProgress)
		.where(inArray(itemProgress.userId, ids))
		.groupBy(itemProgress.userId);

	const classesBy = new Map<string, { id: string; name: string }[]>();
	for (const row of memberships) {
		const list = classesBy.get(row.userId) ?? [];
		list.push({ id: row.id, name: row.name });
		classesBy.set(row.userId, list);
	}
	const completedBy = new Map(completions.map((row) => [row.userId, row.total]));

	return rows.map((row) => ({
		id: row.id,
		name: row.name,
		role: roleOf(row),
		username: row.username ?? null,
		email: row.email && !isStudentEmail(row.email) ? row.email : null,
		archivedAt: row.archivedAt ?? null,
		classes: classesBy.get(row.id) ?? [],
		completedItems: completedBy.get(row.id) ?? 0
	}));
}

/** Every user a non-admin actor is allowed to see: themselves plus their students. */
async function visibleUserIds(actor: Actor): Promise<string[]> {
	const classIds = await ownedClassIds(actor.user.id);
	if (classIds.length === 0) return [actor.user.id];

	const members = await db
		.select({ userId: classMember.userId })
		.from(classMember)
		.where(inArray(classMember.classId, classIds));

	return [...new Set([actor.user.id, ...members.map((row) => row.userId)])];
}

export type PersonDetail = PersonRow & { createdAt: Date; lastSignInAt: Date | null };

export async function findPerson(actor: Actor, userId: string): Promise<PersonDetail | null> {
	await assertCanManage(actor, userId);

	const row = await db
		.select({
			id: user.id,
			name: user.name,
			role: user.role,
			username: user.username,
			email: user.email,
			archivedAt: user.archivedAt,
			createdAt: user.createdAt
		})
		.from(user)
		.where(eq(user.id, userId))
		.get();
	if (!row) return null;

	const [person] = await hydrate([row]);

	// The newest session row is the last time they got in. Sessions are deleted
	// on archival, so an archived account honestly reports nothing.
	const lastSession = await db
		.select({ createdAt: session.createdAt })
		.from(session)
		.where(eq(session.userId, userId))
		.orderBy(desc(session.createdAt))
		.get();

	return { ...person, createdAt: row.createdAt, lastSignInAt: lastSession?.createdAt ?? null };
}

/** Every username already spoken for, so the roster preview can warn early. */
export async function takenUsernames(): Promise<string[]> {
	const rows = await db.select({ username: user.username }).from(user);
	return rows.map((row) => row.username).filter((value): value is string => Boolean(value));
}

// ============================================================
// Writes
// ============================================================

/** Admins only: teachers sign in with a real email, one at a time. */
export async function createTeacher(
	actor: Actor,
	input: { name: string; email: string; password?: string }
): Promise<CreatedAccount> {
	assertAdmin(actor);

	const name = input.name.trim();
	const email = input.email.trim().toLowerCase();
	const errors: string[] = [];
	if (!name) errors.push('A name is required.');
	if (!email.includes('@')) errors.push('A valid email address is required.');
	if (isStudentEmail(email)) errors.push('That domain is reserved for student accounts.');
	if (errors.length > 0) throw new InvalidPerson(errors);

	const password = input.password?.trim() || generatePassword();

	try {
		const created = await auth.api.createUser({
			body: { name, email, password, role: 'teacher' }
		});
		return { id: created.user.id, name, email, password };
	} catch (cause) {
		// A taken email is the common case and is the caller's problem to show,
		// not a 500 — so it arrives as the same error every other bad input does.
		if (cause instanceof APIError) throw new InvalidPerson([cause.message]);
		throw cause;
	}
}

/**
 * Bulk student creation — the workflow the whole teacher UI is built around.
 *
 * Not a transaction, and it cannot be one: `auth.api.createUser` hashes a
 * password and is asynchronous, while better-sqlite3's `db.transaction` throws
 * on a promise. So this reports per-row outcomes and the caller shows what
 * landed alongside what did not, which is also the honest thing to do when one
 * bad line should not discard thirty good ones.
 */
export async function createStudents(
	actor: Actor,
	classId: string,
	drafts: StudentDraft[]
): Promise<{ created: CreatedAccount[]; failed: FailedDraft[] }> {
	await assertOwnsClass(actor, classId);

	const resolved = assignUsernames(drafts, await takenUsernames());
	const created: CreatedAccount[] = [];
	const failed: FailedDraft[] = [];

	for (const draft of resolved) {
		if (!isValidUsername(draft.username)) {
			failed.push({ name: draft.name, reason: 'Could not build a username from that name.' });
			continue;
		}

		const password = generatePassword();
		try {
			// No headers: the check that matters already ran above, and the role
			// written here is this module's, not the caller's.
			const account = await auth.api.createUser({
				body: {
					name: draft.name,
					email: studentEmail(draft.username),
					password,
					role: 'student',
					data: { username: draft.username, displayUsername: draft.username }
				}
			});

			await db
				.insert(classMember)
				.values({ classId, userId: account.user.id })
				.onConflictDoNothing();

			created.push({ id: account.user.id, name: draft.name, username: draft.username, password });
		} catch (cause) {
			failed.push({
				name: draft.name,
				reason: cause instanceof APIError ? cause.message : 'Could not create the account.'
			});
		}
	}

	return { created, failed };
}

/**
 * Archive: the account stays, with everything attached to it, and stops being a
 * way in.
 *
 * `banned` is the enforcement, and it is better-auth's own — a
 * `session.create.before` hook rejects a banned user on every sign-in path, and
 * banning deletes the sessions they already had. `archivedAt` is ours and
 * records only *when*; the two are written together, here, so they cannot drift.
 */
export async function archiveUsers(actor: Actor, userIds: string[]): Promise<void> {
	await assertCanManageAll(actor, userIds);

	for (const userId of userIds) {
		if (userId === actor.user.id) throw new Forbidden('You cannot archive your own account.');

		await auth.api.banUser({
			body: { userId, banReason: 'Archived' },
			headers: actor.headers
		});
		await db.update(user).set({ archivedAt: new Date() }).where(eq(user.id, userId));
	}
}

export async function restoreUsers(actor: Actor, userIds: string[]): Promise<void> {
	await assertCanManageAll(actor, userIds);

	for (const userId of userIds) {
		await auth.api.unbanUser({ body: { userId }, headers: actor.headers });
		await db.update(user).set({ archivedAt: null }).where(eq(user.id, userId));
	}
}

/**
 * Sets a password somebody has chosen.
 *
 * Deliberately not generated: a teacher resetting a forgotten password usually
 * already knows what they want it to be, and a value they picked is one they can
 * say out loud without a printout. Bulk creation still generates, because
 * inventing thirty passwords by hand is the thing that stops a teacher bothering.
 *
 * Applied to every selected account, so a bulk reset gives them all the same
 * password — fine for "the whole class forgot over the holidays", and the reason
 * the UI says so plainly.
 */
export async function setPassword(
	actor: Actor,
	userIds: string[],
	password: string
): Promise<void> {
	if (password.length < MIN_PASSWORD_LENGTH) {
		throw new InvalidPerson([`Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`]);
	}

	await assertCanManageAll(actor, userIds);

	for (const userId of userIds) {
		try {
			await auth.api.setUserPassword({
				body: { userId, newPassword: password },
				headers: actor.headers
			});
		} catch (cause) {
			// better-auth checks the length too, against its own configured bound.
			if (cause instanceof APIError) throw new InvalidPerson([cause.message]);
			throw cause;
		}

		// A password somebody no longer knows is a session they should no longer
		// hold — except your own, where signing yourself out of the page you are
		// standing on is just a nuisance.
		if (userId !== actor.user.id) {
			await auth.api.revokeUserSessions({ body: { userId }, headers: actor.headers });
		}
	}
}

/** Admins only — a teacher who could set roles could promote themselves. */
export async function setRole(actor: Actor, userId: string, role: Role): Promise<void> {
	assertAdmin(actor);
	if (userId === actor.user.id) throw new Forbidden('You cannot change your own role.');

	await auth.api.setRole({ body: { userId, role }, headers: actor.headers });
}

export async function renamePerson(
	actor: Actor,
	userId: string,
	input: { name?: string; username?: string; email?: string }
): Promise<void> {
	await assertCanManage(actor, userId);

	const data: Record<string, string> = {};
	const errors: string[] = [];

	if (input.name !== undefined) {
		const name = input.name.trim();
		if (!name) errors.push('A name is required.');
		else data.name = name;
	}

	if (input.username !== undefined && input.username.trim()) {
		const username = input.username.trim().toLowerCase();
		if (!isValidUsername(username)) {
			errors.push('A username may only use letters, digits, dots, dashes and underscores.');
		} else {
			data.username = username;
			data.displayUsername = username;
			// The synthetic address is derived from the username, so it moves too.
			const current = await db
				.select({ email: user.email })
				.from(user)
				.where(eq(user.id, userId))
				.get();
			if (current && isStudentEmail(current.email)) data.email = studentEmail(username);
		}
	}

	if (input.email !== undefined && input.email.trim()) {
		const email = input.email.trim().toLowerCase();
		if (!email.includes('@')) errors.push('A valid email address is required.');
		else if (isStudentEmail(email)) errors.push('That domain is reserved for student accounts.');
		else data.email = email;
	}

	if (errors.length > 0) throw new InvalidPerson(errors);
	if (Object.keys(data).length === 0) return;

	await auth.api.adminUpdateUser({ body: { userId, data }, headers: actor.headers });
}

/** The teachers an admin or teacher can share a course with. */
export async function listTeachers(): Promise<{ id: string; name: string; email: string }[]> {
	return db
		.select({ id: user.id, name: user.name, email: user.email })
		.from(user)
		.where(and(inArray(user.role, ['teacher', 'admin']), sql`${user.archivedAt} is null`))
		.orderBy(user.name);
}

/** Convenience for routes: `actorOf(event)` once the `/admin` guard has run. */
export function actorOf(event: {
	locals: { user?: { id: string; role?: string | null } };
	request: Request;
}): Actor {
	if (!event.locals.user) throw new Forbidden('You must be signed in.');
	return { user: event.locals.user, headers: event.request.headers };
}
