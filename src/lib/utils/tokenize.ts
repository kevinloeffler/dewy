export type TokenType = 'comment' | 'string' | 'number' | 'kw' | 'fn' | 'ident' | 'punct' | 'ws';

export interface Token {
	t: TokenType;
	s: string;
}

const KEYWORDS = new Set([
	'for', 'let', 'const', 'var', 'if', 'else', 'while', 'do',
	'function', 'return', 'true', 'false', 'null', 'undefined',
	'break', 'continue', 'new', 'typeof', 'instanceof', 'of', 'in',
	'class', 'extends', 'import', 'export', 'default', 'async', 'await',
]);

export function tokenizeLine(line: string): Token[] {
	const toks: Token[] = [];
	let i = 0;

	while (i < line.length && line[i] === ' ') {
		toks.push({ t: 'ws', s: ' ' });
		i++;
	}

	while (i < line.length) {
		const ch = line[i];

		if (ch === '/' && line[i + 1] === '/') {
			toks.push({ t: 'comment', s: line.slice(i) });
			break;
		}

		if (ch === '"' || ch === "'" || ch === '`') {
			const q = ch;
			let j = i + 1;
			while (j < line.length && line[j] !== q) j++;
			toks.push({ t: 'string', s: line.slice(i, Math.min(j + 1, line.length)) });
			i = j + 1;
			continue;
		}

		if (/[0-9]/.test(ch)) {
			let j = i;
			while (j < line.length && /[0-9.]/.test(line[j])) j++;
			toks.push({ t: 'number', s: line.slice(i, j) });
			i = j;
			continue;
		}

		if (/[a-zA-Z_$]/.test(ch)) {
			let j = i;
			while (j < line.length && /[a-zA-Z0-9_$]/.test(line[j])) j++;
			const word = line.slice(i, j);
			const prevNonWs = [...toks].reverse().find((t) => t.t !== 'ws');
			const isMethod = prevNonWs?.s === '.';
			const isCall = line[j] === '(';
			if (KEYWORDS.has(word)) toks.push({ t: 'kw', s: word });
			else if (isCall || isMethod) toks.push({ t: 'fn', s: word });
			else toks.push({ t: 'ident', s: word });
			i = j;
			continue;
		}

		toks.push({ t: 'punct', s: ch });
		i++;
	}

	return toks;
}
