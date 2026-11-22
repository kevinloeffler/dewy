import { describe, expect, it, vi } from 'vitest';
import {
	chatCompletion,
	checkPublicUrl,
	completionsUrl,
	failureKindForStatus,
	isPrivateAddress,
	requestBody,
	type ProviderConfig
} from './client';

const cfg: ProviderConfig = {
	baseUrl: 'https://api.example.com/v1/',
	apiKey: 'sk-test',
	model: 'gpt-test',
	reasoningEffort: null
};

function respond(status: number, body: unknown): typeof fetch {
	return vi.fn(async () => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }));
}

describe('request shape', () => {
	it('normalises the base URL', () => {
		expect(completionsUrl('https://api.example.com/v1/')).toBe('https://api.example.com/v1/chat/completions');
		expect(completionsUrl('https://api.example.com/v1')).toBe('https://api.example.com/v1/chat/completions');
	});

	it('sends reasoning_effort only when set', () => {
		const messages = [{ role: 'user' as const, content: 'hi' }];
		expect(requestBody(cfg, { messages })).not.toHaveProperty('reasoning_effort');
		expect(requestBody({ ...cfg, reasoningEffort: 'low' }, { messages })).toMatchObject({
			model: 'gpt-test',
			reasoning_effort: 'low'
		});
	});

	it('sends the key as a bearer token', async () => {
		const fetch = respond(200, { choices: [{ message: { content: 'OK' } }] });
		await chatCompletion(cfg, { messages: [] }, { fetch });
		const [url, init] = vi.mocked(fetch).mock.calls[0];
		expect(url).toBe('https://api.example.com/v1/chat/completions');
		expect((init?.headers as Record<string, string>).authorization).toBe('Bearer sk-test');
	});
});

describe('chatCompletion', () => {
	it('returns the text and usage', async () => {
		const result = await chatCompletion(
			cfg,
			{ messages: [] },
			{
				fetch: respond(200, {
					choices: [{ message: { content: 'Hallo' } }],
					usage: { prompt_tokens: 3, completion_tokens: 1 }
				})
			}
		);
		expect(result).toEqual({ ok: true, text: 'Hallo', usage: { promptTokens: 3, completionTokens: 1 } });
	});

	it('joins content parts', async () => {
		const result = await chatCompletion(
			cfg,
			{ messages: [] },
			{ fetch: respond(200, { choices: [{ message: { content: [{ text: 'a' }, { text: 'b' }] } }] }) }
		);
		expect(result.ok && result.text).toBe('ab');
	});

	it('maps HTTP errors to kinds and keeps the provider message', async () => {
		const result = await chatCompletion(
			cfg,
			{ messages: [] },
			{ fetch: respond(401, { error: { message: 'Incorrect API key' } }) }
		);
		expect(result).toMatchObject({ ok: false, kind: 'auth', status: 401, message: 'Incorrect API key' });
	});

	it('reports an empty completion as a bad response', async () => {
		const result = await chatCompletion(
			cfg,
			{ messages: [] },
			{ fetch: respond(200, { choices: [{ message: { content: '' } }] }) }
		);
		expect(result).toMatchObject({ ok: false, kind: 'bad_response' });
	});

	it('reports a thrown fetch as a network failure', async () => {
		const fetch = vi.fn(async () => {
			throw new TypeError('fetch failed');
		});
		expect(await chatCompletion(cfg, { messages: [] }, { fetch })).toMatchObject({ ok: false, kind: 'network' });
	});

	it('times out', async () => {
		const fetch = vi.fn(
			(_url: string | URL | Request, init?: RequestInit) =>
				new Promise<Response>((_, reject) => {
					init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
				})
		);
		const result = await chatCompletion(cfg, { messages: [] }, { fetch, timeoutMs: 10 });
		expect(result).toMatchObject({ ok: false, kind: 'network' });
		expect(!result.ok && result.message).toMatch(/Zeitüberschreitung/);
	});
});

describe('failureKindForStatus', () => {
	it.each([
		[401, 'auth'],
		[403, 'auth'],
		[404, 'not_found'],
		[400, 'bad_request'],
		[422, 'bad_request'],
		[429, 'rate_limited'],
		[500, 'server'],
		[503, 'server']
	] as const)('%i → %s', (status, kind) => {
		expect(failureKindForStatus(status)).toBe(kind);
	});
});

describe('course URL guard', () => {
	it('flags private and special addresses', () => {
		for (const address of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) {
			expect(isPrivateAddress(address), address).toBe(true);
		}
		for (const address of ['8.8.8.8', '104.18.0.1', '2606:4700::1']) {
			expect(isPrivateAddress(address), address).toBe(false);
		}
	});

	const lookup = (map: Record<string, string[]>) => async (host: string) => {
		if (!(host in map)) throw new Error('ENOTFOUND');
		return map[host].map((address) => ({ address }));
	};

	it('accepts a public https endpoint', async () => {
		expect(await checkPublicUrl('https://api.openai.com/v1', lookup({ 'api.openai.com': ['104.18.0.1'] }))).toBeNull();
	});

	it('refuses http, credentials, private targets and unknown hosts', async () => {
		const dns = lookup({ 'internal.example': ['10.0.0.5'], 'mixed.example': ['8.8.8.8', '127.0.0.1'] });
		expect(await checkPublicUrl('http://api.openai.com/v1', dns)).toMatch(/https/);
		expect(await checkPublicUrl('https://user:pw@api.example.com', dns)).toMatch(/Zugangsdaten/);
		expect(await checkPublicUrl('https://internal.example/v1', dns)).toMatch(/intern/);
		expect(await checkPublicUrl('https://mixed.example/v1', dns)).toMatch(/intern/);
		expect(await checkPublicUrl('https://127.0.0.1/v1', dns)).toMatch(/intern/);
		expect(await checkPublicUrl('https://[::1]/v1', dns)).toMatch(/intern/);
		expect(await checkPublicUrl('https://nowhere.example/v1', dns)).toMatch(/nicht gefunden/);
		expect(await checkPublicUrl('not a url', dns)).toMatch(/keine gültige/);
	});
});
