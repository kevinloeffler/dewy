import { describe, expect, it } from 'vitest';
import {
    censusOf,
    checkConstraints,
    constraintLabel,
    constraintMessage,
    constraintProblems,
    constraintStatus,
} from './constraints';
import type { CodeConstraint, CodeConstruct, ConstraintOperator, LevelOptions } from './level';
import { parseScript } from './script';

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
        expect(constraintLabel(construct('if', 'min', 1))).toBe('Verwende ein `if`');
        expect(constraintLabel(construct('repeat', 'max', 0))).toBe('Verwende kein `repeat`');
        expect(constraintLabel(construct('variable', 'eq', 5))).toBe('Verwende genau 5 Variablen');
        expect(constraintLabel(call('turnLeft', 'max', 2))).toBe('Verwende höchstens 2× `turnLeft()`');
        expect(constraintLabel(named('function', 'turnAround'))).toBe('Schreibe eine Funktion `turnAround`');
    });

    it('prefers the author message', () => {
        expect(constraintMessage({ ...construct('if', 'min', 1), message: 'Entscheide mit if!' })).toBe('Entscheide mit if!');
        expect(constraintMessage({ ...construct('if', 'min', 1), message: '  ' })).toBe('Verwende ein `if`');
    });

    it('checkConstraints pairs each rule with its status and label', () => {
        const checks = checkConstraints([construct('if', 'min', 1)], parseScript('moveForward();'));
        expect(checks).toEqual([
            { constraint: construct('if', 'min', 1), status: 'unmet', label: 'Verwende ein `if`' },
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
