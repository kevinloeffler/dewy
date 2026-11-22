import type {
	ChatMessage,
	ChatRequest,
	ChatResult,
	LlmFailure,
	LlmFailureKind,
	ProviderConfig,
	Usage
} from './client';

/**
 * Which provider answers, and what happens when one does not.
 *
 * Free of the database and the network: the candidates come in as data, and
 * calling a provider and recording its health are injected. That keeps the
 * whole fallback rule in one testable place; `index.ts` wires it to the real
 * `config.ts` and `client.ts`.
 *
 * The rule: try the candidates in order (a course's own config first, then the
 * school's default). Any failure moves on to the next one. Failures that say
 * *the config itself is wrong* are recorded on it, so its owner sees it in the
 * settings; passing trouble (a rate limit, a 5xx, a bad answer) is not, since
 * the config may be fine and blaming it would only alarm a teacher.
 */

export type Scope = 'app' | 'course';

export type Candidate = {
	id: string;
	scope: Scope;
	model: string;
	/** `null` when the stored key could not be decrypted. */
	config: ProviderConfig | null;
};

export type AttemptResult<T> = { ok: true; value: T; usage: Usage } | (LlmFailure & { usage?: Usage });

export type Attempt<T> = (config: ProviderConfig) => Promise<AttemptResult<T>>;

export type FallbackHooks = {
	onFailure?: (candidate: Candidate, failure: LlmFailure) => void | Promise<void>;
	onSuccess?: (candidate: Candidate) => void | Promise<void>;
};

export type FallbackOutcome<T> =
	| { ok: true; value: T; usage: Usage; candidate: Candidate; fellBack: boolean }
	| { ok: false; reason: 'unconfigured' }
	| {
			ok: false;
			reason: 'unavailable';
			kind: LlmFailureKind;
			message: string;
			candidate: Candidate;
			fellBack: boolean;
			usage: Usage;
	  };

/** Failures that mean the config is broken, rather than that this one call went wrong. */
const CONFIG_FAILURES: ReadonlySet<LlmFailureKind> = new Set([
	'auth',
	'not_found',
	'network',
	'blocked_url',
	'undecryptable'
]);

export function isConfigFailure(kind: LlmFailureKind): boolean {
	return CONFIG_FAILURES.has(kind);
}

const NO_USAGE: Usage = { promptTokens: null, completionTokens: null };

function addUsage(a: Usage, b: Usage | undefined): Usage {
	if (!b) return a;
	const sum = (x: number | null, y: number | null) => (x === null && y === null ? null : (x ?? 0) + (y ?? 0));
	return {
		promptTokens: sum(a.promptTokens, b.promptTokens),
		completionTokens: sum(a.completionTokens, b.completionTokens)
	};
}

export async function runWithFallback<T>(
	candidates: Candidate[],
	attempt: Attempt<T>,
	hooks: FallbackHooks = {}
): Promise<FallbackOutcome<T>> {
	if (candidates.length === 0) return { ok: false, reason: 'unconfigured' };

	let usage = NO_USAGE;
	let last: { candidate: Candidate; failure: LlmFailure } | null = null;

	for (const [index, candidate] of candidates.entries()) {
		const result: AttemptResult<T> = candidate.config
			? await attempt(candidate.config)
			: {
					ok: false,
					kind: 'undecryptable',
					message: 'Der gespeicherte API-Schlüssel lässt sich nicht entschlüsseln. Bitte neu eingeben.'
				};
		usage = addUsage(usage, result.usage);

		if (result.ok) {
			await hooks.onSuccess?.(candidate);
			return { ok: true, value: result.value, usage, candidate, fellBack: index > 0 };
		}

		const failure: LlmFailure = {
			ok: false,
			kind: result.kind,
			message: result.message,
			...(result.status === undefined ? {} : { status: result.status })
		};
		if (isConfigFailure(failure.kind)) await hooks.onFailure?.(candidate, failure);
		last = { candidate, failure };
	}

	// `candidates` is non-empty, so the loop ran and `last` is set.
	const { candidate, failure } = last!;
	return {
		ok: false,
		reason: 'unavailable',
		kind: failure.kind,
		message: failure.message,
		candidate,
		fellBack: candidates.length > 1,
		usage
	};
}

// ── Attempts ────────────────────────────────────────────────

export type Chat = (config: ProviderConfig, request: ChatRequest) => Promise<ChatResult>;

export function textAttempt(chat: Chat, messages: ChatMessage[]): Attempt<string> {
	return async (config) => {
		const result = await chat(config, { messages });
		return result.ok ? { ok: true, value: result.text, usage: result.usage } : result;
	};
}

export type JsonRequest<T> = {
	messages: ChatMessage[];
	/** A short identifier the provider sees, e.g. `grade`. `[a-zA-Z0-9_-]` only. */
	name: string;
	/** A JSON Schema. Under `strict`, every object needs `additionalProperties: false`. */
	schema: object;
	/** The caller's own check of the parsed value. Nothing that fails it is returned. */
	validate: (value: unknown) => value is T;
};

/**
 * `json_schema` support differs between providers far more than plain
 * completions do. The first try asks for it; an endpoint that refuses the
 * field gets the same request again with the schema written into the
 * conversation instead, which every model can follow.
 */
function refusesResponseFormat(failure: LlmFailure): boolean {
	return failure.kind === 'bad_request' && /response_format|json_schema|schema|structured/i.test(failure.message);
}

/** Models answering without `response_format` like to wrap JSON in a code fence. */
export function stripFence(text: string): string {
	const fenced = /^\s*```(?:json)?\s*\n?([\s\S]*?)\n?\s*```\s*$/i.exec(text);
	return (fenced ? fenced[1] : text).trim();
}

function withSchemaInstruction(messages: ChatMessage[], schema: object): ChatMessage[] {
	return [
		...messages,
		{
			role: 'system',
			content: `Antworte ausschliesslich mit einem JSON-Objekt nach diesem JSON-Schema, ohne weiteren Text:\n${JSON.stringify(schema)}`
		}
	];
}

export function jsonAttempt<T>(chat: Chat, request: JsonRequest<T>): Attempt<T> {
	return async (config) => {
		let usage = NO_USAGE;
		let result = await chat(config, {
			messages: request.messages,
			responseFormat: {
				type: 'json_schema',
				json_schema: { name: request.name, schema: request.schema, strict: true }
			}
		});
		if (!result.ok && refusesResponseFormat(result)) {
			result = await chat(config, { messages: withSchemaInstruction(request.messages, request.schema) });
		}
		if (!result.ok) return result;
		usage = addUsage(usage, result.usage);

		let parsed: unknown;
		try {
			parsed = JSON.parse(stripFence(result.text));
		} catch {
			return { ok: false, kind: 'invalid_output', message: 'Die Antwort war kein gültiges JSON.', usage };
		}
		if (!request.validate(parsed)) {
			return {
				ok: false,
				kind: 'invalid_output',
				message: 'Die Antwort hatte nicht die erwartete Form.',
				usage
			};
		}
		return { ok: true, value: parsed, usage };
	};
}
