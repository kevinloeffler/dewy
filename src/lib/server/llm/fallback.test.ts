import { describe, expect, it, vi } from 'vitest';
import type { ChatRequest, ChatResult, ProviderConfig } from './client';
import { jsonAttempt, runWithFallback, stripFence, textAttempt, type Candidate, type Chat } from './fallback';

const provider = (model: string): ProviderConfig => ({
	baseUrl: 'https://x.example/v1',
	apiKey: 'k',
	model,
	reasoningEffort: null
});
const course: Candidate = { id: 'c', scope: 'course', model: 'course-model', config: provider('course-model') };
const app: Candidate = { id: 'a', scope: 'app', model: 'app-model', config: provider('app-model') };

const usage = { promptTokens: 1, completionTokens: 1 };
const ok = (text: string): ChatResult => ({ ok: true, text, usage });

/** A chat whose answer depends on the model, so each candidate can be scripted. */
function chatBy(answers: Record<string, ChatResult | ((req: ChatRequest) => ChatResult)>): Chat {
	return vi.fn(async (config: ProviderConfig, req: ChatRequest) => {
		const answer = answers[config.model];
		return typeof answer === 'function' ? answer(req) : answer;
	});
}

describe('runWithFallback', () => {
	it('is unconfigured with no candidates', async () => {
		const chat = chatBy({});
		expect(await runWithFallback([], textAttempt(chat, []))).toEqual({ ok: false, reason: 'unconfigured' });
		expect(chat).not.toHaveBeenCalled();
	});

	it('uses the course provider when it works', async () => {
		const chat = chatBy({ 'course-model': ok('vom Kurs'), 'app-model': ok('von der Schule') });
		const onSuccess = vi.fn();
		const result = await runWithFallback([course, app], textAttempt(chat, []), { onSuccess });
		expect(result).toMatchObject({ ok: true, value: 'vom Kurs', fellBack: false, candidate: { scope: 'course' } });
		expect(onSuccess).toHaveBeenCalledWith(course);
		expect(chat).toHaveBeenCalledTimes(1);
	});

	it('falls back on bad credentials and records them on the course config', async () => {
		const chat = chatBy({
			'course-model': { ok: false, kind: 'auth', status: 401, message: 'bad key' },
			'app-model': ok('von der Schule')
		});
		const onFailure = vi.fn();
		const result = await runWithFallback([course, app], textAttempt(chat, []), { onFailure });
		expect(result).toMatchObject({ ok: true, value: 'von der Schule', fellBack: true, candidate: { scope: 'app' } });
		expect(onFailure).toHaveBeenCalledWith(course, expect.objectContaining({ kind: 'auth' }));
	});

	it('falls back on passing trouble without blaming the config', async () => {
		const chat = chatBy({
			'course-model': { ok: false, kind: 'rate_limited', status: 429, message: 'slow down' },
			'app-model': ok('von der Schule')
		});
		const onFailure = vi.fn();
		const result = await runWithFallback([course, app], textAttempt(chat, []), { onFailure });
		expect(result).toMatchObject({ ok: true, fellBack: true });
		expect(onFailure).not.toHaveBeenCalled();
	});

	it('treats an undecryptable key as a broken config without calling out', async () => {
		const chat = chatBy({ 'app-model': ok('von der Schule') });
		const onFailure = vi.fn();
		const broken = { ...course, config: null };
		const result = await runWithFallback([broken, app], textAttempt(chat, []), { onFailure });
		expect(result).toMatchObject({ ok: true, fellBack: true });
		expect(onFailure).toHaveBeenCalledWith(broken, expect.objectContaining({ kind: 'undecryptable' }));
		expect(chat).toHaveBeenCalledTimes(1);
	});

	it('is unavailable when everything fails, with the last failure', async () => {
		const chat = chatBy({
			'course-model': { ok: false, kind: 'auth', message: 'bad key' },
			'app-model': { ok: false, kind: 'server', status: 503, message: 'down' }
		});
		const result = await runWithFallback([course, app], textAttempt(chat, []));
		expect(result).toMatchObject({ ok: false, reason: 'unavailable', kind: 'server', fellBack: true });
	});
});

describe('jsonAttempt', () => {
	type Grade = { score: number };
	const isGrade = (v: unknown): v is Grade =>
		typeof v === 'object' && v !== null && typeof (v as Grade).score === 'number';
	const request = { messages: [], name: 'grade', schema: { type: 'object' }, validate: isGrade };

	it('asks for json_schema and returns the validated value', async () => {
		const chat = chatBy({ 'app-model': ok('{"score": 3}') });
		const result = await jsonAttempt(chat, request)(app.config!);
		expect(result).toMatchObject({ ok: true, value: { score: 3 } });
		expect(vi.mocked(chat).mock.calls[0][1].responseFormat).toMatchObject({ type: 'json_schema' });
	});

	it('retries without response_format when the endpoint refuses it', async () => {
		const chat = chatBy({
			'app-model': (req) =>
				req.responseFormat
					? { ok: false, kind: 'bad_request', status: 400, message: "Unsupported parameter: 'response_format'" }
					: ok('```json\n{"score": 2}\n```')
		});
		const result = await jsonAttempt(chat, request)(app.config!);
		expect(result).toMatchObject({ ok: true, value: { score: 2 } });
		expect(chat).toHaveBeenCalledTimes(2);
		const retry = vi.mocked(chat).mock.calls[1][1];
		expect(retry.responseFormat).toBeUndefined();
		expect(retry.messages.at(-1)?.content).toContain('JSON-Schema');
	});

	it('does not retry an unrelated bad request', async () => {
		const chat = chatBy({ 'app-model': { ok: false, kind: 'bad_request', message: 'context too long' } });
		expect(await jsonAttempt(chat, request)(app.config!)).toMatchObject({ ok: false, kind: 'bad_request' });
		expect(chat).toHaveBeenCalledTimes(1);
	});

	it('rejects output that is not JSON or not the right shape', async () => {
		expect(await jsonAttempt(chatBy({ 'app-model': ok('nope') }), request)(app.config!)).toMatchObject({
			ok: false,
			kind: 'invalid_output'
		});
		expect(await jsonAttempt(chatBy({ 'app-model': ok('{"grade": "A"}') }), request)(app.config!)).toMatchObject({
			ok: false,
			kind: 'invalid_output'
		});
	});

	it('lets a fallback provider try when the first answers garbage', async () => {
		const chat = chatBy({ 'course-model': ok('nope'), 'app-model': ok('{"score": 1}') });
		const result = await runWithFallback([course, app], jsonAttempt(chat, request));
		expect(result).toMatchObject({ ok: true, value: { score: 1 }, fellBack: true });
	});
});

describe('stripFence', () => {
	it('unwraps fenced JSON and leaves bare JSON alone', () => {
		expect(stripFence('```json\n{"a":1}\n```')).toBe('{"a":1}');
		expect(stripFence('```\n{"a":1}```')).toBe('{"a":1}');
		expect(stripFence(' {"a":1} ')).toBe('{"a":1}');
	});
});
