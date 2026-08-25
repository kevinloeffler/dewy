import { describe, expect, it } from 'vitest';
import { countStatements, measureMemory } from './measure';
import { parseScript } from './parser';

/** Statements in `source`, parsed with the full language. */
function count(source: string): number {
    return countStatements(parseScript(source));
}

describe('countStatements', () => {

    it('counts a flat sequence one per statement', () => {
        expect(count('moveForward();\npick();\ndrop();')).toBe(3);
    });

    it('ignores blank lines and comments', () => {
        expect(count('\n// go\nmoveForward();\n\n// then\nturnLeft();\n')).toBe(2);
    });

    it('counts a loop as itself plus its body', () => {
        expect(count('repeat(4) { moveForward(); }')).toBe(2);
        expect(count('while (!isGoal()) { moveForward(); turnLeft(); }')).toBe(3);
    });

    it('makes abstraction pay off', () => {
        const flat = count('moveForward();\nmoveForward();\nmoveForward();\nmoveForward();');
        const looped = count('repeat(4) { moveForward(); }');
        expect(looped).toBeLessThan(flat);
    });

    it('counts both branches of an if/else, but not `else` itself', () => {
        expect(count('if (isBlocked()) { turnLeft(); }')).toBe(2);
        expect(count('if (isBlocked()) { turnLeft(); } else { moveForward(); }')).toBe(3);
    });

    it('counts a function declaration plus its body', () => {
        expect(count('function go() { moveForward(); }\ngo();')).toBe(3);
    });

    it('counts nesting all the way down', () => {
        expect(count(`
            repeat(3) {
                if (isBlocked()) {
                    turnLeft();
                } else {
                    moveForward();
                }
            }
        `)).toBe(4);   // repeat + if + turnLeft + moveForward
    });

    it('counts let and assignment', () => {
        expect(count('let n = 1;\nn = n + 1;')).toBe(2);
    });

    it('counts an empty program as zero', () => {
        expect(count('')).toBe(0);
        expect(count('// nothing yet\n')).toBe(0);
    });
});

describe('measureMemory', () => {

    it('measures a valid program', () => {
        expect(measureMemory('repeat(4) { moveForward(); }')).toBe(2);
    });

    it('returns null while the source does not parse', () => {
        expect(measureMemory('moveForward(')).toBe(null);
    });

    it('returns null for a construct the level stage has not introduced', () => {
        expect(measureMemory('repeat(4) { moveForward(); }', 1)).toBe(null);
        expect(measureMemory('repeat(4) { moveForward(); }', 2)).toBe(2);
    });
});
