/**
 * The parts of the LLM provider a page needs too. The provider itself is
 * server only (`$lib/server/llm`).
 */

/**
 * Values for the Chat Completions `reasoning_effort` field. Not every
 * provider or model accepts every value; the test request run on save is
 * what finds out.
 */
export const REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export function isReasoningEffort(value: unknown): value is ReasoningEffort {
	return typeof value === 'string' && (REASONING_EFFORTS as readonly string[]).includes(value);
}
