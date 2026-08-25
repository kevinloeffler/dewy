import { describe, expect, it, vi } from 'vitest';
import { parseScript } from './parser';
import { runScript } from './interpreter';
import { ScriptError } from './errors';
import { GameEngine } from '../engine';
import { createRobotApi, type RobotApi } from '../robot-api';
import { nullPlayer } from '../events';
import { tutorial01 } from '../levels/tutorial-01';

/** A robot API that records what it was asked to do and senses nothing. */
function stubApi(overrides: Partial<RobotApi> = {}) {
    const calls: string[] = [];
    const action = (name: string) => async () => {
        calls.push(name);
    };
    const api: RobotApi = {
        moveForward: action('moveForward'),
        turnLeft: action('turnLeft'),
        turnRight: action('turnRight'),
        pick: action('pick'),
        drop: action('drop'),
        open: action('open'),
        toggle: action('toggle'),
        isBlocked: () => false,
        isCrate: () => false,
        isCarrying: () => false,
        isGoal: () => false,
        isDropOff: () => false,
        crateColor: () => null,
        isDangerous: () => false,
        ...overrides,
    };
    return { api, calls };
}

// ============================================================
// Parsing
// ============================================================

describe('parseScript', () => {
    it('parses a bare sequence of commands', () => {
        const program = parseScript('moveForward();\nturnLeft();');
        expect(program.body).toHaveLength(2);
        expect(program.body[0]).toMatchObject({ kind: 'expression', line: 1 });
        expect(program.body[1]).toMatchObject({ kind: 'expression', line: 2 });
    });

    it('makes the trailing semicolon optional', () => {
        expect(parseScript('moveForward()').body).toHaveLength(1);
    });

    it('ignores line and block comments', () => {
        const program = parseScript('// go\n/* twice\n over lines */\nmoveForward();');
        expect(program.body).toHaveLength(1);
        expect(program.body[0].line).toBe(4);
    });

    it('chains else if into a nested if', () => {
        const program = parseScript('if (isGoal()) { drop(); } else if (isCrate()) { pick(); } else { moveForward(); }');
        expect(program.body[0]).toMatchObject({ kind: 'if' });
        const outer = program.body[0] as Extract<(typeof program.body)[number], { kind: 'if' }>;
        expect(outer.alternate?.statements[0]).toMatchObject({ kind: 'if' });
    });

    it('reports an unclosed block on the line that opened it', () => {
        expect(() => parseScript('repeat(2) {\n  moveForward();')).toThrowError(
            expect.objectContaining({ line: 1, message: expect.stringContaining('never closed') }),
        );
    });

    it('suggests () for a command written without them', () => {
        expect(() => parseScript('moveForward;')).toThrowError(/moveForward\(\)/);
    });

    it('rejects a member call with a hint about bare commands', () => {
        expect(() => parseScript('robot.moveForward();')).toThrowError(/on their own/);
    });

    it('rejects == in favour of ===', () => {
        expect(() => parseScript('if (crateColor() == "red") { drop(); }')).toThrowError(/===/);
    });
});


// ============================================================
// Language stages
// ============================================================

describe('language stages', () => {
    it('allows plain sequencing at stage 1', () => {
        expect(() => parseScript('moveForward();', { stage: 1 })).not.toThrow();
    });

    it('rejects repeat below stage 2', () => {
        expect(() => parseScript('repeat(2) { moveForward(); }', { stage: 1 })).toThrowError(
            /repeat.*aren't unlocked/,
        );
        expect(() => parseScript('repeat(2) { moveForward(); }', { stage: 2 })).not.toThrow();
    });

    it('rejects if and sensing below stage 3', () => {
        expect(() => parseScript('if (true) { drop(); }', { stage: 2 })).toThrowError(/unlocked/);
        expect(() => parseScript('isBlocked();', { stage: 2 })).toThrowError(/isBlocked/);
        expect(() => parseScript('if (isBlocked()) { drop(); }', { stage: 3 })).not.toThrow();
    });

    it('rejects while below stage 4', () => {
        expect(() => parseScript('while (true) { moveForward(); }', { stage: 3 })).toThrowError(/while/);
        expect(() => parseScript('while (true) { moveForward(); }', { stage: 4 })).not.toThrow();
    });

    it('rejects functions below stage 5', () => {
        expect(() => parseScript('function go() { moveForward(); }', { stage: 4 })).toThrowError(/unlocked/);
        expect(() => parseScript('function go() { moveForward(); }', { stage: 5 })).not.toThrow();
    });

    it('reports a stage error as a ScriptError with a line', () => {
        try {
            parseScript('moveForward();\nwhile (true) { turnLeft(); }', { stage: 1 });
            expect.unreachable('should have thrown');
        } catch (error) {
            expect(error).toBeInstanceOf(ScriptError);
            expect((error as ScriptError).line).toBe(2);
        }
    });
});


// ============================================================
// Running
// ============================================================

describe('runScript', () => {
    it('runs commands in order', async () => {
        const { api, calls } = stubApi();
        const result = await runScript('moveForward();\nturnRight();\nmoveForward();', { api });
        expect(result).toEqual({ status: 'finished' });
        expect(calls).toEqual(['moveForward', 'turnRight', 'moveForward']);
    });

    it('reports the executing line before each command', async () => {
        const onLine = vi.fn();
        const { api } = stubApi();
        await runScript('moveForward();\n\nturnLeft();', { api, onLine });
        expect(onLine.mock.calls.map(([line]) => line)).toEqual([1, 1, 3, 3, null]);
    });

    it('repeats a block a fixed number of times', async () => {
        const { api, calls } = stubApi();
        await runScript('repeat(3) { moveForward(); }', { api });
        expect(calls).toEqual(['moveForward', 'moveForward', 'moveForward']);
    });

    it('branches on a sensor', async () => {
        const { api, calls } = stubApi({ isBlocked: () => true });
        await runScript('if (isBlocked()) { turnLeft(); } else { moveForward(); }', { api });
        expect(calls).toEqual(['turnLeft']);
    });

    it('loops until a sensor flips', async () => {
        let steps = 0;
        const { api, calls } = stubApi({
            isGoal: () => steps >= 3,
            moveForward: async () => {
                steps++;
                calls.push('moveForward');
            },
        });
        await runScript('while (!isGoal()) { moveForward(); }', { api });
        expect(calls).toEqual(['moveForward', 'moveForward', 'moveForward']);
    });

    it('calls a function declared after its first use', async () => {
        const { api, calls } = stubApi();
        await runScript('go();\nfunction go() { moveForward(); moveForward(); }', { api });
        expect(calls).toEqual(['moveForward', 'moveForward']);
    });

    it('passes arguments and returns values', async () => {
        const { api, calls } = stubApi();
        await runScript(
            'function twice(n) { return n * 2; }\nrepeat(twice(2)) { turnLeft(); }',
            { api },
        );
        expect(calls).toEqual(['turnLeft', 'turnLeft', 'turnLeft', 'turnLeft']);
    });

    it('keeps let variables and assignment working', async () => {
        const { api, calls } = stubApi();
        await runScript('let n = 1;\nn = n + 2;\nrepeat(n) { moveForward(); }', { api });
        expect(calls).toHaveLength(3);
    });

    it('surfaces an unknown command as a script error on its line', async () => {
        const { api } = stubApi();
        const result = await runScript('moveForward();\njump();', { api });
        expect(result).toMatchObject({ status: 'error', line: 2 });
        expect(result).toMatchObject({ message: expect.stringContaining('jump') });
    });

    it('refuses to let a student redefine a robot command', async () => {
        const { api } = stubApi();
        const result = await runScript('function moveForward() { turnLeft(); }', { api });
        expect(result).toMatchObject({ status: 'error', message: expect.stringContaining('robot command') });
    });

    it('stops a loop that never ends instead of hanging', async () => {
        const { api, calls } = stubApi();
        const result = await runScript('while (true) { let x = 1; }', { api, maxLoopIterations: 50 });
        expect(result).toMatchObject({ status: 'error', message: expect.stringContaining('never ends') });
        expect(calls).toEqual([]);
    });

    it('stops runaway recursion', async () => {
        const { api } = stubApi();
        const result = await runScript('function go() { go(); }\ngo();', { api, maxCallDepth: 8 });
        expect(result).toMatchObject({ status: 'error', message: expect.stringContaining('calling itself') });
    });

    it('unwinds a loop with no commands in it when aborted', async () => {
        const controller = new AbortController();
        const { api } = stubApi();
        setTimeout(() => controller.abort(), 5);
        const result = await runScript('while (true) { let x = 1; }', {
            api,
            signal: controller.signal,
            maxLoopIterations: Number.MAX_SAFE_INTEGER,
        });
        expect(result).toEqual({ status: 'cancelled' });
    });
});


// ============================================================
// Against the real engine
// ============================================================

describe('runScript against tutorial-01', () => {
    const solution = `
moveForward();
moveForward();
moveForward();
turnRight();
moveForward();
pick();
moveForward();
moveForward();
turnRight();
moveForward();
moveForward();
drop();
`;

    it('completes the level with the intended solution', async () => {
        const engine = new GameEngine(tutorial01, { energy: tutorial01.options.energy });
        const result = await runScript(solution, { api: createRobotApi(engine, nullPlayer) });

        expect(result).toEqual({ status: 'complete' });
        expect(engine.state.goals.every((goal) => goal.satisfied)).toBe(true);
        expect(engine.state.steps).toBe(12);
    });

    it('reports a crash on the line that caused it', async () => {
        const engine = new GameEngine(tutorial01);
        const result = await runScript('turnRight();\nmoveForward();\nturnLeft();\nmoveForward();\nmoveForward();', {
            api: createRobotApi(engine, nullPlayer),
        });

        expect(result).toMatchObject({ status: 'crash', line: 5 });
        expect(result).toMatchObject({ reason: { code: 'pit' } });
    });

    it('runs out of energy when a loop wanders forever', async () => {
        const engine = new GameEngine(tutorial01, { energy: 20 });
        const result = await runScript('while (true) { turnLeft(); }', {
            api: createRobotApi(engine, nullPlayer),
            stage: 4,
        });

        expect(result).toMatchObject({ status: 'crash' });
        expect(result).toMatchObject({ reason: { code: 'out_of_energy' } });
    });
});


// ============================================================
// Stepping
// ============================================================

describe('onStatement', () => {
    it('parks the run until each statement is released', async () => {
        const { api, calls } = stubApi();
        let release: (() => void) | undefined;

        // Read through a closure: the promise executor below reassigns
        // `release`, which narrowing in a straight-line block cannot see.
        const resumeNext = () => {
            const resume = release;
            release = undefined;
            resume?.();
            return resume !== undefined;
        };

        const finished = runScript('moveForward();\nturnLeft();\nmoveForward();', {
            api,
            onStatement: () => new Promise<void>((resolve) => (release = resolve)),
        });

        // Parked before the first statement — nothing has run yet.
        await Promise.resolve();
        expect(calls).toEqual([]);

        for (const expected of ['moveForward', 'turnLeft', 'moveForward']) {
            expect(resumeNext()).toBe(true);
            await vi.waitFor(() => expect(calls.at(-1)).toBe(expected));
        }

        resumeNext();
        expect(await finished).toEqual({ status: 'finished' });
    });
});
