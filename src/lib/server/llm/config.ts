import { and, eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { course, llmConfig } from '$lib/server/db/schema';
import { assertCanEditCourse } from '$lib/server/courses';
import { Forbidden, type Actor } from '$lib/server/users';
import { roleOf } from '$lib/roles';
import {
	checkPublicUrl,
	isReasoningEffort,
	testConnection,
	type LlmFailure,
	type LlmFailureKind,
	type ProviderConfig,
	type ReasoningEffort
} from './client';
import { decryptSecret, encryptSecret, keyHint, parseSecretKey } from './crypto';
import type { Candidate, Scope } from './fallback';

/**
 * Reading and writing LLM configs: the authorization boundary for them, the
 * way `users.ts` is for accounts.
 *
 * The school's default is the admin's alone. A course's override is anyone's
 * who may edit the course (`assertCanEditCourse`), which keeps clone
 * recipients out. Every save is tested against the provider before it is
 * written, so a config that is stored worked at least once.
 *
 * API keys come in, get encrypted, and never go out again: the views below
 * carry a four-character hint, not the key.
 */

export class InvalidLlmConfig extends Error {
	constructor(readonly errors: string[]) {
		super(`invalid llm config: ${errors.join('; ')}`);
	}
}

/** What a settings page may show about a config. No key, encrypted or not. */
export type LlmConfigView = {
	baseUrl: string;
	model: string;
	reasoningEffort: ReasoningEffort | null;
	keyHint: string;
	/** False when `LLM_SECRET_KEY` changed since the key was saved. The key must be typed again. */
	keyReadable: boolean;
	lastError: string | null;
	lastErrorAt: Date | null;
	lastOkAt: Date | null;
	updatedAt: Date;
};

export type LlmConfigInput = {
	baseUrl: string;
	/** Blank on an edit means "keep the stored key". */
	apiKey: string;
	model: string;
	/** `''` for "don't send one". */
	reasoningEffort: string;
};

function secretKey(): Buffer | null {
	return parseSecretKey(env.LLM_SECRET_KEY);
}

/** Without `LLM_SECRET_KEY` nothing can be saved, and the settings say so. */
export function secretKeyConfigured(): boolean {
	return secretKey() !== null;
}

/** The provider's message, prefixed with what it means for the person reading it. */
export function describeFailure(failure: Pick<LlmFailure, 'kind' | 'message'>): string {
	const labels: Record<LlmFailureKind, string> = {
		auth: 'Der API-Schlüssel wurde abgelehnt',
		not_found: 'Basis-URL oder Modell nicht gefunden',
		bad_request: 'Der Anbieter hat die Anfrage abgelehnt',
		rate_limited: 'Zu viele Anfragen',
		server: 'Fehler beim Anbieter',
		network: 'Anbieter nicht erreichbar',
		bad_response: 'Unerwartete Antwort des Anbieters',
		blocked_url: 'Diese Basis-URL ist nicht erlaubt',
		undecryptable: 'Gespeicherter Schlüssel unlesbar',
		invalid_output: 'Ungültige Antwort des Modells'
	};
	return `${labels[failure.kind]}: ${failure.message}`;
}

type Row = typeof llmConfig.$inferSelect;

async function rowFor(scope: Scope, courseId: string | null): Promise<Row | undefined> {
	return db
		.select()
		.from(llmConfig)
		.where(
			scope === 'app'
				? eq(llmConfig.scope, 'app')
				: and(eq(llmConfig.scope, 'course'), eq(llmConfig.courseId, courseId!))
		)
		.get();
}

function decryptRow(row: Row): string | null {
	const key = secretKey();
	return key ? decryptSecret(row.apiKeyCiphertext, key) : null;
}

function toView(row: Row): LlmConfigView {
	return {
		baseUrl: row.baseUrl,
		model: row.model,
		reasoningEffort: isReasoningEffort(row.reasoningEffort) ? row.reasoningEffort : null,
		keyHint: row.apiKeyHint,
		keyReadable: decryptRow(row) !== null,
		lastError: row.lastError,
		lastErrorAt: row.lastErrorAt,
		lastOkAt: row.lastOkAt,
		updatedAt: row.updatedAt
	};
}

/** A stored row as something the fallback loop can call. */
export function toCandidate(row: Row): Candidate {
	const apiKey = decryptRow(row);
	return {
		id: row.id,
		scope: row.scope,
		model: row.model,
		config: apiKey
			? {
					baseUrl: row.baseUrl,
					apiKey,
					model: row.model,
					reasoningEffort: isReasoningEffort(row.reasoningEffort) ? row.reasoningEffort : null
				}
			: null
	};
}

export async function findAppConfigRow(): Promise<Row | undefined> {
	return rowFor('app', null);
}

export async function findCourseConfigRow(courseId: string): Promise<Row | undefined> {
	return rowFor('course', courseId);
}

// ── Views ───────────────────────────────────────────────────

/** Admin only, since the base URL and model are the school's business. */
export async function getAppConfigView(actor: Actor): Promise<LlmConfigView | null> {
	assertAdmin(actor);
	const row = await findAppConfigRow();
	return row ? toView(row) : null;
}

/**
 * Whether a default exists. Teachers see this, not the config, so the course
 * settings can say what happens without an override.
 */
export async function hasAppConfig(): Promise<boolean> {
	return (await findAppConfigRow()) !== undefined;
}

export async function getCourseConfigView(actor: Actor, courseId: string): Promise<LlmConfigView | null> {
	await assertCanEditCourse(actor, courseId);
	const row = await findCourseConfigRow(courseId);
	return row ? toView(row) : null;
}

// ── Writes ──────────────────────────────────────────────────

function assertAdmin(actor: Actor): void {
	if (roleOf(actor.user) !== 'admin') {
		throw new Forbidden('Nur die Administration kann den Standard-Anbieter ändern.');
	}
}

/**
 * A course override is only ever used for the owner's classes (see
 * `resolve.ts`), so an ownerless course cannot usefully have one.
 */
export async function courseHasOwner(courseId: string): Promise<boolean> {
	const row = await db.select({ ownerId: course.ownerId }).from(course).where(eq(course.id, courseId)).get();
	return Boolean(row?.ownerId);
}

async function assertHasOwner(courseId: string): Promise<void> {
	if (!(await courseHasOwner(courseId))) {
		throw new InvalidLlmConfig([
			'Dieser Kurs hat keine Besitzerin und keinen Besitzer. Für ihn gilt immer der Standard der Schule.'
		]);
	}
}

/**
 * Checks the form, resolves the key (typed or kept) and runs the test
 * request. Returns what to store, or throws `InvalidLlmConfig` with every
 * problem found.
 */
async function prepare(
	scope: Scope,
	input: LlmConfigInput,
	existing: Row | undefined
): Promise<{ config: ProviderConfig; ciphertext: string; hint: string }> {
	const key = secretKey();
	if (!key) throw new InvalidLlmConfig(['LLM_SECRET_KEY ist auf dem Server nicht gesetzt.']);

	const errors: string[] = [];
	const baseUrl = input.baseUrl.trim().replace(/\/+$/, '');
	const model = input.model.trim();
	const effort = input.reasoningEffort.trim();
	const typedKey = input.apiKey.trim();

	try {
		const url = new URL(baseUrl);
		if (url.protocol !== 'https:' && url.protocol !== 'http:') {
			errors.push('Die Basis-URL muss mit http:// oder https:// beginnen.');
		}
	} catch {
		errors.push('Die Basis-URL ist keine gültige URL.');
	}
	if (!model) errors.push('Gib ein Modell an.');
	if (model.length > 200) errors.push('Der Modellname ist zu lang.');
	if (effort && !isReasoningEffort(effort)) errors.push('Unbekannter Reasoning-Effort.');

	let apiKey = typedKey;
	if (!apiKey && existing) {
		apiKey = decryptSecret(existing.apiKeyCiphertext, key) ?? '';
		if (!apiKey) errors.push('Der gespeicherte Schlüssel ist unlesbar. Bitte gib ihn neu ein.');
	} else if (!apiKey) {
		errors.push('Gib einen API-Schlüssel ein.');
	}
	if (errors.length > 0) throw new InvalidLlmConfig(errors);

	if (scope === 'course') {
		const blocked = await checkPublicUrl(baseUrl);
		if (blocked) throw new InvalidLlmConfig([blocked]);
	}

	const config: ProviderConfig = {
		baseUrl,
		apiKey,
		model,
		reasoningEffort: isReasoningEffort(effort) ? effort : null
	};
	const test = await testConnection(config);
	if (!test.ok) throw new InvalidLlmConfig([`Test fehlgeschlagen. ${describeFailure(test)}`]);

	return {
		config,
		ciphertext: typedKey ? encryptSecret(apiKey, key) : existing!.apiKeyCiphertext,
		hint: typedKey ? keyHint(apiKey) : existing!.apiKeyHint
	};
}

async function save(actor: Actor, scope: Scope, courseId: string | null, input: LlmConfigInput) {
	const existing = await rowFor(scope, courseId);
	const prepared = await prepare(scope, input, existing);
	const now = new Date();

	const values = {
		baseUrl: prepared.config.baseUrl,
		model: prepared.config.model,
		reasoningEffort: prepared.config.reasoningEffort,
		apiKeyCiphertext: prepared.ciphertext,
		apiKeyHint: prepared.hint,
		lastError: null,
		lastErrorAt: null,
		lastOkAt: now,
		updatedById: actor.user.id,
		updatedAt: now
	};

	if (existing) {
		await db.update(llmConfig).set(values).where(eq(llmConfig.id, existing.id)).run();
	} else {
		await db.insert(llmConfig).values({ ...values, scope, courseId, createdAt: now }).run();
	}
}

export async function saveAppConfig(actor: Actor, input: LlmConfigInput): Promise<void> {
	assertAdmin(actor);
	await save(actor, 'app', null, input);
}

export async function saveCourseConfig(actor: Actor, courseId: string, input: LlmConfigInput): Promise<void> {
	await assertCanEditCourse(actor, courseId);
	await assertHasOwner(courseId);
	await save(actor, 'course', courseId, input);
}

export async function clearAppConfig(actor: Actor): Promise<void> {
	assertAdmin(actor);
	await db.delete(llmConfig).where(eq(llmConfig.scope, 'app')).run();
}

export async function clearCourseConfig(actor: Actor, courseId: string): Promise<void> {
	await assertCanEditCourse(actor, courseId);
	await db
		.delete(llmConfig)
		.where(and(eq(llmConfig.scope, 'course'), eq(llmConfig.courseId, courseId)))
		.run();
}

/**
 * Runs the test request against what is stored and records the outcome.
 * `true` when it worked. A failure is recorded and shown, not thrown.
 */
async function retest(row: Row | undefined): Promise<boolean> {
	if (!row) throw new InvalidLlmConfig(['Es ist noch kein Anbieter gespeichert.']);
	const candidate = toCandidate(row);
	if (!candidate.config) {
		await recordFailure(row.id, describeFailure({ kind: 'undecryptable', message: 'Bitte neu eingeben.' }));
		return false;
	}
	if (row.scope === 'course') {
		const blocked = await checkPublicUrl(candidate.config.baseUrl);
		if (blocked) {
			await recordFailure(row.id, describeFailure({ kind: 'blocked_url', message: blocked }));
			return false;
		}
	}
	const result = await testConnection(candidate.config);
	if (result.ok) await recordSuccess(row.id);
	else await recordFailure(row.id, describeFailure(result));
	return result.ok;
}

export async function testAppConfig(actor: Actor): Promise<boolean> {
	assertAdmin(actor);
	return retest(await findAppConfigRow());
}

export async function testCourseConfig(actor: Actor, courseId: string): Promise<boolean> {
	await assertCanEditCourse(actor, courseId);
	return retest(await findCourseConfigRow(courseId));
}

// ── Health ──────────────────────────────────────────────────

export async function recordFailure(id: string, message: string): Promise<void> {
	await db
		.update(llmConfig)
		.set({ lastError: message, lastErrorAt: new Date() })
		.where(eq(llmConfig.id, id))
		.run();
}

/** A success clears the error: the settings show how the config behaves now. */
export async function recordSuccess(id: string): Promise<void> {
	await db
		.update(llmConfig)
		.set({ lastError: null, lastErrorAt: null, lastOkAt: new Date() })
		.where(eq(llmConfig.id, id))
		.run();
}
