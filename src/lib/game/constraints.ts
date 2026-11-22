import type {
    CodeConstraint,
    CodeConstruct,
    ConstraintTarget,
    CountConstraint,
    LanguageStage,
    LevelSettings,
    OutputConstraint,
    OutputOperator,
    ValueConstraint,
    ValueOperator,
} from './level';
import { BUILTIN_NAMES, type Builtin, type RunRecord } from './script/interpreter';
import type { RobotActions, RobotSensors } from './robot-api';
import type { Block, Expr, Program, Stmt } from './script/ast';
import { FEATURE_STAGE } from './script/parser';
import { KEYWORDS } from './script/lexer';

/**
 * Code constraints: rules about what a student's program is *written* with.
 *
 * Pure and framework-free, like `script/measure.ts`, and for the same reason:
 * a constraint is a property of the source, so it is judged on the parsed
 * program before any run. Two rules decide everything else:
 *
 *  - **What is written counts, not what runs.** A `repeat` inside a function
 *    counts once however often the function is called, and code that can
 *    never run counts like any other. Declaring a name is enough to satisfy a
 *    name rule, used or not.
 *  - **Value and output rules are the exception**: `count === 5` and
 *    "Gib „Hallo“ aus" ask about the run, so they are judged on how it ended
 *    — its top-level variables and what it said — and every variant's run
 *    must satisfy them. Before a run they are simply not met yet.
 *  - **Going over blocks the run; falling short only blocks completion.** A
 *    program with a forbidden `repeat` is already disqualified, so running it
 *    teaches nothing. A program that does not yet use the required `if` may
 *    still be half-written, and the student must be able to try it.
 */

// ============================================================
// What can be counted
// ============================================================

/** Robot commands by name, typed against the API so a new one cannot be missed. */
const ACTIONS: Record<keyof RobotActions, true> = {
    moveForward: true,
    turnLeft: true,
    turnRight: true,
    pick: true,
    drop: true,
    open: true,
    toggle: true,
    wait: true,
};

const SENSORS: Record<keyof RobotSensors, true> = {
    isBlocked: true,
    isCrate: true,
    isCarrying: true,
    isGoal: true,
    isDropOff: true,
    crateColor: true,
    isDangerous: true,
};

export const CONSTRAINT_ACTIONS = Object.keys(ACTIONS) as (keyof RobotActions)[];
export const CONSTRAINT_SENSORS = Object.keys(SENSORS) as (keyof RobotSensors)[];
/** Commands of the language rather than the robot — `say`. */
export const CONSTRAINT_BUILTINS: readonly Builtin[] = BUILTIN_NAMES;
/** Every name a call target may have. */
export const CONSTRAINT_CALLS: readonly string[] = [
    ...CONSTRAINT_ACTIONS,
    ...CONSTRAINT_SENSORS,
    ...CONSTRAINT_BUILTINS,
];

export const CODE_CONSTRUCTS = [
    'if', 'else', 'while', 'repeat', 'function', 'variable',
] as const satisfies readonly CodeConstruct[];

export const CONSTRAINT_OPERATORS = ['min', 'max', 'eq'] as const;

export const VALUE_OPERATORS = ['===', '!==', '<', '<=', '>', '>='] as const satisfies readonly ValueOperator[];

export const OUTPUT_OPERATORS = ['contains', 'line', 'notContains'] as const satisfies readonly OutputOperator[];

/** The stage a construct is first legal at, from the parser's own table. */
const CONSTRUCT_STAGE: Record<CodeConstruct, LanguageStage> = {
    if: FEATURE_STAGE.conditional,
    else: FEATURE_STAGE.conditional,
    while: FEATURE_STAGE.loop,
    repeat: FEATURE_STAGE.repeat,
    function: FEATURE_STAGE.function,
    variable: FEATURE_STAGE.variable,
};

const SENSOR_STAGE: LanguageStage = FEATURE_STAGE.conditional;

/** A name the student could actually declare: an identifier, not a keyword or a robot command. */
export function isDeclarableName(name: string): boolean {
    return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)
        && !KEYWORDS.has(name)
        && !CONSTRAINT_CALLS.includes(name);
}


// ============================================================
// Counting a program
// ============================================================

/** Everything a constraint can ask about one program. */
export type CodeCensus = {
    constructs: Record<CodeConstruct, number>;
    /** Call sites per callee — robot commands and the student's own functions alike. */
    calls: Map<string, number>;
    variables: Set<string>;
    functions: Set<string>;
};

/**
 * Counts what `program` is written with.
 *
 * `else if` is a block holding a single `if` (see the parser), so it counts
 * as one `else` and one more `if` — which is what it reads as. Function
 * parameters are not variables.
 */
export function censusOf(program: Program): CodeCensus {
    const census: CodeCensus = {
        constructs: { if: 0, else: 0, while: 0, repeat: 0, function: 0, variable: 0 },
        calls: new Map(),
        variables: new Set(),
        functions: new Set(),
    };

    const block = (target: Block) => target.statements.forEach(statement);

    function statement(target: Stmt): void {
        switch (target.kind) {
            case 'expression':
                expression(target.expression);
                return;
            case 'let':
                census.constructs.variable++;
                census.variables.add(target.name);
                expression(target.value);
                return;
            case 'assign':
                expression(target.value);
                return;
            case 'return':
                if (target.value) expression(target.value);
                return;
            case 'if':
                census.constructs.if++;
                expression(target.test);
                block(target.consequent);
                if (target.alternate) {
                    census.constructs.else++;
                    block(target.alternate);
                }
                return;
            case 'while':
                census.constructs.while++;
                expression(target.test);
                block(target.body);
                return;
            case 'repeat':
                census.constructs.repeat++;
                expression(target.count);
                block(target.body);
                return;
            case 'function':
                census.constructs.function++;
                census.functions.add(target.name);
                block(target.body);
                return;
        }
    }

    function expression(target: Expr): void {
        switch (target.kind) {
            case 'call':
                census.calls.set(target.callee, (census.calls.get(target.callee) ?? 0) + 1);
                target.args.forEach(expression);
                return;
            case 'unary':
                expression(target.operand);
                return;
            case 'binary':
            case 'logical':
                expression(target.left);
                expression(target.right);
                return;
            default:
                return;
        }
    }

    program.body.forEach(statement);
    return census;
}


// ============================================================
// Judging a program
// ============================================================

/**
 * `met` — fine. `unmet` — short of a requirement: the program may run, but
 * cannot complete the level. `violated` — over a limit: it may run too, so
 * the student can watch what it does, but likewise cannot complete it.
 */
export type ConstraintStatus = 'met' | 'unmet' | 'violated';

export type ConstraintCheck = {
    constraint: CodeConstraint;
    status: ConstraintStatus;
    /** What the student reads — the author's message, or the generated label. */
    label: string;
};

export function countOf(census: CodeCensus, target: ConstraintTarget): number {
    return target.kind === 'construct'
        ? census.constructs[target.construct]
        : (census.calls.get(target.name) ?? 0);
}

/**
 * Whether a rule asks for something to be written — a minimum, an exact
 * count above zero, a name — rather than only capping it. A pure limit is
 * met by an empty program, so the player never shows it as "done".
 */
export function isRequirement(constraint: CodeConstraint): boolean {
    if (constraint.kind === 'output') return constraint.operator !== 'notContains';
    return constraint.kind !== 'count' || (constraint.operator !== 'max' && constraint.count > 0);
}

export type { RunRecord };

/** A run's top-level variables as it ended — see `RunOptions.onEnd`. */
export type RunVariables = RunRecord['variables'];

/**
 * Whether a value rule holds. Equality is strict, as in the student's own
 * `===`; an ordering only ever holds between numbers, so `"10" > 5` is false
 * rather than whatever coercion would make of it. A variable the run never
 * declared holds nothing.
 */
export function valueHolds(constraint: ValueConstraint, variables: RunVariables): boolean {
    if (!variables.has(constraint.name)) return false;
    const actual = variables.get(constraint.name);
    const expected = constraint.value;
    switch (constraint.operator) {
        case '===':
            return actual === expected;
        case '!==':
            return actual !== expected;
    }
    if (typeof actual !== 'number' || typeof expected !== 'number') return false;
    switch (constraint.operator) {
        case '<':
            return actual < expected;
        case '<=':
            return actual <= expected;
        case '>':
            return actual > expected;
        case '>=':
            return actual >= expected;
    }
}

/**
 * Whether an output rule holds. `contains` searches the lines joined by a
 * newline, so a rule may span two of them; `line` wants one line exactly.
 */
export function outputHolds(constraint: OutputConstraint, output: readonly string[]): boolean {
    switch (constraint.operator) {
        case 'contains':
            return output.join('\n').includes(constraint.text);
        case 'line':
            return output.includes(constraint.text);
        case 'notContains':
            return !output.join('\n').includes(constraint.text);
    }
}

/** A rule judged on how the run ended rather than on the source. */
export function isRunRule(constraint: CodeConstraint): constraint is ValueConstraint | OutputConstraint {
    return constraint.kind === 'value' || constraint.kind === 'output';
}

function runRuleHolds(constraint: ValueConstraint | OutputConstraint, record: RunRecord): boolean {
    return constraint.kind === 'value'
        ? valueHolds(constraint, record.variables)
        : outputHolds(constraint, record.output);
}

/** Every value and output rule holds on this run. True when there are none. */
export function runRulesHold(constraints: CodeConstraint[], record: RunRecord | null): boolean {
    return constraints.every(
        (constraint) => !isRunRule(constraint) || (record !== null && runRuleHolds(constraint, record)),
    );
}

/** Whether a rule about the run can be the level's task, in place of a world goal. */
export function hasRunRules(constraints: CodeConstraint[]): boolean {
    return constraints.some(isRunRule);
}

/**
 * `record` is the last run of this exact program, or `null` when there has
 * been none — then a value or output rule is simply not met yet.
 */
export function constraintStatus(
    constraint: CodeConstraint,
    census: CodeCensus,
    record: RunRecord | null = null,
): ConstraintStatus {
    if (isRunRule(constraint)) {
        return record !== null && runRuleHolds(constraint, record) ? 'met' : 'unmet';
    }
    if (constraint.kind === 'name') {
        const declared = constraint.declaration === 'variable' ? census.variables : census.functions;
        return declared.has(constraint.name) ? 'met' : 'unmet';
    }

    const actual = countOf(census, constraint.target);
    if (constraint.operator !== 'min' && actual > constraint.count) return 'violated';
    if (constraint.operator !== 'max' && actual < constraint.count) return 'unmet';
    return 'met';
}

export function checkConstraints(
    constraints: CodeConstraint[],
    program: Program,
    record: RunRecord | null = null,
): ConstraintCheck[] {
    const census = censusOf(program);
    return constraints.map((constraint) => ({
        constraint,
        status: constraintStatus(constraint, census, record),
        label: constraintMessage(constraint),
    }));
}


// ============================================================
// Labels
// ============================================================

/**
 * `use` follows "Verwende" for a plain requirement, `none` stands alone for
 * a ban ("Kein `repeat`"), `one` / `many` follow a count.
 */
type Wording = { use: string; one: string; many: string; none: string };

const CONSTRUCT_WORDING: Record<CodeConstruct, Wording> = {
    if: { use: '`if`', one: 'ein `if`', many: '`if`', none: 'Kein `if`' },
    else: { use: '`else`', one: 'ein `else`', many: '`else`', none: 'Kein `else`' },
    while: { use: '`while`', one: 'ein `while`', many: '`while`', none: 'Kein `while`' },
    repeat: { use: '`repeat`', one: 'ein `repeat`', many: '`repeat`', none: 'Kein `repeat`' },
    function: {
        use: 'eine eigene Funktion',
        one: 'eine eigene Funktion',
        many: 'eigene Funktionen',
        none: 'Keine eigene Funktion',
    },
    variable: { use: 'eine Variable', one: 'eine Variable', many: 'Variablen', none: 'Keine Variable' },
};

/** What the designer's picker calls a construct. */
export const CONSTRUCT_NAME: Record<CodeConstruct, string> = {
    if: '`if`',
    else: '`else`',
    while: '`while`',
    repeat: '`repeat`',
    function: 'Eigene Funktion',
    variable: 'Variable (`let`)',
};

function wording(target: ConstraintTarget): Wording {
    if (target.kind === 'construct') return CONSTRUCT_WORDING[target.construct];
    const call = `\`${target.name}()\``;
    return { use: call, one: call, many: call, none: `Kein ${call}` };
}

function amount(target: ConstraintTarget, n: number): string {
    const words = wording(target);
    if (n === 1) return words.one;
    return target.kind === 'call' ? `${n}× ${words.many}` : `${n} ${words.many}`;
}

/** A value as the student would write it: strings quoted, the rest as is. */
export function formatValue(value: number | string | boolean): string {
    return typeof value === 'string' ? JSON.stringify(value) : String(value);
}

/** The generated sentence for a rule, e.g. "Kein `repeat`" or "`count === 5`". */
export function constraintLabel(constraint: CodeConstraint): string {
    if (constraint.kind === 'output') {
        const text = constraint.text ? `„${constraint.text}“` : '…';
        switch (constraint.operator) {
            case 'contains':
                return `Gib ${text} aus`;
            case 'line':
                return `Gib genau die Zeile ${text} aus`;
            case 'notContains':
                return `Gib nie ${text} aus`;
        }
    }
    if (constraint.kind === 'value') {
        const name = constraint.name.trim() || '…';
        return `\`${name} ${constraint.operator} ${formatValue(constraint.value)}\``;
    }
    if (constraint.kind === 'name') {
        // Without a name yet, say what kind of name is wanted.
        if (constraint.name.trim()) return `Verwende \`${constraint.name}\``;
        return constraint.declaration === 'variable' ? 'Verwende eine Variable' : 'Verwende eine Funktion';
    }

    const { target, operator, count } = constraint;
    if (count === 0 && operator !== 'min') return wording(target).none;
    switch (operator) {
        case 'min':
            return count <= 1 ? `Verwende ${wording(target).use}` : `Verwende mindestens ${amount(target, count)}`;
        case 'max':
            return `Verwende höchstens ${amount(target, count)}`;
        case 'eq':
            return `Verwende genau ${amount(target, count)}`;
    }
}

export function constraintMessage(constraint: CodeConstraint): string {
    return constraint.message?.trim() || constraintLabel(constraint);
}


// ============================================================
// Designer warnings
// ============================================================

function targetKey(target: ConstraintTarget): string {
    return target.kind === 'construct' ? `construct:${target.construct}` : `call:${target.name}`;
}

function targetStage(target: ConstraintTarget): LanguageStage {
    if (target.kind === 'construct') return CONSTRUCT_STAGE[target.construct];
    return CONSTRAINT_SENSORS.includes(target.name as keyof RobotSensors) ? SENSOR_STAGE : 1;
}

/** The fewest of `target` a rule demands — 0 when it demands none. */
function demanded(constraint: CountConstraint): number {
    return constraint.operator === 'max' ? 0 : constraint.count;
}

/**
 * Rules no program could satisfy at this level's settings — a requirement the
 * language stage does not allow yet, rules that contradict each other, more
 * required code than the memory holds. Warnings, like `validateDocument`'s:
 * a half-built level must still save.
 */
export function constraintProblems(settings: Pick<LevelSettings, 'options' | 'constraints'>): string[] {
    const { constraints, options } = settings;
    const stage = options.languageStage;
    const problems: string[] = [];

    // A range per target: what every rule on it allows together.
    const ranges = new Map<string, { target: ConstraintTarget; low: number; high: number }>();
    const declared = { variable: new Set<string>(), function: new Set<string>() };
    const output = { wanted: new Set<string>(), banned: new Set<string>() };

    for (const constraint of constraints) {
        const label = `Regel „${constraintLabel(constraint)}“`;

        if (constraint.kind === 'output') {
            if (!constraint.text) {
                problems.push(`${label} braucht noch einen Text`);
            } else if (constraint.operator === 'notContains') {
                output.banned.add(constraint.text);
            } else {
                output.wanted.add(constraint.text);
            }
            continue;
        }

        if (constraint.kind === 'value') {
            if (!constraint.name.trim()) {
                problems.push(`${label} braucht noch einen Variablennamen`);
            } else if (!isDeclarableName(constraint.name)) {
                problems.push(`${label}: „${constraint.name}“ ist kein gültiger Name`);
            } else if (stage < FEATURE_STAGE.variable) {
                problems.push(`${label} ist auf Stufe ${stage} nicht erfüllbar (erst ab Stufe ${FEATURE_STAGE.variable})`);
            }
            if (
                constraint.operator !== '===' && constraint.operator !== '!=='
                && typeof constraint.value !== 'number'
            ) {
                problems.push(`${label} vergleicht mit ${constraint.operator} keine Zahl und ist nie erfüllt`);
            }
            declared.variable.add(constraint.name);
            continue;
        }

        if (constraint.kind === 'name') {
            const needs = constraint.declaration === 'variable' ? FEATURE_STAGE.variable : FEATURE_STAGE.function;
            if (!constraint.name.trim()) {
                problems.push(`${label} braucht noch einen Namen`);
            } else if (!isDeclarableName(constraint.name)) {
                problems.push(`${label}: „${constraint.name}“ ist kein gültiger Name`);
            } else if (stage < needs) {
                problems.push(`${label} ist auf Stufe ${stage} nicht erfüllbar (erst ab Stufe ${needs})`);
            }
            declared[constraint.declaration].add(constraint.name);
            continue;
        }

        const needs = targetStage(constraint.target);
        if (demanded(constraint) > 0 && stage < needs) {
            problems.push(`${label} ist auf Stufe ${stage} nicht erfüllbar (erst ab Stufe ${needs})`);
        }

        const key = targetKey(constraint.target);
        const range = ranges.get(key) ?? { target: constraint.target, low: 0, high: Infinity };
        if (constraint.operator !== 'max') range.low = Math.max(range.low, constraint.count);
        if (constraint.operator !== 'min') range.high = Math.min(range.high, constraint.count);
        ranges.set(key, range);
    }

    for (const { target, low, high } of ranges.values()) {
        if (low > high) {
            const name = target.kind === 'construct' ? CONSTRUCT_NAME[target.construct] : `\`${target.name}()\``;
            problems.push(`Die Regeln zu ${name} widersprechen sich`);
        }
    }

    // A wanted text that contains a banned one can never be written.
    for (const wanted of output.wanted) {
        for (const banned of output.banned) {
            if (wanted.includes(banned)) {
                problems.push(`Die Regeln verlangen „${wanted}“ und verbieten zugleich „${banned}“`);
            }
        }
    }

    // Output can only be written with `say`.
    if (output.wanted.size > 0 && (ranges.get('call:say')?.high ?? Infinity) === 0) {
        problems.push('Die Regeln verlangen eine Ausgabe, verbieten aber `say()`');
    }

    // Every `else` belongs to an `if`.
    const elses = ranges.get('construct:else')?.low ?? 0;
    const ifs = ranges.get('construct:if')?.high ?? Infinity;
    if (elses > ifs) problems.push('Die Regeln verlangen mehr `else` als `if` erlaubt sind');

    // A name rule needs a declaration, which a "no variables" rule forbids.
    for (const kind of ['variable', 'function'] as const) {
        const allowed = ranges.get(`construct:${kind}`)?.high ?? Infinity;
        if (declared[kind].size > allowed) {
            problems.push(kind === 'variable'
                ? 'Die Namensregeln verlangen mehr Variablen, als die Regeln erlauben'
                : 'Die Namensregeln verlangen mehr Funktionen, als die Regeln erlauben');
        }
    }

    if (options.memory !== null) {
        const minimum = minimumStatements(ranges, declared);
        if (minimum > options.memory) {
            problems.push(
                `Die Regeln verlangen mindestens ${minimum} Anweisungen, der Speicher fasst ${options.memory}`,
            );
        }
    }

    return problems;
}

/**
 * A lower bound on the memory a rule-abiding program needs. Each required
 * statement-shaped construct and robot command costs one; `else` and sensors
 * cost nothing of their own, since they ride inside an `if` or a test.
 */
function minimumStatements(
    ranges: Map<string, { target: ConstraintTarget; low: number }>,
    declared: { variable: Set<string>; function: Set<string> },
): number {
    let total = 0;
    for (const { target, low } of ranges.values()) {
        if (target.kind === 'construct') {
            if (target.construct === 'else' || target.construct === 'variable' || target.construct === 'function') continue;
            total += low;
        } else if (CONSTRAINT_ACTIONS.includes(target.name as keyof RobotActions)) {
            total += low;
        }
    }
    for (const kind of ['variable', 'function'] as const) {
        total += Math.max(ranges.get(`construct:${kind}`)?.low ?? 0, declared[kind].size);
    }
    return total;
}
