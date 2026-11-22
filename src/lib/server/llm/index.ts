import { db } from '$lib/server/db';
import { llmUsage } from '$lib/server/db/schema';
import type { Viewer } from '$lib/server/courses';
import { chatCompletion, type ChatMessage, type LlmFailureKind } from './client';
import { describeFailure, recordFailure, recordSuccess } from './config';
import {
	jsonAttempt,
	runWithFallback,
	textAttempt,
	type Attempt,
	type FallbackOutcome,
	type Scope
} from './fallback';
import { resolveCandidates } from './resolve';

/**
 * The LLM provider: what every AI feature calls.
 *
 * ```ts
 * const result = await complete(
 *   { user: locals.user, courseId, feature: 'explain-error' },
 *   { system: '…', messages: [{ role: 'user', content: error }] }
 * );
 * if (!result.ok) {
 *   // 'unconfigured': no provider anywhere. Hide the button or say so.
 *   // 'unavailable': configured, but every provider failed just now.
 * }
 * ```
 *
 * It picks the course's own provider when the caller may use it, falls back
 * to the school's default, and reports a missing or failing provider as a
 * value rather than an exception. Programming errors still throw.
 *
 * Server only. Student code goes into prompts, so callers should send no more
 * of it than the feature needs, and nothing here stores a prompt.
 */

export type LlmContext = {
	/** Who is asking. Decides whether a course's own provider applies. */
	user: Viewer;
	/** The course the request belongs to, if any. Without one, only the default is used. */
	courseId?: string | null;
	/** A short stable name for the usage log, e.g. `explain-error`. */
	feature: string;
};

export type LlmResult<T> =
	| { ok: true; value: T; source: Scope; fellBack: boolean }
	| { ok: false; reason: 'unconfigured' }
	| { ok: false; reason: 'unavailable'; kind: LlmFailureKind };

export type TextRequest = {
	/** Prepended as the system message. */
	system?: string;
	messages: ChatMessage[];
};

export type JsonCompletionRequest<T> = TextRequest & {
	/** `[a-zA-Z0-9_-]`, shown to the provider as the schema's name. */
	name: string;
	/** JSON Schema. Under strict mode every object needs `additionalProperties: false`. */
	schema: object;
	/** Your own check of the parsed value. A value that fails it is never returned. */
	validate: (value: unknown) => value is T;
};

export type { ChatMessage, LlmFailureKind };

function conversation(request: TextRequest): ChatMessage[] {
	return request.system ? [{ role: 'system', content: request.system }, ...request.messages] : request.messages;
}

/** Plain text, e.g. an explanation or a piece of feedback. */
export function complete(ctx: LlmContext, request: TextRequest): Promise<LlmResult<string>> {
	return run(ctx, textAttempt(chatCompletion, conversation(request)));
}

/** A value matching `schema` and passing `validate`, e.g. a grade with reasons. */
export function completeJson<T>(ctx: LlmContext, request: JsonCompletionRequest<T>): Promise<LlmResult<T>> {
	return run(
		ctx,
		jsonAttempt(chatCompletion, {
			messages: conversation(request),
			name: request.name,
			schema: request.schema,
			validate: request.validate
		})
	);
}

/**
 * Whether a provider is configured for this caller, without sending anything.
 * For deciding whether to show an AI button at all. A provider that is
 * configured but broken still counts, since the result will say so.
 */
export async function isAvailable(ctx: Pick<LlmContext, 'user' | 'courseId'>): Promise<boolean> {
	return (await resolveCandidates(ctx.user, ctx.courseId)).length > 0;
}

async function run<T>(ctx: LlmContext, attempt: Attempt<T>): Promise<LlmResult<T>> {
	const started = Date.now();
	const candidates = await resolveCandidates(ctx.user, ctx.courseId);

	const outcome = await runWithFallback(candidates, attempt, {
		onFailure: (candidate, failure) => {
			console.warn(`[llm] ${candidate.scope} config ${candidate.id} failed (${failure.kind}): ${failure.message}`);
			return recordFailure(candidate.id, describeFailure(failure));
		},
		onSuccess: (candidate) => recordSuccess(candidate.id)
	});

	await logUsage(ctx, outcome, Date.now() - started);

	if (outcome.ok) {
		return { ok: true, value: outcome.value, source: outcome.candidate.scope, fellBack: outcome.fellBack };
	}
	if (outcome.reason === 'unconfigured') return outcome;
	return { ok: false, reason: 'unavailable', kind: outcome.kind };
}

/** Never lets a logging problem become the feature's problem. */
async function logUsage<T>(ctx: LlmContext, outcome: FallbackOutcome<T>, latencyMs: number): Promise<void> {
	try {
		const answered = outcome.ok || outcome.reason === 'unavailable' ? outcome : null;
		await db
			.insert(llmUsage)
			.values({
				feature: ctx.feature,
				userId: ctx.user?.id ?? null,
				courseId: ctx.courseId ?? null,
				configScope: answered?.candidate.scope ?? null,
				fellBack: answered?.fellBack ?? false,
				outcome: outcome.ok
					? 'ok'
					: outcome.reason === 'unconfigured'
						? 'unconfigured'
						: outcome.kind === 'invalid_output'
							? 'invalid_output'
							: 'error',
				model: answered?.candidate.model ?? null,
				promptTokens: answered?.usage.promptTokens ?? null,
				completionTokens: answered?.usage.completionTokens ?? null,
				latencyMs
			})
			.run();
	} catch (cause) {
		console.error('[llm] could not write usage row', cause);
	}
}
