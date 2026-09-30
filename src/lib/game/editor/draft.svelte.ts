import type { Level } from '$lib/game/level';

const HISTORY_LIMIT = 50;

/**
 * The designer's working copy of a level, with undo/redo.
 *
 * The level is held in `$state.raw` rather than `$state`: every operation in
 * `operations.ts` returns a whole new `Level`, so reactivity on reassignment
 * is all that is needed, and a deep rune proxy would only cost — it would
 * also have to be unwrapped with `$state.snapshot` before every `loadLevel`
 * and every `JSON.stringify`, because Three.js and the database want plain
 * objects. Raw state hands out the real object.
 *
 * That immutability is also what makes history cheap: the undo stack is just
 * an array of past `Level` references, sharing all the structure they have in
 * common.
 */
export function createLevelDraft(initial: Level) {
    let level = $state.raw(initial);
    let saved = $state.raw(initial);
    let past = $state.raw<Level[]>([]);
    let future = $state.raw<Level[]>([]);
    /** The level a drag started from, while one is under way. See `begin`. */
    let origin: Level | null = null;

    /**
     * Record a new level.
     *
     * An operation that changed nothing returns the level it was given, so
     * the reference check here is what stops a drag that re-paints the same
     * tile from filling the history with identical entries.
     */
    function apply(next: Level) {
        // Mid-gesture, `level` is only a preview; an edit made on top of it
        // would be folded into the gesture's entry and lost on `cancel`.
        if (next === level || origin !== null) return;
        past = [...past.slice(-(HISTORY_LIMIT - 1)), level];
        future = [];
        level = next;
    }

    return {
        get level() {
            return level;
        },
        /** Unsaved changes. Compared by reference, which immutability makes exact. */
        get dirty() {
            return level !== saved;
        },
        get canUndo() {
            return past.length > 0;
        },
        get canRedo() {
            return future.length > 0;
        },

        apply,

        /** `draft.edit((level) => setTile(level, coord, tile))` */
        edit(operation: (level: Level) => Level) {
            apply(operation(level));
        },

        /**
         * Start a gesture that is one history entry however many frames it
         * shows — a drag of the select tool. Returns the level it started
         * from, which every frame of the gesture should be computed against.
         */
        begin(): Level {
            origin ??= level;
            return origin;
        },

        /** Show `next` mid-gesture without recording it. */
        preview(next: Level) {
            if (origin === null) return;
            level = next;
        },

        /** End the gesture as a single history entry — none if it moved nothing. */
        commit() {
            if (origin === null) return;
            const start = origin;
            origin = null;
            if (level === start) return;
            past = [...past.slice(-(HISTORY_LIMIT - 1)), start];
            future = [];
        },

        /** Abandon the gesture and put the level back as it was. */
        cancel() {
            if (origin === null) return;
            level = origin;
            origin = null;
        },

        get busy() {
            return origin !== null;
        },

        undo() {
            if (origin !== null) return;
            const previous = past.at(-1);
            if (previous === undefined) return;
            past = past.slice(0, -1);
            future = [level, ...future];
            level = previous;
        },

        redo() {
            if (origin !== null) return;
            const next = future.at(0);
            if (next === undefined) return;
            future = future.slice(1);
            past = [...past, level];
            level = next;
        },

        /**
         * Mark a level as the one on disk.
         *
         * Pass the exact level that was submitted, not the current one: a save
         * is a round-trip, and anything painted while it was in flight must
         * stay dirty. This never rewrites `level` — it only moves the mark.
         */
        markSaved(state: Level = level) {
            saved = state;
        },
    };
}

export type LevelDraft = ReturnType<typeof createLevelDraft>;
