import { fail } from '@sveltejs/kit';
import { Forbidden } from '$lib/server/users';
import { InvalidLlmConfig, type LlmConfigInput } from './config';

/**
 * Glue for the two pages that edit a config (`/admin/settings` and the course
 * page), so both answer the same way. The answer is always under `llm`, so it
 * cannot be mistaken for the course page's own `message`.
 */

export function llmInputFrom(formData: FormData): LlmConfigInput {
	return {
		baseUrl: formData.get('baseUrl')?.toString() ?? '',
		apiKey: formData.get('apiKey')?.toString() ?? '',
		model: formData.get('model')?.toString() ?? '',
		reasoningEffort: formData.get('reasoningEffort')?.toString() ?? ''
	};
}

export type LlmActionResult = { llm: { ok: boolean; message: string } };

/** Runs one config write. `work` returns the message on success, or a failure message to show. */
export async function llmAction(work: () => Promise<{ ok: boolean; message: string }>) {
	try {
		const result = await work();
		return result.ok ? { llm: result } : fail(400, { llm: result });
	} catch (cause) {
		if (cause instanceof Forbidden) return fail(403, { llm: { ok: false, message: cause.message } });
		if (cause instanceof InvalidLlmConfig) {
			return fail(400, { llm: { ok: false, message: cause.errors.join(' ') } });
		}
		throw cause;
	}
}
