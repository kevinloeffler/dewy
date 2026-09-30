import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '$lib/markdown';
import { findBuiltinImage } from '$lib/server/builtin-images';
import { MAX_THEORY_BODY } from '$lib/server/courses';
import body from './einfuehrung.md?raw';

describe('Einführung theory block', () => {
	const sources = [...body.matchAll(/!\[[^\]]*\]\(([^)]*)\)/g)].map((m) => m[1]);

	it('embeds images', () => {
		expect(sources.length).toBeGreaterThan(0);
	});

	it('renders every image rather than falling back to text', () => {
		const html = renderMarkdown(body);
		expect(html.match(/<img /g)?.length).toBe(sources.length);
		expect(html).not.toContain('![');
	});

	it('points every image at a shipped built-in', () => {
		for (const src of sources) {
			expect(findBuiltinImage(src.replace(/^\/images\//, '')), src).not.toBeNull();
		}
	});

	it('fits a theory block', () => {
		expect(body.length).toBeLessThanOrEqual(MAX_THEORY_BODY);
	});
});
