import { ScriptError } from './errors';
import { parseScript } from './parser';
import type { Block, Expr, Program, Stmt } from './ast';
import type { LanguageStage } from '../level';
import type { CrashReason } from '../crash-reasons';
import { LevelComplete, RobotCrash, type RobotApi } from '../robot-api';
import { RunCancelled } from '../events';

/**
 * Runs a parsed student program against the robot API.
 *
 * A tree walker rather than a compile-to-`Function` step, because three
 * things all fall out of walking the tree and none of them do otherwise:
 * the executing line is known before every statement, a `while (true) {}`
 * with no action in it can still be stopped, and a runaway loop can be cut
 * off with a sentence instead of a frozen tab.
 *
 * Actions are awaited, so the interpreter advances exactly in step with the
 * animation on screen. Sensing is synchronous in the API but awaited here
 * too — awaiting a plain value costs one microtask and keeps this uniform.
 */

export type ScriptValue = number | string | boolean | null | ScriptFunction;

type ScriptFunction = {
    kind: 'function';
    name: string;
    parameters: string[];
    body: Block;
    closure: Scope;
};

export type RunResult =
    /** Ran to the end without solving the level. */
    | { status: 'finished' }
    | { status: 'complete' }
    | { status: 'crash'; reason: CrashReason; line: number }
    | { status: 'error'; message: string; line: number }
    | { status: 'cancelled' };

export type RunOptions = {
    api: RobotApi;
    /** Gates language features at parse time. Defaults to the full language. */
    stage?: LanguageStage;
    /** Called with the line about to run, and `null` once the run is over. */
    onLine?: (line: number | null) => void;
    /**
     * Awaited before every statement. Returning a promise parks the run
     * there, which is all a Step button is: resolve one promise per press.
     */
    onStatement?: () => void | Promise<void>;
    /** Aborting unwinds the interpreter, even out of a loop that calls nothing. */
    signal?: AbortSignal;
    maxLoopIterations?: number;
    maxCallDepth?: number;
};

/** A loop with no action in it spends no energy, so it needs its own stop. */
const DEFAULT_MAX_LOOP_ITERATIONS = 10_000;

/** Deep enough for any level, shallow enough to beat the JS stack. */
const DEFAULT_MAX_CALL_DEPTH = 64;

/** Statements between yields back to the browser, so Stop stays clickable. */
const YIELD_INTERVAL = 200;

export async function runScript(source: string, options: RunOptions): Promise<RunResult> {
    let program: Program;
    try {
        program = parseScript(source, { stage: options.stage });
    } catch (error) {
        if (error instanceof ScriptError) {
            return { status: 'error', message: error.message, line: error.line };
        }
        throw error;
    }

    const interpreter = new Interpreter(options);
    try {
        return await interpreter.run(program);
    } finally {
        options.onLine?.(null);
    }
}

/** Thrown by `return`; carries the value back to the calling frame. */
class ReturnSignal {
    constructor(readonly value: ScriptValue) {}
}

class Scope {
    private readonly values = new Map<string, ScriptValue>();

    constructor(private readonly parent: Scope | null = null) {}

    declare(name: string, value: ScriptValue): void {
        this.values.set(name, value);
    }

    has(name: string): boolean {
        return this.values.has(name) || (this.parent?.has(name) ?? false);
    }

    get(name: string): ScriptValue | undefined {
        if (this.values.has(name)) return this.values.get(name);
        return this.parent?.get(name);
    }

    /** Assigns in the scope that declared the name. Returns false if none did. */
    assign(name: string, value: ScriptValue): boolean {
        if (this.values.has(name)) {
            this.values.set(name, value);
            return true;
        }
        return this.parent?.assign(name, value) ?? false;
    }
}

class Interpreter {
    private readonly api: RobotApi;
    private readonly onLine: ((line: number | null) => void) | undefined;
    private readonly onStatement: (() => void | Promise<void>) | undefined;
    private readonly signal: AbortSignal | undefined;
    private readonly maxLoopIterations: number;
    private readonly maxCallDepth: number;

    /** The line last reported, so a crash can be blamed on the right one. */
    private currentLine = 1;
    private depth = 0;
    private sinceYield = 0;

    constructor(options: RunOptions) {
        this.api = options.api;
        this.onLine = options.onLine;
        this.onStatement = options.onStatement;
        this.signal = options.signal;
        this.maxLoopIterations = options.maxLoopIterations ?? DEFAULT_MAX_LOOP_ITERATIONS;
        this.maxCallDepth = options.maxCallDepth ?? DEFAULT_MAX_CALL_DEPTH;
    }

    async run(program: Program): Promise<RunResult> {
        const global = new Scope();

        try {
            await this.executeStatements(program.body, global);
            return { status: 'finished' };
        } catch (error) {
            // A top-level `return` just ends the program early.
            if (error instanceof ReturnSignal) return { status: 'finished' };
            if (error instanceof LevelComplete) return { status: 'complete' };
            if (error instanceof RunCancelled) return { status: 'cancelled' };
            if (error instanceof RobotCrash) {
                return { status: 'crash', reason: error.reason, line: this.currentLine };
            }
            if (error instanceof ScriptError) {
                return { status: 'error', message: error.message, line: error.line };
            }
            throw error;
        }
    }

    // ========================================================
    // Statements
    // ========================================================

    private async executeStatements(statements: Stmt[], scope: Scope): Promise<void> {
        // Hoist declarations so a helper may be defined below its first call,
        // which is how students naturally write "the main bit, then the parts".
        for (const statement of statements) {
            if (statement.kind !== 'function') continue;
            guardName(statement.name, statement.line);
            scope.declare(statement.name, {
                kind: 'function',
                name: statement.name,
                parameters: statement.parameters,
                body: statement.body,
                closure: scope,
            });
        }

        for (const statement of statements) {
            await this.execute(statement, scope);
        }
    }

    private async executeBlock(block: Block, parent: Scope): Promise<void> {
        await this.executeStatements(block.statements, new Scope(parent));
    }

    private async execute(statement: Stmt, scope: Scope): Promise<void> {
        await this.beforeStatement(statement.line);

        switch (statement.kind) {
            case 'expression':
                await this.evaluate(statement.expression, scope);
                return;

            case 'let':
                guardName(statement.name, statement.line);
                scope.declare(statement.name, await this.evaluate(statement.value, scope));
                return;

            case 'assign': {
                const value = await this.evaluate(statement.value, scope);
                if (!scope.assign(statement.name, value)) {
                    throw new ScriptError(
                        `\`${statement.name}\` hasn't been created yet — try \`let ${statement.name} = …;\` first.`,
                        statement.line,
                    );
                }
                return;
            }

            case 'if': {
                if (truthy(await this.evaluate(statement.test, scope))) {
                    await this.executeBlock(statement.consequent, scope);
                } else if (statement.alternate) {
                    await this.executeBlock(statement.alternate, scope);
                }
                return;
            }

            case 'while': {
                let iterations = 0;
                while (truthy(await this.evaluate(statement.test, scope))) {
                    this.countIteration(++iterations, statement.line, 'while');
                    await this.executeBlock(statement.body, scope);
                    await this.beforeStatement(statement.line);
                }
                return;
            }

            case 'repeat': {
                const count = await this.evaluate(statement.count, scope);
                if (typeof count !== 'number' || !Number.isFinite(count)) {
                    throw new ScriptError(
                        '`repeat` needs a number, like `repeat(3) { … }`.',
                        statement.line,
                    );
                }
                if (count < 0) {
                    throw new ScriptError('`repeat` cannot count backwards.', statement.line);
                }

                const times = Math.floor(count);
                for (let i = 0; i < times; i++) {
                    this.countIteration(i + 1, statement.line, 'repeat');
                    await this.executeBlock(statement.body, scope);
                    await this.beforeStatement(statement.line);
                }
                return;
            }

            case 'function':
                // Already hoisted by `executeStatements`.
                return;

            case 'return':
                throw new ReturnSignal(
                    statement.value ? await this.evaluate(statement.value, scope) : null,
                );
        }
    }

    // ========================================================
    // Expressions
    // ========================================================

    private async evaluate(expression: Expr, scope: Scope): Promise<ScriptValue> {
        switch (expression.kind) {
            case 'number':
            case 'string':
            case 'boolean':
                return expression.value;

            case 'null':
                return null;

            case 'name': {
                if (!scope.has(expression.name)) {
                    throw new ScriptError(
                        `I don't know what \`${expression.name}\` is.`,
                        expression.line,
                    );
                }
                return scope.get(expression.name) ?? null;
            }

            case 'unary': {
                const operand = await this.evaluate(expression.operand, scope);
                if (expression.operator === '!') return !truthy(operand);
                if (typeof operand !== 'number') {
                    throw new ScriptError('Only numbers can be negative.', expression.line);
                }
                return -operand;
            }

            case 'logical': {
                const left = await this.evaluate(expression.left, scope);
                if (expression.operator === '&&' && !truthy(left)) return left;
                if (expression.operator === '||' && truthy(left)) return left;
                return this.evaluate(expression.right, scope);
            }

            case 'binary': {
                const left = await this.evaluate(expression.left, scope);
                const right = await this.evaluate(expression.right, scope);
                return this.applyBinary(expression.operator, left, right, expression.line);
            }

            case 'call':
                return this.call(expression, scope);
        }
    }

    private applyBinary(
        operator: string,
        left: ScriptValue,
        right: ScriptValue,
        line: number,
    ): ScriptValue {
        if (operator === '===') return left === right;
        if (operator === '!==') return left !== right;

        // `+` doubles as string join, which is how a message gets built.
        if (operator === '+' && (typeof left === 'string' || typeof right === 'string')) {
            return `${describe(left)}${describe(right)}`;
        }

        if (typeof left !== 'number' || typeof right !== 'number') {
            throw new ScriptError(
                `\`${operator}\` only works on numbers, and this is ${describe(
                    typeof left !== 'number' ? left : right,
                )}.`,
                line,
            );
        }

        switch (operator) {
            case '+': return left + right;
            case '-': return left - right;
            case '*': return left * right;
            case '/':
                if (right === 0) throw new ScriptError('Dividing by zero is not allowed.', line);
                return left / right;
            case '%':
                if (right === 0) throw new ScriptError('Dividing by zero is not allowed.', line);
                return left % right;
            case '<': return left < right;
            case '>': return left > right;
            case '<=': return left <= right;
            case '>=': return left >= right;
        }

        throw new ScriptError(`I don't know the \`${operator}\` operator.`, line);
    }

    private async call(expression: Expr & { kind: 'call' }, scope: Scope): Promise<ScriptValue> {
        const args: ScriptValue[] = [];
        for (const argument of expression.args) {
            args.push(await this.evaluate(argument, scope));
        }

        // The robot API wins over anything a student declared, so a level can
        // never be solved by shadowing `moveForward`.
        const native = NATIVES[expression.callee as keyof RobotApi] as
            | ((api: RobotApi) => unknown | Promise<unknown>)
            | undefined;
        if (native) {
            if (args.length > 0) {
                throw new ScriptError(
                    `\`${expression.callee}()\` doesn't take anything between its brackets.`,
                    expression.line,
                );
            }
            // Report the call site before the action animates, so the editor
            // marker sits on the line the robot is currently acting out.
            this.currentLine = expression.line;
            this.onLine?.(expression.line);
            return (((await native(this.api)) ?? null) as ScriptValue);
        }

        const target = scope.get(expression.callee);
        if (!target || typeof target !== 'object' || target.kind !== 'function') {
            throw new ScriptError(
                scope.has(expression.callee)
                    ? `\`${expression.callee}\` is not something you can call.`
                    : `I don't know a command called \`${expression.callee}\`.`,
                expression.line,
            );
        }

        if (target.parameters.length !== args.length) {
            throw new ScriptError(
                `\`${target.name}\` expects ${count(target.parameters.length, 'value')}, but got ${args.length}.`,
                expression.line,
            );
        }

        if (++this.depth > this.maxCallDepth) {
            this.depth--;
            throw new ScriptError(
                `\`${target.name}\` keeps calling itself and never stops.`,
                expression.line,
            );
        }

        const frame = new Scope(target.closure);
        target.parameters.forEach((parameter, index) => frame.declare(parameter, args[index]));

        try {
            await this.executeStatements(target.body.statements, frame);
            return null;
        } catch (error) {
            if (error instanceof ReturnSignal) return error.value;
            throw error;
        } finally {
            this.depth--;
        }
    }

    // ========================================================
    // Pacing and limits
    // ========================================================

    /**
     * Runs before every statement: reports the line, honours Stop, and hands
     * the browser a turn now and then so a loop that calls no action — and
     * therefore never awaits an animation — cannot lock up the tab.
     */
    private async beforeStatement(line: number): Promise<void> {
        if (this.signal?.aborted) throw new RunCancelled();

        this.currentLine = line;
        this.onLine?.(line);

        // Parks here for as long as the caller wants — a Step button holds
        // the run one statement at a time, Run never holds it at all.
        await this.onStatement?.();
        if (this.signal?.aborted) throw new RunCancelled();

        if (++this.sinceYield >= YIELD_INTERVAL) {
            this.sinceYield = 0;
            await new Promise((resolve) => setTimeout(resolve, 0));
            if (this.signal?.aborted) throw new RunCancelled();
        }
    }

    private countIteration(iterations: number, line: number, construct: string): void {
        if (iterations <= this.maxLoopIterations) return;
        throw new ScriptError(
            `This \`${construct}\` loop has run ${this.maxLoopIterations} times — it looks like it never ends.`,
            line,
        );
    }
}

/**
 * The robot API as bare globals. Typed so that a name added to `RobotApi`
 * without being exposed here is a compile error rather than a mystery
 * "I don't know a command called …" at runtime.
 */
const NATIVES: Record<keyof RobotApi, (api: RobotApi) => unknown | Promise<unknown>> = {
    moveForward: (api) => api.moveForward(),
    turnLeft: (api) => api.turnLeft(),
    turnRight: (api) => api.turnRight(),
    pick: (api) => api.pick(),
    drop: (api) => api.drop(),
    open: (api) => api.open(),
    toggle: (api) => api.toggle(),

    isBlocked: (api) => api.isBlocked(),
    isCrate: (api) => api.isCrate(),
    isCarrying: (api) => api.isCarrying(),
    isGoal: (api) => api.isGoal(),
    isDropOff: (api) => api.isDropOff(),
    crateColor: (api) => api.crateColor(),
    isDangerous: (api) => api.isDangerous(),
};

/**
 * Robot commands always win over anything a student declares, so redefining
 * one would silently do nothing. Saying so is far kinder than letting the
 * level become unsolvable for a reason nothing on screen explains.
 */
function guardName(name: string, line: number): void {
    if (!(name in NATIVES)) return;
    throw new ScriptError(`\`${name}\` is a robot command — pick a different name.`, line);
}

function truthy(value: ScriptValue): boolean {
    return Boolean(value);
}

function describe(value: ScriptValue): string {
    if (value === null) return 'nothing';
    if (typeof value === 'object') return 'a function';
    return String(value);
}

function count(amount: number, noun: string): string {
    return `${amount} ${noun}${amount === 1 ? '' : 's'}`;
}
