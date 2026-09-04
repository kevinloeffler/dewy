import { ScriptError } from './errors';

/**
 * Tokenizer for the student language.
 *
 * The language is a subset of JavaScript plus one construct that is not
 * JavaScript at all — `repeat(n) { … }` — which is why the game parses
 * source itself instead of handing it to `new Function`. See `robot.md`
 * for the stage-by-stage feature table this implements.
 *
 * `src/lib/utils/tokenize.ts` is a different thing entirely: it colours a
 * line for the read-only `CodeEditor` preview and never has to be correct.
 */

export type TokenKind = 'number' | 'string' | 'name' | 'keyword' | 'punct' | 'eof';

export type Token = {
    kind: TokenKind;
    /** Source text of the token; for strings, the decoded value. */
    value: string;
    line: number;
    column: number;
};

export const KEYWORDS = new Set([
    'if',
    'else',
    'while',
    'repeat',
    'function',
    'return',
    'let',
    'true',
    'false',
    'null',
]);

/**
 * Longest first — `===` must be tried before `==`, which must be tried
 * before `=`, or `a === b` lexes as `a == = b`.
 */
const PUNCTUATION = [
    '===',
    '!==',
    '==',
    '!=',
    '<=',
    '>=',
    '&&',
    '||',
    '(',
    ')',
    '{',
    '}',
    ',',
    ';',
    '=',
    '+',
    '-',
    '*',
    '/',
    '%',
    '<',
    '>',
    '!',
    '.',
];

const ESCAPES: Record<string, string> = {
    n: '\n',
    t: '\t',
    r: '\r',
    '\\': '\\',
    "'": "'",
    '"': '"',
    '`': '`',
};

export function tokenize(source: string): Token[] {
    const tokens: Token[] = [];
    let index = 0;
    let line = 1;
    let lineStart = 0;

    const column = () => index - lineStart + 1;

    const advance = (count = 1) => {
        for (let i = 0; i < count; i++) {
            if (source[index] === '\n') {
                line++;
                lineStart = index + 1;
            }
            index++;
        }
    };

    while (index < source.length) {
        const char = source[index];

        // Whitespace, including the newlines that move `line` along.
        if (char === ' ' || char === '\t' || char === '\r' || char === '\n') {
            advance();
            continue;
        }

        // Line comment.
        if (char === '/' && source[index + 1] === '/') {
            while (index < source.length && source[index] !== '\n') advance();
            continue;
        }

        // Block comment.
        if (char === '/' && source[index + 1] === '*') {
            const startLine = line;
            const startColumn = column();
            advance(2);
            while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) {
                advance();
            }
            if (index >= source.length) {
                throw new ScriptError('Dieser Kommentar wird nie geschlossen — setz ein */.', startLine, startColumn);
            }
            advance(2);
            continue;
        }

        const startLine = line;
        const startColumn = column();

        // Number. Only decimals — the language has no hex or exponent form.
        if (isDigit(char)) {
            let text = '';
            while (index < source.length && (isDigit(source[index]) || source[index] === '.')) {
                text += source[index];
                advance();
            }
            if (!/^\d+(\.\d+)?$/.test(text)) {
                throw new ScriptError(`„${text}“ ist keine Zahl.`, startLine, startColumn);
            }
            tokens.push({ kind: 'number', value: text, line: startLine, column: startColumn });
            continue;
        }

        // String.
        if (char === '"' || char === "'" || char === '`') {
            const quote = char;
            advance();
            let value = '';
            while (index < source.length && source[index] !== quote) {
                if (source[index] === '\n') break;
                if (source[index] === '\\') {
                    const escaped = source[index + 1];
                    value += ESCAPES[escaped] ?? escaped ?? '';
                    advance(2);
                    continue;
                }
                value += source[index];
                advance();
            }
            if (source[index] !== quote) {
                throw new ScriptError(
                    `Diesem Text fehlt das schliessende ${quote}.`,
                    startLine,
                    startColumn,
                );
            }
            advance();
            tokens.push({ kind: 'string', value, line: startLine, column: startColumn });
            continue;
        }

        // Name or keyword.
        if (isNameStart(char)) {
            let text = '';
            while (index < source.length && isNamePart(source[index])) {
                text += source[index];
                advance();
            }
            tokens.push({
                kind: KEYWORDS.has(text) ? 'keyword' : 'name',
                value: text,
                line: startLine,
                column: startColumn,
            });
            continue;
        }

        // Punctuation.
        const punct = PUNCTUATION.find((candidate) => source.startsWith(candidate, index));
        if (punct) {
            advance(punct.length);
            tokens.push({ kind: 'punct', value: punct, line: startLine, column: startColumn });
            continue;
        }

        throw new ScriptError(`Mit „${char}“ kann ich hier nichts anfangen.`, startLine, startColumn);
    }

    tokens.push({ kind: 'eof', value: '', line, column: column() });
    return tokens;
}

function isDigit(char: string): boolean {
    return char >= '0' && char <= '9';
}

function isNameStart(char: string): boolean {
    return /[A-Za-z_$]/.test(char);
}

function isNamePart(char: string): boolean {
    return /[A-Za-z0-9_$]/.test(char);
}
