import { describe, expect, it } from 'vitest';
import { markdownExcerpt, renderMarkdown } from './markdown';

describe('renderMarkdown — safety', () => {
	// This is the only `{@html}` in the app. These cases are the reason the
	// renderer escapes before it interprets, rather than sanitising afterwards.
	it('escapes raw HTML instead of interpreting it', () => {
		const html = renderMarkdown('<script>alert(1)</script>');
		expect(html).not.toContain('<script>');
		expect(html).toContain('&lt;script&gt;');
	});

	it('escapes HTML inside every block kind', () => {
		expect(renderMarkdown('# <img src=x onerror=alert(1)>')).not.toContain('<img');
		expect(renderMarkdown('- <img src=x>')).not.toContain('<img');
		expect(renderMarkdown('> <img src=x>')).not.toContain('<img');
		expect(renderMarkdown('```\n<img src=x>\n```')).not.toContain('<img');
	});

	it('refuses javascript: links, rendering them as text', () => {
		const html = renderMarkdown('[click](javascript:alert(1))');
		expect(html).not.toContain('<a');
		expect(html).toContain('[click](javascript:alert(1))');
	});

	it('refuses javascript: regardless of casing or padding', () => {
		expect(renderMarkdown('[x](JaVaScRiPt:alert(1))')).not.toContain('<a');
		expect(renderMarkdown('[x](  javascript:alert(1))')).not.toContain('<a');
	});

	it('refuses data: links', () => {
		expect(renderMarkdown('[x](data:text/html,<script>alert(1)</script>)')).not.toContain('<a');
	});

	it('does not let an entity-obfuscated scheme through', () => {
		const html = renderMarkdown('[x](java&#x73;cript:alert(1))');
		expect(html).not.toContain('<a');
		expect(html).not.toContain('javascript:');
	});

	it('never emits an unescaped quote that could break out of an attribute', () => {
		const html = renderMarkdown('[x](https://e.com/"onmouseover="alert(1))');
		expect(html).not.toContain('"onmouseover="');
	});

	it('shows backticked HTML as literal text', () => {
		const html = renderMarkdown('`<b>`');
		expect(html).toContain('<code>&lt;b&gt;</code>');
	});

	it('allows http, https, mailto and site-relative links', () => {
		expect(renderMarkdown('[a](https://example.com)')).toContain('href="https://example.com"');
		expect(renderMarkdown('[a](http://example.com)')).toContain('href="http://example.com"');
		expect(renderMarkdown('[a](mailto:x@example.com)')).toContain('href="mailto:x@example.com"');
		expect(renderMarkdown('[a](/learn/intro)')).toContain('href="/learn/intro"');
	});
});

describe('renderMarkdown — blocks', () => {
	it('renders headings starting at h2, since the page owns the h1', () => {
		expect(renderMarkdown('# One')).toBe('<h2>One</h2>');
		expect(renderMarkdown('## Two')).toBe('<h3>Two</h3>');
		expect(renderMarkdown('### Three')).toBe('<h4>Three</h4>');
	});

	it('clamps deeper headings rather than emitting h5+', () => {
		expect(renderMarkdown('##### Deep')).toBe('<h4>Deep</h4>');
	});

	it('joins consecutive lines into one paragraph and splits on a blank line', () => {
		expect(renderMarkdown('a\nb\n\nc')).toBe('<p>a\nb</p>\n<p>c</p>');
	});

	it('renders unordered and ordered lists', () => {
		expect(renderMarkdown('- one\n- two')).toBe('<ul><li>one</li><li>two</li></ul>');
		expect(renderMarkdown('1. one\n2. two')).toBe('<ol><li>one</li><li>two</li></ol>');
	});

	it('renders a fenced code block with its language', () => {
		expect(renderMarkdown('```js\nmove();\n```')).toBe(
			'<pre><code class="language-js">move();</code></pre>'
		);
	});

	it('does not interpret markers inside a code fence', () => {
		expect(renderMarkdown('```\n**not bold**\n```')).toContain('**not bold**');
	});

	it('runs an unterminated fence to the end rather than reinterpreting it', () => {
		expect(renderMarkdown('```\n**shown literally**')).toBe(
			'<pre><code>**shown literally**</code></pre>'
		);
	});

	it('renders blockquotes and rules', () => {
		expect(renderMarkdown('> quoted')).toBe('<blockquote><p>quoted</p></blockquote>');
		expect(renderMarkdown('---')).toBe('<hr />');
	});

	it('starts a new block when one interrupts a paragraph', () => {
		expect(renderMarkdown('text\n- item')).toBe('<p>text</p>\n<ul><li>item</li></ul>');
	});

	it('returns an empty string for empty or whitespace-only input', () => {
		expect(renderMarkdown('')).toBe('');
		expect(renderMarkdown('   \n\n  ')).toBe('');
	});
});

describe('renderMarkdown — inline', () => {
	it('renders bold, italic and code', () => {
		expect(renderMarkdown('**b**')).toBe('<p><strong>b</strong></p>');
		expect(renderMarkdown('*i*')).toBe('<p><em>i</em></p>');
		expect(renderMarkdown('_i_')).toBe('<p><em>i</em></p>');
		expect(renderMarkdown('`c`')).toBe('<p><code>c</code></p>');
	});

	it('leaves underscores inside a URL alone', () => {
		// The reason inline is a scanner and not a chain of regex passes.
		const html = renderMarkdown('[x](https://example.com/a_b_c)');
		expect(html).toContain('href="https://example.com/a_b_c"');
		expect(html).not.toContain('<em>');
	});

	it('does not interpret markers inside a code span', () => {
		expect(renderMarkdown('`**not bold**`')).toBe('<p><code>**not bold**</code></p>');
	});

	it('nests emphasis inside link text', () => {
		expect(renderMarkdown('[**b**](https://e.com)')).toContain('<strong>b</strong>');
	});

	it('leaves an unmatched marker as literal text', () => {
		expect(renderMarkdown('a * b')).toBe('<p>a * b</p>');
		expect(renderMarkdown('2 ** 3')).toBe('<p>2 ** 3</p>');
	});

	it('turns a two-space line suffix into a hard break', () => {
		expect(renderMarkdown('a  \nb')).toBe('<p>a<br />\nb</p>');
	});
});

describe('renderMarkdown — images', () => {
	const id = '3f2b8c1e-0d4a-4b7e-9a51-2c6f0e8d7b19';

	it('renders an uploaded image', () => {
		expect(renderMarkdown(`![Ein Käfer](/images/${id})`)).toBe(
			`<p><img src="/images/${id}" alt="Ein Käfer" loading="lazy" /></p>`
		);
	});

	it('refuses any source that is not an upload, rendering it as text', () => {
		for (const src of [
			'https://example.com/x.png',
			'javascript:alert(1)',
			'data:image/svg+xml,<svg onload=alert(1)>',
			'/images/../admin',
			'//evil.example/x.png'
		]) {
			expect(renderMarkdown(`![x](${src})`)).not.toContain('<img');
		}
	});

	it('escapes the alt text and does not interpret markers inside it', () => {
		const html = renderMarkdown(`![a" onerror="alert(1) **b**](/images/${id})`);
		expect(html).not.toContain('" onerror="');
		expect(html).not.toContain('<strong>');
	});

	it('is not mistaken for a link', () => {
		expect(renderMarkdown(`![x](/images/${id})`)).not.toContain('<a');
	});
});

describe('markdownExcerpt', () => {
	it('drops images entirely', () => {
		expect(markdownExcerpt('Schau: ![Bild](/images/abc) hier.')).toBe('Schau: hier.');
	});

	it('strips markers and collapses whitespace', () => {
		expect(markdownExcerpt('# Title\n\nSome **bold** text.')).toBe('Title Some bold text.');
	});

	it('keeps link text and drops the target', () => {
		expect(markdownExcerpt('See [the docs](https://example.com).')).toBe('See the docs.');
	});

	it('skips code blocks and rules', () => {
		expect(markdownExcerpt('Intro\n\n```\ncode()\n```\n\n---')).toBe('Intro');
	});

	it('truncates with an ellipsis', () => {
		expect(markdownExcerpt('abcdefghij', 5)).toBe('abcd…');
		expect(markdownExcerpt('abc', 5)).toBe('abc');
	});
});
