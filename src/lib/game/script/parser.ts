import { ScriptError } from './errors';
import { tokenize, type Token } from './lexer';
import type { BinaryOperator, Block, Expr, Program, Stmt } from './ast';
import type { LanguageStage } from '../level';
import type { RobotSensors } from '../robot-api';

/**
 * Recursive-descent parser for the student language.
 *
 * Two things it does that a JavaScript parser could not:
 *
 *  - `repeat(n) { … }`, which is not JavaScript syntax at all;
 *  - language-stage gating, so a level authored for stage 2 rejects `while`
 *    at parse time with a sentence a 13-year-old can act on, rather than
 *    letting it run and confusing everyone. The stage table is `robot.md`.
 *
 * Every error is a `ScriptError` carrying the line it happened on.
 */

/** Which stage each construct becomes legal at. Mirrors the table in `robot.md`. */
const FEATURE_STAGE = {
    repeat: 2,
    conditional: 3,
    loop: 4,
    variable: 4,
    function: 5,
} as const satisfies Record<string, LanguageStage>;

const FEATURE_NAME: Record<keyof typeof FEATURE_STAGE, string> = {
    repeat: '`repeat` loops',
    conditional: '`if` / `else`',
    loop: '`while` loops',
    variable: 'variables',
    function: 'your own functions',
};

/**
 * Sensing is introduced at stage 3. Typed against `RobotSensors` so adding a
 * sensor to the API without deciding when students may call it fails to
 * compile rather than silently becoming available at stage 1.
 */
const SENSING: Record<keyof RobotSensors, true> = {
    isBlocked: true,
    isCrate: true,
    isCarrying: true,
    isGoal: true,
    isDropOff: true,
    crateColor: true,
    isDangerous: true,
};

export type ParseOptions = {
    /** Constructs above this stage are rejected. Defaults to the full language. */
    stage?: LanguageStage;
};

export function parseScript(source: string, options: ParseOptions = {}): Program {
    return new Parser(tokenize(source), options.stage ?? 5).parseProgram();
}

class Parser {
    private index = 0;

    constructor(
        private readonly tokens: Token[],
        private readonly stage: LanguageStage,
    ) {}

    // ========================================================
    // Program and statements
    // ========================================================

    parseProgram(): Program {
        const body: Stmt[] = [];
        while (!this.atEnd()) body.push(this.parseStatement());
        return { body };
    }

    private parseStatement(): Stmt {
        const token = this.peek();

        if (token.kind === 'keyword') {
            switch (token.value) {
                case 'if':
                    return this.parseIf();
                case 'while':
                    return this.parseWhile();
                case 'repeat':
                    return this.parseRepeat();
                case 'function':
                    return this.parseFunction();
                case 'return':
                    return this.parseReturn();
                case 'let':
                    return this.parseLet();
                case 'else':
                    throw new ScriptError(
                        'This `else` has no `if` in front of it.',
                        token.line,
                        token.column,
                    );
            }
        }

        // A bare block would only ever be a mistake in this language, and
        // reads much more like a missing `if` or `repeat` header.
        if (this.check('punct', '{')) {
            throw new ScriptError(
                'A `{` needs something in front of it, like `repeat(3)` or `if (…)`.',
                token.line,
                token.column,
            );
        }

        // Assignment: `name = expression;`
        if (token.kind === 'name' && this.checkAt(1, 'punct', '=')) {
            this.require('variable', token);
            const name = this.next().value;
            this.next(); // '='
            const value = this.parseExpression();
            this.endStatement();
            return { kind: 'assign', name, value, line: token.line };
        }

        const expression = this.parseExpression();
        this.endStatement();

        // `moveForward;` without parentheses is the classic first mistake.
        if (expression.kind === 'name') {
            throw new ScriptError(
                `\`${expression.name}\` on its own does nothing — did you mean \`${expression.name}()\`?`,
                expression.line,
            );
        }

        return { kind: 'expression', expression, line: expression.line };
    }

    private parseIf(): Stmt {
        const token = this.next();
        this.require('conditional', token);
        const test = this.parseParenthesized('if');
        const consequent = this.parseBlock();

        let alternate: Block | null = null;
        if (this.check('keyword', 'else')) {
            this.next();
            // `else if` chains as a block holding a single `if`, so the
            // interpreter needs no separate case for it.
            if (this.check('keyword', 'if')) {
                const nested = this.parseIf();
                alternate = { statements: [nested], line: nested.line };
            } else {
                alternate = this.parseBlock();
            }
        }

        return { kind: 'if', test, consequent, alternate, line: token.line };
    }

    private parseWhile(): Stmt {
        const token = this.next();
        this.require('loop', token);
        const test = this.parseParenthesized('while');
        const body = this.parseBlock();
        return { kind: 'while', test, body, line: token.line };
    }

    private parseRepeat(): Stmt {
        const token = this.next();
        this.require('repeat', token);
        const count = this.parseParenthesized('repeat');
        const body = this.parseBlock();
        return { kind: 'repeat', count, body, line: token.line };
    }

    private parseFunction(): Stmt {
        const token = this.next();
        this.require('function', token);

        const name = this.expect('name', undefined, 'A function needs a name, like `function deliver() { … }`.');
        this.expect('punct', '(', `\`function ${name.value}\` needs a \`(\` after its name.`);

        const parameters: string[] = [];
        while (!this.check('punct', ')')) {
            parameters.push(this.expect('name', undefined, 'Expected a parameter name here.').value);
            if (!this.check('punct', ')')) {
                this.expect('punct', ',', 'Separate parameters with a comma.');
            }
        }
        this.next(); // ')'

        const body = this.parseBlock();
        return { kind: 'function', name: name.value, parameters, body, line: token.line };
    }

    private parseReturn(): Stmt {
        const token = this.next();
        this.require('function', token);

        if (this.check('punct', ';') || this.check('punct', '}')) {
            this.endStatement();
            return { kind: 'return', value: null, line: token.line };
        }

        const value = this.parseExpression();
        this.endStatement();
        return { kind: 'return', value, line: token.line };
    }

    private parseLet(): Stmt {
        const token = this.next();
        this.require('variable', token);

        const name = this.expect('name', undefined, '`let` needs a name, like `let count = 0;`.');
        this.expect('punct', '=', `\`let ${name.value}\` needs a value, like \`let ${name.value} = 0;\`.`);
        const value = this.parseExpression();
        this.endStatement();
        return { kind: 'let', name: name.value, value, line: token.line };
    }

    private parseBlock(): Block {
        const open = this.expect('punct', '{', 'Expected a `{` to open this block.');
        const statements: Stmt[] = [];

        while (!this.check('punct', '}')) {
            if (this.atEnd()) {
                throw new ScriptError(
                    'This block is never closed — add a `}`.',
                    open.line,
                    open.column,
                );
            }
            statements.push(this.parseStatement());
        }

        this.next(); // '}'
        return { statements, line: open.line };
    }

    private parseParenthesized(construct: string): Expr {
        this.expect('punct', '(', `\`${construct}\` needs a \`(\` after it.`);
        const expression = this.parseExpression();
        this.expect('punct', ')', `This \`${construct}\` is missing its closing \`)\`.`);
        return expression;
    }

    /** A trailing `;` is optional, but anything else means two runaway statements. */
    private endStatement(): void {
        if (this.check('punct', ';')) this.next();
    }

    // ========================================================
    // Expressions — precedence climbing, loosest binding first
    // ========================================================

    private parseExpression(): Expr {
        return this.parseOr();
    }

    private parseOr(): Expr {
        let left = this.parseAnd();
        while (this.check('punct', '||')) {
            const token = this.next();
            const right = this.parseAnd();
            left = { kind: 'logical', operator: '||', left, right, line: token.line };
        }
        return left;
    }

    private parseAnd(): Expr {
        let left = this.parseEquality();
        while (this.check('punct', '&&')) {
            const token = this.next();
            const right = this.parseEquality();
            left = { kind: 'logical', operator: '&&', left, right, line: token.line };
        }
        return left;
    }

    private parseEquality(): Expr {
        let left = this.parseComparison();
        while (this.check('punct', '===') || this.check('punct', '!==') || this.check('punct', '==') || this.check('punct', '!=')) {
            const token = this.next();
            if (token.value === '==' || token.value === '!=') {
                throw new ScriptError(
                    `Use \`${token.value}=\` instead of \`${token.value}\` to compare values.`,
                    token.line,
                    token.column,
                );
            }
            const right = this.parseComparison();
            left = {
                kind: 'binary',
                operator: token.value as BinaryOperator,
                left,
                right,
                line: token.line,
            };
        }
        return left;
    }

    private parseComparison(): Expr {
        let left = this.parseSum();
        while (this.check('punct', '<') || this.check('punct', '>') || this.check('punct', '<=') || this.check('punct', '>=')) {
            const token = this.next();
            const right = this.parseSum();
            left = {
                kind: 'binary',
                operator: token.value as BinaryOperator,
                left,
                right,
                line: token.line,
            };
        }
        return left;
    }

    private parseSum(): Expr {
        let left = this.parseProduct();
        while (this.check('punct', '+') || this.check('punct', '-')) {
            const token = this.next();
            const right = this.parseProduct();
            left = {
                kind: 'binary',
                operator: token.value as BinaryOperator,
                left,
                right,
                line: token.line,
            };
        }
        return left;
    }

    private parseProduct(): Expr {
        let left = this.parseUnary();
        while (this.check('punct', '*') || this.check('punct', '/') || this.check('punct', '%')) {
            const token = this.next();
            const right = this.parseUnary();
            left = {
                kind: 'binary',
                operator: token.value as BinaryOperator,
                left,
                right,
                line: token.line,
            };
        }
        return left;
    }

    private parseUnary(): Expr {
        if (this.check('punct', '!') || this.check('punct', '-')) {
            const token = this.next();
            const operand = this.parseUnary();
            return {
                kind: 'unary',
                operator: token.value as '!' | '-',
                operand,
                line: token.line,
            };
        }
        return this.parsePrimary();
    }

    private parsePrimary(): Expr {
        const token = this.next();

        if (token.kind === 'number') {
            return { kind: 'number', value: Number(token.value), line: token.line };
        }

        if (token.kind === 'string') {
            return { kind: 'string', value: token.value, line: token.line };
        }

        if (token.kind === 'keyword') {
            if (token.value === 'true') return { kind: 'boolean', value: true, line: token.line };
            if (token.value === 'false') return { kind: 'boolean', value: false, line: token.line };
            if (token.value === 'null') return { kind: 'null', line: token.line };
            throw new ScriptError(
                `\`${token.value}\` cannot be used as a value here.`,
                token.line,
                token.column,
            );
        }

        if (token.kind === 'punct' && token.value === '(') {
            const inner = this.parseExpression();
            this.expect('punct', ')', 'This `(` is missing its closing `)`.');
            return inner;
        }

        if (token.kind === 'name') {
            // The API is bare globals, so a dot can only ever be the habit of
            // writing `robot.moveForward()` — worth saying so outright.
            if (this.check('punct', '.')) {
                throw new ScriptError(
                    `Commands are used on their own — write \`moveForward()\`, not \`${token.value}.…\`.`,
                    token.line,
                    token.column,
                );
            }

            if (this.check('punct', '(')) {
                this.next();
                const args: Expr[] = [];
                while (!this.check('punct', ')')) {
                    if (this.atEnd()) {
                        throw new ScriptError(
                            `\`${token.value}(\` is missing its closing \`)\`.`,
                            token.line,
                            token.column,
                        );
                    }
                    args.push(this.parseExpression());
                    if (!this.check('punct', ')')) {
                        this.expect('punct', ',', 'Separate arguments with a comma.');
                    }
                }
                this.next(); // ')'

                if (SENSING[token.value as keyof RobotSensors] && this.stage < FEATURE_STAGE.conditional) {
                    throw new ScriptError(
                        `\`${token.value}()\` isn't unlocked in this level yet.`,
                        token.line,
                        token.column,
                    );
                }

                return { kind: 'call', callee: token.value, args, line: token.line };
            }

            return { kind: 'name', name: token.value, line: token.line };
        }

        throw new ScriptError(
            token.kind === 'eof'
                ? 'The program ends in the middle of something.'
                : `\`${token.value}\` doesn't belong here.`,
            token.line,
            token.column,
        );
    }

    // ========================================================
    // Token helpers
    // ========================================================

    private require(feature: keyof typeof FEATURE_STAGE, token: Token): void {
        if (this.stage >= FEATURE_STAGE[feature]) return;
        throw new ScriptError(
            `${FEATURE_NAME[feature]} aren't unlocked in this level yet.`,
            token.line,
            token.column,
        );
    }

    private peek(): Token {
        return this.tokens[this.index];
    }

    private next(): Token {
        const token = this.tokens[this.index];
        if (token.kind !== 'eof') this.index++;
        return token;
    }

    private atEnd(): boolean {
        return this.peek().kind === 'eof';
    }

    private check(kind: Token['kind'], value?: string): boolean {
        return this.checkAt(0, kind, value);
    }

    private checkAt(offset: number, kind: Token['kind'], value?: string): boolean {
        const token = this.tokens[this.index + offset];
        if (!token || token.kind !== kind) return false;
        return value === undefined || token.value === value;
    }

    private expect(kind: Token['kind'], value: string | undefined, message: string): Token {
        if (!this.check(kind, value)) {
            const token = this.peek();
            throw new ScriptError(message, token.line, token.column);
        }
        return this.next();
    }
}
