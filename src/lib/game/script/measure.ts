/**
 * How much of the robot's memory a program occupies.
 *
 * Memory is counted in *statements*, not editor lines, so blank lines,
 * comments and formatting are free — a student is never taxed for writing
 * something readable. A block statement costs one for itself plus whatever
 * it contains, which is what makes `repeat` and functions worth reaching
 * for: three moves inside a `repeat` cost 2, not 3.
 */

import type { Block, Program, Stmt } from './ast';
import { ScriptError } from './errors';
import { parseScript } from './parser';
import type { LanguageStage } from '$lib/game/level';

export function countStatements(program: Program): number {
    return countAll(program.body);
}

/**
 * Statements in `source`, or `null` when it does not parse — a half-typed
 * program has no meaningful size, and the parse error is reported elsewhere.
 */
export function measureMemory(source: string, stage?: LanguageStage): number | null {
    try {
        return countStatements(parseScript(source, { stage }));
    } catch (error) {
        if (error instanceof ScriptError) return null;
        throw error;
    }
}

function countAll(statements: Stmt[]): number {
    let total = 0;
    for (const statement of statements) total += count(statement);
    return total;
}

function countBlock(block: Block): number {
    return countAll(block.statements);
}

/** One for the statement itself, plus its body. `else` is not its own statement. */
function count(statement: Stmt): number {
    switch (statement.kind) {
        case 'expression':
        case 'let':
        case 'assign':
        case 'return':
            return 1;
        case 'if':
            return 1
                + countBlock(statement.consequent)
                + (statement.alternate ? countBlock(statement.alternate) : 0);
        case 'while':
            return 1 + countBlock(statement.body);
        case 'repeat':
            return 1 + countBlock(statement.body);
        case 'function':
            return 1 + countBlock(statement.body);
    }
}
