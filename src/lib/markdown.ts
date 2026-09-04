/**
 * The theory-block markdown renderer.
 *
 * This is the only place in the app that produces HTML for `{@html}`, so it is
 * written to be safe *by construction* rather than by sanitisation: every text
 * run is escaped before any marker is interpreted, and the only tags in the
 * output are ones this file chose to emit. Nothing from `source` is ever passed
 * through as markup. That is the strictly easier direction — the alternative
 * (render permissively with a library, then try to take the dangerous parts
 * back out) needs a DOM server-side and an allowlist that is itself a security
 * surface.
 *
 * It deliberately supports a small subset. Anything outside it renders as
 * literal text, which is the safe failure mode for a teacher who pastes
 * something unexpected. Raw HTML is *always* shown as text, never interpreted.
 *
 * The two-pass shape — `blocks()` then `renderBlock()`, with a separate inline
 * scanner — mirrors `game/script/lexer.ts` + `parser.ts`.
 */

export type MarkdownFeature = { syntax: string; result: string };

/** Rendered beside the editor, so the supported subset is documented once. */
export const MARKDOWN_FEATURES: readonly MarkdownFeature[] = [
	{ syntax: '# Titel', result: 'Überschrift (## und ### werden kleiner)' },
	{ syntax: '**fett**', result: 'fett' },
	{ syntax: '*kursiv*', result: 'kursiv' },
	{ syntax: '`Code`', result: 'Code im Text' },
	{ syntax: '```\nCodeblock\n```', result: 'Ein Codeblock' },
	{ syntax: '- Eintrag', result: 'Eine Aufzählung' },
	{ syntax: '1. Eintrag', result: 'Eine nummerierte Liste' },
	{ syntax: '> Zitat', result: 'Ein Zitatblock' },
	{ syntax: '[Text](https://…)', result: 'Ein Link' },
	{ syntax: '---', result: 'Eine Trennlinie' }
];

const MAX_HEADING = 3;

export function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

/**
 * Scheme allowlist for link targets.
 *
 * Runs against the *escaped* URL, which is safe: escaping only touches
 * `& < > " '`, none of which appear in a scheme, and an entity-obfuscated
 * `java&#x73;cript:` has already become the literal text `java&amp;#x73;cript:`
 * by the time it gets here. Anything not matched renders as plain text rather
 * than as a link — notably `javascript:` and `data:`.
 */
function safeHref(url: string): string | null {
	const trimmed = url.trim();
	if (trimmed.length === 0) return null;
	if (trimmed.startsWith('/') || trimmed.startsWith('#')) return trimmed;

	const lower = trimmed.toLowerCase();
	if (lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('mailto:')) {
		return trimmed;
	}
	return null;
}

// ============================================================
// Inline
// ============================================================

/**
 * Renders inline markers inside an already-escaped run of text.
 *
 * A single left-to-right scanner rather than a chain of regex replacements,
 * because the passes would fight: doing links first lets a later emphasis pass
 * rewrite the inside of an `href`, and doing emphasis first mangles any URL
 * containing `_` — which is most of them. Consuming `[text](url)` whole, before
 * emphasis is even considered, avoids both.
 */
function inline(escaped: string): string {
	let out = '';
	let i = 0;

	while (i < escaped.length) {
		const rest = escaped.slice(i);

		// Code spans win over everything — their contents are never markers.
		if (escaped[i] === '`') {
			const end = escaped.indexOf('`', i + 1);
			if (end !== -1) {
				out += `<code>${escaped.slice(i + 1, end)}</code>`;
				i = end + 1;
				continue;
			}
		}

		if (escaped[i] === '[') {
			const match = /^\[([^\]]*)\]\(([^)\s]*)\)/.exec(rest);
			if (match) {
				const href = safeHref(match[2]);
				// An unusable scheme degrades to the literal source text.
				out += href
					? `<a href="${href}" rel="noopener noreferrer">${inline(match[1])}</a>`
					: escapeHtml(`[${unescapeForText(match[1])}](${unescapeForText(match[2])})`);
				i += match[0].length;
				continue;
			}
		}

		if (rest.startsWith('**')) {
			const end = escaped.indexOf('**', i + 2);
			if (end !== -1 && end > i + 2) {
				out += `<strong>${inline(escaped.slice(i + 2, end))}</strong>`;
				i = end + 2;
				continue;
			}
		}

		if (escaped[i] === '*' || escaped[i] === '_') {
			const marker = escaped[i];
			const end = escaped.indexOf(marker, i + 1);
			if (end !== -1 && end > i + 1) {
				out += `<em>${inline(escaped.slice(i + 1, end))}</em>`;
				i = end + 1;
				continue;
			}
		}

		out += escaped[i];
		i++;
	}

	return out;
}

/** Undoes `escapeHtml` so a rejected construct can be re-escaped as one unit. */
function unescapeForText(escaped: string): string {
	return escaped
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, '&');
}

/** Escapes, applies inline markers, and turns a two-space suffix into a break. */
function text(line: string): string {
	const hardBreak = /\s\s$/.test(line);
	return inline(escapeHtml(line.trim())) + (hardBreak ? '<br />' : '');
}

// ============================================================
// Blocks
// ============================================================

type Block =
	| { kind: 'heading'; level: number; text: string }
	| { kind: 'paragraph'; lines: string[] }
	| { kind: 'code'; language: string | null; lines: string[] }
	| { kind: 'list'; ordered: boolean; items: string[] }
	| { kind: 'quote'; lines: string[] }
	| { kind: 'rule' };

function blocks(source: string): Block[] {
	const lines = source.replace(/\r\n?/g, '\n').split('\n');
	const result: Block[] = [];
	let i = 0;

	while (i < lines.length) {
		const line = lines[i];

		if (line.trim().length === 0) {
			i++;
			continue;
		}

		// Fenced code. An unterminated fence runs to the end of the document
		// rather than falling back to a paragraph, which would re-interpret the
		// markers the author was trying to show literally.
		const fence = /^\s*```\s*([A-Za-z0-9_+-]*)\s*$/.exec(line);
		if (fence) {
			const language = fence[1] || null;
			const body: string[] = [];
			i++;
			while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
				body.push(lines[i]);
				i++;
			}
			i++; // closing fence
			result.push({ kind: 'code', language, lines: body });
			continue;
		}

		if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) {
			result.push({ kind: 'rule' });
			i++;
			continue;
		}

		const heading = /^(#{1,6})\s+(.*)$/.exec(line);
		if (heading) {
			result.push({
				kind: 'heading',
				level: Math.min(heading[1].length, MAX_HEADING),
				text: heading[2]
			});
			i++;
			continue;
		}

		if (/^\s*>\s?/.test(line)) {
			const body: string[] = [];
			while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
				body.push(lines[i].replace(/^\s*>\s?/, ''));
				i++;
			}
			result.push({ kind: 'quote', lines: body });
			continue;
		}

		const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
		const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
		if (bullet || numbered) {
			const ordered = Boolean(numbered);
			const items: string[] = [];
			while (i < lines.length) {
				const match = ordered
					? /^\s*\d+[.)]\s+(.*)$/.exec(lines[i])
					: /^\s*[-*]\s+(.*)$/.exec(lines[i]);
				if (!match) break;
				items.push(match[1]);
				i++;
			}
			result.push({ kind: 'list', ordered, items });
			continue;
		}

		const paragraph: string[] = [];
		while (i < lines.length && lines[i].trim().length > 0 && !isBlockStart(lines[i])) {
			paragraph.push(lines[i]);
			i++;
		}
		result.push({ kind: 'paragraph', lines: paragraph });
	}

	return result;
}

/** Whether a line inside a paragraph run actually starts a new block. */
function isBlockStart(line: string): boolean {
	return (
		/^\s*```/.test(line) ||
		/^\s*(---+|\*\*\*+)\s*$/.test(line) ||
		/^#{1,6}\s+/.test(line) ||
		/^\s*>\s?/.test(line) ||
		/^\s*[-*]\s+/.test(line) ||
		/^\s*\d+[.)]\s+/.test(line)
	);
}

function renderBlock(block: Block): string {
	switch (block.kind) {
		case 'heading': {
			// The page's own <h1> is the item title, so headings start at <h2>.
			const tag = `h${block.level + 1}`;
			return `<${tag}>${inline(escapeHtml(block.text.trim()))}</${tag}>`;
		}
		case 'paragraph':
			return `<p>${block.lines.map(text).join('\n')}</p>`;
		case 'code': {
			const attr = block.language ? ` class="language-${escapeHtml(block.language)}"` : '';
			return `<pre><code${attr}>${escapeHtml(block.lines.join('\n'))}</code></pre>`;
		}
		case 'list': {
			const tag = block.ordered ? 'ol' : 'ul';
			const items = block.items.map((item) => `<li>${inline(escapeHtml(item.trim()))}</li>`);
			return `<${tag}>${items.join('')}</${tag}>`;
		}
		case 'quote':
			return `<blockquote><p>${block.lines.map(text).join('\n')}</p></blockquote>`;
		case 'rule':
			return '<hr />';
	}
}

/**
 * Renders the theory-block markdown subset to HTML.
 *
 * Never emits markup taken from `source`.
 */
export function renderMarkdown(source: string): string {
	return blocks(source).map(renderBlock).join('\n');
}

/** Plain-text lead-in for course maps and item summaries. */
export function markdownExcerpt(source: string, max = 140): string {
	const plain = blocks(source)
		.flatMap((block) => {
			switch (block.kind) {
				case 'heading':
					return [block.text];
				case 'paragraph':
				case 'quote':
					return block.lines;
				case 'list':
					return block.items;
				case 'code':
				case 'rule':
					return [];
			}
		})
		.join(' ')
		// Strip the markers themselves — this is for a plain-text preview.
		.replace(/[*_`]/g, '')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/\s+/g, ' ')
		.trim();

	if (plain.length <= max) return plain;
	return plain.slice(0, Math.max(0, max - 1)).trimEnd() + '…';
}
