import { lookup as dnsLookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import type { ReasoningEffort } from '$lib/llm';

/**
 * Talking to one OpenAI Chat Completions compatible endpoint.
 *
 * Plain `fetch` rather than the `openai` SDK: one POST is all we need, and
 * every provider worth supporting (OpenAI, Azure-style proxies, OpenRouter,
 * Ollama, vLLM, LM Studio) speaks this one route. Free of the database and of
 * SvelteKit, so it is tested in plain Node with a stubbed `fetch`.
 *
 * Nothing here throws for a provider problem. Every failure becomes an
 * `LlmFailure` with a `kind` the fallback loop can decide on.
 */

export { isReasoningEffort, REASONING_EFFORTS, type ReasoningEffort } from '$lib/llm';

export type ProviderConfig = {
	baseUrl: string;
	apiKey: string;
	model: string;
	reasoningEffort: ReasoningEffort | null;
};

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type ResponseFormat =
	| { type: 'json_schema'; json_schema: { name: string; schema: object; strict: boolean } }
	| { type: 'json_object' };

export type LlmFailureKind =
	/** 401 / 403: the key is wrong, revoked or lacks access. */
	| 'auth'
	/** 404: wrong base URL or unknown model. */
	| 'not_found'
	/** 400 / 422: the endpoint understood us and refused the request. */
	| 'bad_request'
	| 'rate_limited'
	/** 5xx: the provider's own trouble. */
	| 'server'
	/** DNS, connection, TLS, timeout or a redirect. */
	| 'network'
	/** A 2xx whose body is not a completion we can read. */
	| 'bad_response'
	/** The URL points somewhere a course config may not reach (see `assertPublicUrl`). */
	| 'blocked_url'
	/** The stored key could not be decrypted: `LLM_SECRET_KEY` changed or is missing. */
	| 'undecryptable'
	/** A JSON completion that did not parse or did not pass the caller's check. */
	| 'invalid_output';

export type LlmFailure = { ok: false; kind: LlmFailureKind; status?: number; message: string };

export type Usage = { promptTokens: number | null; completionTokens: number | null };

export type ChatSuccess = { ok: true; text: string; usage: Usage };

export type ChatResult = ChatSuccess | LlmFailure;

export type ChatRequest = {
	messages: ChatMessage[];
	responseFormat?: ResponseFormat;
};

export type ClientOptions = {
	timeoutMs?: number;
	signal?: AbortSignal;
	fetch?: typeof fetch;
};

export const DEFAULT_TIMEOUT_MS = 60_000;

/** `https://api.openai.com/v1/` and `…/v1` both become `…/v1/chat/completions`. */
export function completionsUrl(baseUrl: string): string {
	return `${baseUrl.trim().replace(/\/+$/, '')}/chat/completions`;
}

/** The request body, separate so its shape is tested without a network. */
export function requestBody(cfg: ProviderConfig, request: ChatRequest): Record<string, unknown> {
	return {
		model: cfg.model,
		messages: request.messages,
		// Only when set: a provider without reasoning models may refuse the field.
		...(cfg.reasoningEffort ? { reasoning_effort: cfg.reasoningEffort } : {}),
		...(request.responseFormat ? { response_format: request.responseFormat } : {})
	};
}

export function failureKindForStatus(status: number): LlmFailureKind {
	if (status === 401 || status === 403) return 'auth';
	if (status === 404) return 'not_found';
	if (status === 429) return 'rate_limited';
	if (status >= 500) return 'server';
	return 'bad_request';
}

/** The provider's own error text if it sent one, trimmed so a log line stays a line. */
async function errorMessage(response: Response): Promise<string> {
	const raw = await response.text().catch(() => '');
	let message = raw;
	try {
		const parsed = JSON.parse(raw) as { error?: { message?: unknown } | string; message?: unknown };
		if (typeof parsed.error === 'string') message = parsed.error;
		else if (typeof parsed.error?.message === 'string') message = parsed.error.message;
		else if (typeof parsed.message === 'string') message = parsed.message;
	} catch {
		// Not JSON; the raw text is the best we have.
	}
	message = message.trim() || `HTTP ${response.status}`;
	return message.length > 300 ? `${message.slice(0, 297)}…` : message;
}

/** `content` is a string almost everywhere, but some servers send an array of parts. */
function contentText(content: unknown): string | null {
	if (typeof content === 'string') return content;
	if (Array.isArray(content)) {
		const text = content
			.map((part) =>
				part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string'
					? (part as { text: string }).text
					: ''
			)
			.join('');
		return text;
	}
	return null;
}

function count(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export async function chatCompletion(
	cfg: ProviderConfig,
	request: ChatRequest,
	options: ClientOptions = {}
): Promise<ChatResult> {
	const doFetch = options.fetch ?? fetch;
	const timeout = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
	const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

	let response: Response;
	try {
		response = await doFetch(completionsUrl(cfg.baseUrl), {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				authorization: `Bearer ${cfg.apiKey}`
			},
			body: JSON.stringify(requestBody(cfg, request)),
			// A completions endpoint has no business redirecting, and following
			// one would let a public URL bounce the request somewhere private.
			redirect: 'error',
			signal
		});
	} catch (cause) {
		const timedOut = timeout.aborted;
		return {
			ok: false,
			kind: 'network',
			message: timedOut
				? 'Zeitüberschreitung beim Warten auf den Anbieter.'
				: `Anbieter nicht erreichbar (${cause instanceof Error ? cause.message : String(cause)}).`
		};
	}

	if (!response.ok) {
		return {
			ok: false,
			kind: failureKindForStatus(response.status),
			status: response.status,
			message: await errorMessage(response)
		};
	}

	let body: {
		choices?: { message?: { content?: unknown } }[];
		usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
	};
	try {
		body = await response.json();
	} catch {
		return { ok: false, kind: 'bad_response', message: 'Die Antwort des Anbieters ist kein JSON.' };
	}

	const text = contentText(body?.choices?.[0]?.message?.content);
	if (text === null || text.trim() === '') {
		return { ok: false, kind: 'bad_response', message: 'Der Anbieter hat eine leere Antwort geschickt.' };
	}

	return {
		ok: true,
		text,
		usage: {
			promptTokens: count(body.usage?.prompt_tokens),
			completionTokens: count(body.usage?.completion_tokens)
		}
	};
}

/**
 * One tiny completion, run when a config is saved, so a mistyped key is
 * refused there rather than discovered by a student. No token limit: a
 * reasoning model can spend a tiny limit entirely on thinking and answer
 * nothing, which would read as a broken config.
 */
export async function testConnection(
	cfg: ProviderConfig,
	options: ClientOptions = {}
): Promise<{ ok: true } | LlmFailure> {
	const result = await chatCompletion(
		cfg,
		{ messages: [{ role: 'user', content: 'Antworte nur mit: OK' }] },
		{ timeoutMs: 30_000, ...options }
	);
	return result.ok ? { ok: true } : result;
}

// ── Where a course config may point ─────────────────────────

/**
 * Addresses a teacher's base URL must not reach.
 *
 * The server makes the request, so without this a teacher could type
 * `http://localhost:…` or a cloud metadata address and have the server call
 * it on their behalf. Only course configs are checked: the admin's default
 * may well be a local Ollama or vLLM on purpose.
 */
const blocked = new BlockList();
for (const [network, prefix] of [
	['0.0.0.0', 8],
	['10.0.0.0', 8],
	['100.64.0.0', 10],
	['127.0.0.0', 8],
	['169.254.0.0', 16],
	['172.16.0.0', 12],
	['192.0.0.0', 24],
	['192.168.0.0', 16],
	['198.18.0.0', 15],
	['224.0.0.0', 3]
] as const) {
	blocked.addSubnet(network, prefix, 'ipv4');
}
for (const [network, prefix] of [
	['::', 128],
	['::1', 128],
	['fc00::', 7],
	['fe80::', 10],
	['ff00::', 8]
] as const) {
	blocked.addSubnet(network, prefix, 'ipv6');
}

export function isPrivateAddress(address: string): boolean {
	const family = isIP(address);
	if (family === 4) return blocked.check(address, 'ipv4');
	if (family === 6) {
		// `::ffff:10.0.0.1` is an IPv4 address in disguise.
		const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
		if (mapped) return blocked.check(mapped[1], 'ipv4');
		return blocked.check(address, 'ipv6');
	}
	return true;
}

export type Lookup = (hostname: string) => Promise<{ address: string }[]>;

const defaultLookup: Lookup = (hostname) => dnsLookup(hostname, { all: true });

/**
 * `null` when a course config may use this URL, otherwise the reason.
 *
 * It checks what the name resolves to *now*. A name that resolves differently
 * by the time `fetch` runs (DNS rebinding) is not caught. Closing that would
 * need a pinned-address agent, and a teacher who can already write course
 * content is not the attacker this is mainly for.
 */
export async function checkPublicUrl(raw: string, lookup: Lookup = defaultLookup): Promise<string | null> {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		return 'Das ist keine gültige URL.';
	}
	if (url.protocol !== 'https:') return 'Die Basis-URL muss mit https:// beginnen.';
	if (url.username || url.password) return 'Die Basis-URL darf keine Zugangsdaten enthalten.';

	// `new URL` keeps IPv6 hosts in brackets.
	const host = url.hostname.replace(/^\[|\]$/g, '');
	let addresses: string[];
	if (isIP(host)) {
		addresses = [host];
	} else {
		try {
			addresses = (await lookup(host)).map((row) => row.address);
		} catch {
			return `Der Server „${host}“ wurde nicht gefunden.`;
		}
	}
	if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
		return 'Die Basis-URL zeigt auf ein internes Netzwerk.';
	}
	return null;
}
