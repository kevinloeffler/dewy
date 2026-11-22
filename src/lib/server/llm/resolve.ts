import { and, eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { classCourse, classMember, course, schoolClass } from '$lib/server/db/schema';
import type { Viewer } from '$lib/server/courses';
import { findAppConfigRow, findCourseConfigRow, toCandidate } from './config';
import type { Candidate } from './fallback';

/**
 * Which configs a request may use, in the order to try them.
 *
 * A course's override comes first, but only for the course owner's own
 * people: the owner, or a student who reaches the course through a class the
 * owner runs. A teacher who was handed the course as a clone assigns it to
 * *their* classes, and those students use the school's default. Otherwise
 * the owner's key, and the owner's bill, would serve somebody else's pupils.
 *
 * An ownerless course has no one to pay for an override, so it only ever
 * uses the default. `config.ts` refuses to save an override on one anyway.
 */
export async function resolveCandidates(user: Viewer, courseId?: string | null): Promise<Candidate[]> {
	const candidates: Candidate[] = [];

	if (user && courseId) {
		const override = await findCourseConfigRow(courseId);
		if (override && (await isOwnersAudience(user.id, courseId))) candidates.push(toCandidate(override));
	}

	const fallback = await findAppConfigRow();
	if (fallback) candidates.push(toCandidate(fallback));

	return candidates;
}

async function isOwnersAudience(userId: string, courseId: string): Promise<boolean> {
	const owner = await db
		.select({ ownerId: course.ownerId })
		.from(course)
		.where(eq(course.id, courseId))
		.get();
	if (!owner?.ownerId) return false;
	if (owner.ownerId === userId) return true;

	const viaOwnersClass = await db
		.select({ id: classMember.id })
		.from(classMember)
		.innerJoin(schoolClass, eq(schoolClass.id, classMember.classId))
		.innerJoin(classCourse, eq(classCourse.classId, schoolClass.id))
		.where(
			and(
				eq(classMember.userId, userId),
				eq(schoolClass.ownerId, owner.ownerId),
				eq(classCourse.courseId, courseId),
				isNull(schoolClass.archivedAt)
			)
		)
		.limit(1)
		.get();
	return viaOwnersClass !== undefined;
}
