import { describe, expect, it } from 'vitest';
import {
    censusOf,
    checkConstraints,
    constraintLabel,
    constraintMessage,
    constraintProblems,
    constraintStatus,
    hasRunRules,
    outputHolds,
    runRulesHold,
    valueHolds,
    type RunRecord,
} from './constraints';
import type {
    CodeConstraint,
    CodeConstruct,
    ConstraintOperator,
    LevelOptions,
    OutputConstraint,
    OutputOperator,
    ValueConstraint,
    ValueOperator,
} from './level';
import { parseScript, runScript, type ScriptValue } from './script';
import { createRobotApi } from './robot-api';
import { GameEngine } from './engine';
import { nullPlayer } from './events';
import { emptyLevel } from './editor/operations';

const census = (source: string) => censusOf(parseScript(source));

const construct = (c: CodeConstruct, operator: ConstraintOperator, count: number): CodeConstraint => ({
    kind: 'count',
    target: { kind: 'construct', construct: c },
    operator,
    count,
    message: null,
});

const call = (name: string, operator: ConstraintOperator, count: number): CodeConstraint => ({
    kind: 'count',
    target: { kind: 'call', name },
    operator,
    count,
    message: null,
});

const named = (declaration: 'variable' | 'function', name: string): CodeConstraint => ({
    kind: 'name',
    declaration,
    name,
    message: null,
});

const options = (patch: Partial<LevelOptions> = {}): LevelOptions => ({
    energy: null,
    memory: null,
    showInventory: false,
    languageStage: 5,
    ...patch,
});

describe('censusOf', () => {
    it('counts constructs where they are written, not how often they run', () => {
        const result = census(`
            function side() { repeat(3) { moveForward(); } turnLeft(); }
            side(); side(); side();
        `);
        expect(result.constructs.repeat).toBe(1);
        expect(result.constructs.function).toBe(1);
        expect(result.calls.get('moveForward')).toBe(1);
        expect(result.calls.get('side')).toBe(3);
    });

    it('counts else if as one else and one more if', () => {
        const result = census('if (isCrate()) { pick(); } else if (isBlocked()) { turnLeft(); } else { moveForward(); }');
        expect(result.constructs.if).toBe(2);
        expect(result.constructs.else).toBe(2);
    });

    it('counts sensor calls inside tests', () => {
        const result = census('while (!isGoal()) { if (isBlocked()) { turnLeft(); } moveForward(); }');
        expect(result.calls.get('isGoal')).toBe(1);
        expect(result.calls.get('isBlocked')).toBe(1);
    });

    it('records declared names, but not parameters', () => {
        const result = census('let zaehler = 0; function go(n) { let schritt = n; }');
        expect([...result.variables]).toEqual(['zaehler', 'schritt']);
        expect([...result.functions]).toEqual(['go']);
        expect(result.constructs.variable).toBe(2);
    });
});

describe('constraintStatus', () => {
    const program = census('repeat(2) { moveForward(); } let a = 1; let b = 2;');

    it('treats min as a requirement', () => {
        expect(constraintStatus(construct('if', 'min', 1), program)).toBe('unmet');
        expect(constraintStatus(construct('repeat', 'min', 1), program)).toBe('met');
    });

    it('treats max as a prohibition', () => {
        expect(constraintStatus(construct('repeat', 'max', 0), program)).toBe('violated');
        expect(constraintStatus(construct('while', 'max', 0), program)).toBe('met');
    });

    it('treats eq as both', () => {
        expect(constraintStatus(construct('variable', 'eq', 2), program)).toBe('met');
        expect(constraintStatus(construct('variable', 'eq', 5), program)).toBe('unmet');
        expect(constraintStatus(construct('variable', 'eq', 1), program)).toBe('violated');
    });

    it('counts command calls', () => {
        expect(constraintStatus(call('turnLeft', 'max', 0), program)).toBe('met');
        expect(constraintStatus(call('moveForward', 'max', 0), program)).toBe('violated');
    });

    it('accepts a declared name whether or not it is used', () => {
        expect(constraintStatus(named('variable', 'a'), program)).toBe('met');
        expect(constraintStatus(named('variable', 'c'), program)).toBe('unmet');
        expect(constraintStatus(named('function', 'a'), program)).toBe('unmet');
    });

    it('does not confuse a variable with a function of the same name', () => {
        const program = census('function turnAround() { turnLeft(); turnLeft(); }');
        expect(constraintStatus(named('function', 'turnAround'), program)).toBe('met');
        expect(constraintStatus(named('variable', 'turnAround'), program)).toBe('unmet');
    });
});

describe('labels', () => {
    it('reads naturally for each operator', () => {
        expect(constraintLabel(construct('if', 'min', 1))).toBe('Verwende `if`');
        expect(constraintLabel(construct('repeat', 'max', 0))).toBe('Kein `repeat`');
        expect(constraintLabel(construct('variable', 'eq', 5))).toBe('Verwende genau 5 Variablen');
        expect(constraintLabel(call('turnLeft', 'max', 2))).toBe('Verwende höchstens 2× `turnLeft()`');
        expect(constraintLabel(named('function', 'turnAround'))).toBe('Verwende `turnAround`');
    });

    it('prefers the author message', () => {
        expect(constraintMessage({ ...construct('if', 'min', 1), message: 'Entscheide mit if!' })).toBe('Entscheide mit if!');
        expect(constraintMessage({ ...construct('if', 'min', 1), message: '  ' })).toBe('Verwende `if`');
    });

    it('checkConstraints pairs each rule with its status and label', () => {
        const checks = checkConstraints([construct('if', 'min', 1)], parseScript('moveForward();'));
        expect(checks).toEqual([
            { constraint: construct('if', 'min', 1), status: 'unmet', label: 'Verwende `if`' },
        ]);
    });
});

describe('constraintProblems', () => {
    it('flags requirements the stage does not allow', () => {
        expect(constraintProblems({ options: options({ languageStage: 2 }), constraints: [construct('if', 'min', 1)] }))
            .toHaveLength(1);
        expect(constraintProblems({ options: options({ languageStage: 2 }), constraints: [call('isBlocked', 'min', 1)] }))
            .toHaveLength(1);
        expect(constraintProblems({ options: options({ languageStage: 3 }), constraints: [named('variable', 'x')] }))
            .toHaveLength(1);
        // A prohibition is always satisfiable.
        expect(constraintProblems({ options: options({ languageStage: 1 }), constraints: [construct('repeat', 'max', 0)] }))
            .toEqual([]);
    });

    it('flags contradicting rules', () => {
        const problems = constraintProblems({
            options: options(),
            constraints: [construct('repeat', 'min', 1), construct('repeat', 'max', 0)],
        });
        expect(problems).toEqual(['Die Regeln zu `repeat` widersprechen sich']);
    });

    it('flags a name rule that a construct rule forbids', () => {
        expect(constraintProblems({
            options: options(),
            constraints: [named('variable', 'x'), construct('variable', 'max', 0)],
        })).toHaveLength(1);
    });

    it('flags invalid names', () => {
        expect(constraintProblems({ options: options(), constraints: [named('variable', '1x')] })).toHaveLength(1);
        expect(constraintProblems({ options: options(), constraints: [named('function', 'moveForward')] })).toHaveLength(1);
    });

    it('flags more required code than memory holds', () => {
        const constraints = [construct('repeat', 'min', 2), call('moveForward', 'min', 2), named('variable', 'x')];
        expect(constraintProblems({ options: options({ memory: 5 }), constraints })).toEqual([]);
        expect(constraintProblems({ options: options({ memory: 4 }), constraints })).toHaveLength(1);
    });
});

const value = (name: string, operator: ValueOperator, expected: number | string | boolean): ValueConstraint => ({
    kind: 'value',
    name,
    operator,
    value: expected,
    message: null,
});

const record = (variables: Record<string, ScriptValue> = {}, output: string[] = []): RunRecord => ({
    variables: new Map(Object.entries(variables)),
    output,
});

/** The top-level variables `source` ends with, run on an empty level. */
async function variablesAfter(source: string): Promise<ReadonlyMap<string, ScriptValue>> {
    const engine = new GameEngine(emptyLevel('v', 'V'), { energy: null });
    let variables: ReadonlyMap<string, ScriptValue> = new Map();
    await runScript(source, { api: createRobotApi(engine, nullPlayer), onEnd: (ended) => (variables = ended.variables) });
    return variables;
}

describe('value rules', () => {
    it('reads the top-level variables as the run ended', async () => {
        const variables = await variablesAfter('let count = 0; repeat(5) { count = count + 1; } function f() { let inner = 1; } f();');
        expect(variables.get('count')).toBe(5);
        expect(variables.has('inner')).toBe(false);
        // Functions are not values a rule can ask about.
        expect(variables.has('f')).toBe(false);
    });

    it('reads them even when the run stops on an error', async () => {
        const variables = await variablesAfter('let count = 3; count = count / 0;');
        expect(variables.get('count')).toBe(3);
    });

    it('compares strictly, and orders only numbers', () => {
        const variables = new Map<string, ScriptValue>([['count', 5], ['age', 19], ['name', 'Dewy'], ['done', true], ['text', '20']]);
        expect(valueHolds(value('count', '===', 5), variables)).toBe(true);
        expect(valueHolds(value('count', '===', '5'), variables)).toBe(false);
        expect(valueHolds(value('age', '>', 18), variables)).toBe(true);
        expect(valueHolds(value('age', '<=', 18), variables)).toBe(false);
        expect(valueHolds(value('name', '===', 'Dewy'), variables)).toBe(true);
        expect(valueHolds(value('done', '!==', false), variables)).toBe(true);
        expect(valueHolds(value('text', '>', 18), variables)).toBe(false);
        expect(valueHolds(value('missing', '!==', 1), variables)).toBe(false);
    });

    it('is not met before any run', () => {
        const program = census('let count = 5;');
        expect(constraintStatus(value('count', '===', 5), program, null)).toBe('unmet');
        expect(constraintStatus(value('count', '===', 5), program, record({ count: 5 }))).toBe('met');
        expect(runRulesHold([value('count', '===', 5)], null)).toBe(false);
        expect(runRulesHold([construct('if', 'min', 1)], null)).toBe(true);
    });

    it('labels in the student language', () => {
        expect(constraintLabel(value('count', '===', 5))).toBe('`count === 5`');
        expect(constraintLabel(value('name', '!==', 'Dewy'))).toBe('`name !== "Dewy"`');
    });

    it('warns about rules no run can meet', () => {
        expect(constraintProblems({ options: options({ languageStage: 3 }), constraints: [value('count', '===', 5)] }))
            .toHaveLength(1);
        expect(constraintProblems({ options: options(), constraints: [value('name', '>', 'a')] })).toHaveLength(1);
        expect(constraintProblems({ options: options(), constraints: [value('', '===', 1)] })).toHaveLength(1);
        expect(constraintProblems({
            options: options(),
            constraints: [value('count', '===', 5), construct('variable', 'max', 0)],
        })).toHaveLength(1);
        expect(constraintProblems({ options: options(), constraints: [value('count', '>=', 5)] })).toEqual([]);
    });
});

const output = (operator: OutputOperator, text: string): OutputConstraint => ({
    kind: 'output',
    operator,
    text,
    message: null,
});

describe('output rules', () => {
    it('matches text anywhere, a whole line, or nowhere', () => {
        const said = ['Hallo Welt', '42'];
        expect(outputHolds(output('contains', 'Hallo'), said)).toBe(true);
        expect(outputHolds(output('contains', 'Welt\n42'), said)).toBe(true);
        expect(outputHolds(output('contains', 'hallo'), said)).toBe(false);
        expect(outputHolds(output('line', 'Hallo'), said)).toBe(false);
        expect(outputHolds(output('line', '42'), said)).toBe(true);
        expect(outputHolds(output('notContains', 'Tschüss'), said)).toBe(true);
        expect(outputHolds(output('notContains', 'Welt'), said)).toBe(false);
    });

    it('is not met before any run, not even a ban', () => {
        const program = census('say("Hallo");');
        expect(constraintStatus(output('contains', 'Hallo'), program, null)).toBe('unmet');
        expect(constraintStatus(output('notContains', 'x'), program, null)).toBe('unmet');
        expect(constraintStatus(output('contains', 'Hallo'), program, record({}, ['Hallo']))).toBe('met');
        expect(runRulesHold([output('contains', 'Hallo')], record({}, ['Hallo']))).toBe(true);
        expect(runRulesHold([output('contains', 'Hallo'), value('n', '===', 1)], record({}, ['Hallo']))).toBe(false);
    });

    it('can be a level\'s whole task', () => {
        expect(hasRunRules([output('contains', 'Hallo')])).toBe(true);
        expect(hasRunRules([construct('if', 'min', 1)])).toBe(false);
    });

    it('labels in plain words', () => {
        expect(constraintLabel(output('contains', 'Hallo'))).toBe('Gib „Hallo“ aus');
        expect(constraintLabel(output('line', 'Hallo'))).toBe('Gib genau die Zeile „Hallo“ aus');
        expect(constraintLabel(output('notContains', 'Hallo'))).toBe('Gib nie „Hallo“ aus');
    });

    it('counts say like any other call', () => {
        const sayRule: CodeConstraint = {
            kind: 'count',
            target: { kind: 'call', name: 'say' },
            operator: 'min',
            count: 1,
            message: null,
        };
        expect(constraintStatus(sayRule, census('say("x");'))).toBe('met');
        expect(constraintStatus(sayRule, census('moveForward();'))).toBe('unmet');
    });

    it('warns about rules no run can meet', () => {
        const options = { languageStage: 1, memory: 0 } as LevelOptions;
        const problems = (constraints: CodeConstraint[]) => constraintProblems({ options, constraints });
        expect(problems([output('contains', 'Hallo')])).toEqual([]);
        expect(problems([output('contains', '')])).toHaveLength(1);
        expect(problems([output('line', 'Hallo Welt'), output('notContains', 'Welt')])).toHaveLength(1);
        expect(problems([
            output('contains', 'Hallo'),
            { kind: 'count', target: { kind: 'call', name: 'say' }, operator: 'max', count: 0, message: null },
        ])).toHaveLength(1);
    });
});
