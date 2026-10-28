import type { Level, LevelDocument, LevelLayout, LevelSettings } from '$lib/game/level';
import { layoutOf, sameLayout, variantLevel } from '$lib/game/variants';
import {
    addVariant,
    removeVariant,
    replaceVariant,
    resizeDocument,
} from './operations';

/**
 * The designer's undo history, as pure functions over an immutable state —
 * `draft.svelte.ts` only holds the current one in a rune.
 *
 * History is split by what an edit touched, so that nothing is ever undone
 * out of sight:
 *
 *  - every **variant** has its own stack of layouts. Undo in variant 2 never
 *    reaches into variant 1, which is not on screen.
 *  - the **settings** in the right panel (texts, options, goals) share one
 *    stack. That panel is always on screen, whichever variant is open.
 *
 * Undo takes the newer of the two candidates — the open variant's top entry
 * and the settings' top entry — by a sequence number every entry gets when
 * it is recorded. Redo takes the older of the two front entries, which is the
 * one undone last.
 *
 * A resize is the exception: it changes every variant at once, so no single
 * variant's stack can hold it. It is a settings entry carrying the whole
 * document and every variant's history from before, undoable only while it is
 * still the newest thing that happened — the first edit to any variant after
 * it makes it permanent, because undoing it then would silently undo that
 * edit too. Resizing clears the variant histories, whose layouts no longer fit
 * the grid; undoing the resize brings them back.
 *
 * Adding and removing variants is not recorded at all — removal asks first.
 */

const HISTORY_LIMIT = 50;

/** The settings a settings entry can restore. Size goes through `resize`. */
const SETTINGS_KEYS = ['name', 'description', 'instructions', 'options', 'goals'] as const;

type SettingsKey = (typeof SETTINGS_KEYS)[number];
type SettingsPatch = Partial<Pick<LevelSettings, SettingsKey>>;

type Stack<T> = { past: T[]; future: T[] };

type VariantEntry = { seq: number; layout: LevelLayout };

type SettingsEntry =
    | { seq: number; kind: 'settings'; patch: SettingsPatch }
    | {
          seq: number;
          kind: 'resize';
          document: LevelDocument;
          variants: Record<string, Stack<VariantEntry>>;
      };

export type History = {
    document: LevelDocument;
    /** The open variant, by id — an index would shift when one is removed. */
    activeId: string;
    /** Keyed by variant id. A variant nobody has edited has no entry. */
    variants: Record<string, Stack<VariantEntry>>;
    settings: Stack<SettingsEntry>;
    seq: number;
};

const EMPTY: Stack<never> = { past: [], future: [] };

export function createHistory(document: LevelDocument): History {
    return {
        document,
        activeId: document.variants[0].id,
        variants: {},
        settings: EMPTY,
        seq: 0,
    };
}

export function activeIndex(history: History): number {
    const index = history.document.variants.findIndex((variant) => variant.id === history.activeId);
    return Math.max(index, 0);
}

export function activeLevel(history: History): Level {
    return variantLevel(history.document, activeIndex(history));
}

function stackOf(history: History): Stack<VariantEntry> {
    return history.variants[history.activeId] ?? EMPTY;
}

export function canUndo(history: History): boolean {
    return stackOf(history).past.length > 0 || history.settings.past.length > 0;
}

export function canRedo(history: History): boolean {
    return stackOf(history).future.length > 0 || history.settings.future.length > 0;
}


// ============================================================
// Recording
// ============================================================

/** The settings `next` changed from `from`, as `from`'s values — what undo restores. */
function settingsBefore(from: Level, next: Level): SettingsPatch | null {
    const keys = SETTINGS_KEYS.filter((key) => from[key] !== next[key]);
    if (keys.length === 0) return null;
    return Object.fromEntries(keys.map((key) => [key, from[key]])) as SettingsPatch;
}

function pick(document: LevelDocument, keys: SettingsKey[]): SettingsPatch {
    return Object.fromEntries(keys.map((key) => [key, document[key]])) as SettingsPatch;
}

const push = <T>(entries: T[], entry: T) => [...entries.slice(-(HISTORY_LIMIT - 1)), entry];

const withoutResizes = (stack: Stack<SettingsEntry>): Stack<SettingsEntry> => ({
    past: stack.past.filter((entry) => entry.kind !== 'resize'),
    future: stack.future.filter((entry) => entry.kind !== 'resize'),
});

/**
 * Write `next` — an edited copy of `from`, the open variant flattened — into
 * `base`. Records nothing: the select tool's drag previews through this.
 */
export function writeLevel(base: LevelDocument, index: number, from: Level, next: Level): LevelDocument {
    if (next.width !== from.width || next.height !== from.height) {
        throw new Error('the grid size is shared by every variant — use `resize`');
    }
    const changed = SETTINGS_KEYS.filter((key) => from[key] !== next[key]);
    const settled = changed.length > 0
        ? { ...base, ...Object.fromEntries(changed.map((key) => [key, next[key]])) }
        : base;
    return replaceVariant(settled, index, next);
}

/**
 * Commit `document` as one step. `layout` is the open variant's layout before
 * it, when that changed; `settings` the settings before, when those did. Both
 * at once records two entries, settings last — no operation does that today.
 *
 * A new step drops redo for everything on screen: the open variant and the
 * settings. A layout step also makes any pending resize permanent.
 */
function record(
    history: History,
    document: LevelDocument,
    layout: LevelLayout | null,
    settings: SettingsPatch | null,
): History {
    let { seq, variants } = history;
    let stack = layout ? withoutResizes(history.settings) : history.settings;

    if (layout) {
        const own = stackOf(history);
        variants = {
            ...variants,
            [history.activeId]: { past: push(own.past, { seq: ++seq, layout }), future: [] },
        };
        stack = { ...stack, future: [] };
    }
    if (settings) {
        stack = { past: push(stack.past, { seq: ++seq, kind: 'settings', patch: settings }), future: [] };
        const own = variants[history.activeId];
        if (own) variants = { ...variants, [history.activeId]: { ...own, future: [] } };
    }

    return { ...history, document, variants, settings: stack, seq };
}

/** One edit of the open variant, made by a `(level) => Level` operation on `from`. */
export function edit(history: History, from: Level, next: Level): History {
    if (next === from) return history;
    const document = writeLevel(history.document, activeIndex(history), from, next);
    if (document === history.document) return history;
    return record(
        history,
        document,
        sameLayout(from, next) ? null : layoutOf(from),
        settingsBefore(from, next),
    );
}

/**
 * End a drag the draft has been previewing into `history.document` since
 * `origin`. `last` is the level the drag last previewed — compared with the
 * origin rather than the document, so a goal the document gained by itself
 * (`syncReachGoal`) is not mistaken for a settings edit.
 */
export function commitGesture(
    history: History,
    origin: { document: LevelDocument; level: Level },
    last: Level,
): History {
    if (history.document === origin.document) return history;
    const layout = sameLayout(origin.level, last) ? null : layoutOf(origin.level);
    return record(history, history.document, layout, settingsBefore(origin.level, last));
}

/** A settings-only edit made on the document itself, e.g. a shared bay goal. */
export function editDocument(history: History, next: LevelDocument): History {
    if (next === history.document) return history;
    if (next.variants !== history.document.variants || next.width !== history.document.width || next.height !== history.document.height) {
        throw new Error('`editDocument` is for settings only');
    }
    const keys = SETTINGS_KEYS.filter((key) => next[key] !== history.document[key]);
    if (keys.length === 0) return history;
    return record(history, next, null, pick(history.document, keys));
}

export function resize(history: History, width: number, height: number): History {
    const document = resizeDocument(history.document, width, height);
    if (document === history.document) return history;

    const seq = history.seq + 1;
    const entry: SettingsEntry = {
        seq,
        kind: 'resize',
        document: history.document,
        variants: history.variants,
    };
    return {
        ...history,
        document,
        variants: {},
        settings: { past: push(history.settings.past, entry), future: [] },
        seq,
    };
}


// ============================================================
// Undo and redo
// ============================================================

export function undo(history: History): History {
    const own = stackOf(history);
    const layoutTop = own.past.at(-1);
    const settingsTop = history.settings.past.at(-1);
    if (!layoutTop && !settingsTop) return history;

    if (layoutTop && (!settingsTop || layoutTop.seq > settingsTop.seq)) {
        const index = activeIndex(history);
        const current = layoutOf(history.document.variants[index]);
        return {
            ...history,
            document: replaceVariant(history.document, index, layoutTop.layout),
            variants: {
                ...history.variants,
                [history.activeId]: {
                    past: own.past.slice(0, -1),
                    future: [{ seq: layoutTop.seq, layout: current }, ...own.future],
                },
            },
        };
    }

    const entry = settingsTop!;
    const past = history.settings.past.slice(0, -1);
    const [document, variants, undone] = restore(history, entry);
    return {
        ...history,
        document,
        variants,
        settings: { past, future: [undone, ...history.settings.future] },
    };
}

export function redo(history: History): History {
    const own = stackOf(history);
    const layoutNext = own.future[0];
    const settingsNext = history.settings.future[0];
    if (!layoutNext && !settingsNext) return history;

    if (layoutNext && (!settingsNext || layoutNext.seq < settingsNext.seq)) {
        const index = activeIndex(history);
        const current = layoutOf(history.document.variants[index]);
        return {
            ...history,
            document: replaceVariant(history.document, index, layoutNext.layout),
            variants: {
                ...history.variants,
                [history.activeId]: {
                    past: [...own.past, { seq: layoutNext.seq, layout: current }],
                    future: own.future.slice(1),
                },
            },
        };
    }

    const entry = settingsNext!;
    const future = history.settings.future.slice(1);
    const [document, variants, redone] = restore(history, entry);
    return {
        ...history,
        document,
        variants,
        settings: { past: [...history.settings.past, redone], future },
    };
}

/**
 * Apply a settings entry, returning the document and variant histories after
 * it and the entry that would take them back — undo and redo are the same
 * swap in opposite directions.
 */
function restore(
    history: History,
    entry: SettingsEntry,
): [LevelDocument, History['variants'], SettingsEntry] {
    if (entry.kind === 'resize') {
        return [
            entry.document,
            entry.variants,
            { seq: entry.seq, kind: 'resize', document: history.document, variants: history.variants },
        ];
    }
    const keys = Object.keys(entry.patch) as SettingsKey[];
    return [
        { ...history.document, ...entry.patch },
        history.variants,
        { seq: entry.seq, kind: 'settings', patch: pick(history.document, keys) },
    ];
}


// ============================================================
// Variants
// ============================================================

export function select(history: History, index: number): History {
    const variant = history.document.variants[index];
    if (!variant || variant.id === history.activeId) return history;
    return { ...history, activeId: variant.id };
}

/** Adds a copy of the open variant and opens it, with a history of its own. */
export function addActiveCopy(history: History): History {
    const document = addVariant(history.document, activeIndex(history));
    if (document === history.document) return history;
    return {
        ...history,
        document,
        activeId: document.variants.at(-1)!.id,
        settings: withoutResizes(history.settings),
    };
}

/**
 * Removes a variant and its history. If it was the open one, its left
 * neighbour opens instead — or the new first, when it was the first.
 */
export function remove(history: History, index: number): History {
    const doomed = history.document.variants[index];
    const document = removeVariant(history.document, index);
    if (!doomed || document === history.document) return history;

    const { [doomed.id]: _, ...variants } = history.variants;
    const activeId = doomed.id === history.activeId
        ? document.variants[Math.max(index - 1, 0)].id
        : history.activeId;

    return {
        ...history,
        document,
        activeId,
        variants,
        settings: withoutResizes(history.settings),
    };
}
