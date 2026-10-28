import type { Level, LevelDocument } from '$lib/game/level';
import * as H from './history';

/**
 * The designer's working copy of a level, with undo/redo.
 *
 * What it holds is the whole stored document — every variant — but what it
 * hands out as `level` is the open variant, flattened: every operation in
 * `operations.ts` takes and returns one world, and `edit` writes the result
 * back into the variant it came from. The history rules live in `./history`,
 * which is pure; this only keeps the current `History` in a rune.
 *
 * The state is `$state.raw` rather than `$state`: every operation returns a
 * whole new object, so reactivity on reassignment is all that is needed, and
 * a deep rune proxy would only cost — it would also have to be unwrapped with
 * `$state.snapshot` before every `loadLevel` and every `JSON.stringify`,
 * because Three.js and the database want plain objects. Raw state hands out
 * the real object.
 */
export function createLevelDraft(initial: LevelDocument) {
    let history = $state.raw(H.createHistory(initial));
    let saved = $state.raw(initial);
    /** Mid-drag: the state the drag started from and the frame it last showed. */
    let origin: { document: LevelDocument; level: Level; last: Level } | null = null;

    const level = $derived(H.activeLevel(history));

    return {
        /** The open variant, as one playable world. */
        get level() {
            return level;
        },
        /** Every variant and the shared settings — what gets saved. */
        get document() {
            return history.document;
        },
        get activeIndex() {
            return H.activeIndex(history);
        },
        /** Unsaved changes. Compared by reference, which immutability makes exact. */
        get dirty() {
            return history.document !== saved;
        },
        get canUndo() {
            return H.canUndo(history);
        },
        get canRedo() {
            return H.canRedo(history);
        },

        /** `draft.edit((level) => setTile(level, coord, tile))` */
        edit(operation: (level: Level) => Level) {
            // Mid-gesture, `level` is only a preview; an edit made on top of it
            // would be folded into the gesture's entry and lost on `cancel`.
            if (origin !== null) return;
            history = H.edit(history, level, operation(level));
        },

        /** A settings edit made on the whole document, e.g. a shared bay goal. */
        editDocument(operation: (document: LevelDocument) => LevelDocument) {
            if (origin !== null) return;
            history = H.editDocument(history, operation(history.document));
        },

        resize(width: number, height: number) {
            if (origin !== null) return;
            history = H.resize(history, width, height);
        },

        /**
         * Start a gesture that is one history entry however many frames it
         * shows — a drag of the select tool. Returns the level it started
         * from, which every frame of the gesture should be computed against.
         */
        begin(): Level {
            origin ??= { document: history.document, level, last: level };
            return origin.level;
        },

        /** Show `next` mid-gesture without recording it. */
        preview(next: Level) {
            if (origin === null) return;
            origin.last = next;
            const document = H.writeLevel(origin.document, H.activeIndex(history), origin.level, next);
            history = { ...history, document };
        },

        /** End the gesture as a single history entry — none if it moved nothing. */
        commit() {
            if (origin === null) return;
            const start = origin;
            origin = null;
            history = H.commitGesture(history, start, start.last);
        },

        /** Abandon the gesture and put the level back as it was. */
        cancel() {
            if (origin === null) return;
            history = { ...history, document: origin.document };
            origin = null;
        },

        get busy() {
            return origin !== null;
        },

        undo() {
            if (origin !== null) return;
            history = H.undo(history);
        },

        redo() {
            if (origin !== null) return;
            history = H.redo(history);
        },

        /** Open variant `index`. A drag under way is abandoned first. */
        select(index: number) {
            if (origin !== null) this.cancel();
            history = H.select(history, index);
        },

        /** Add a copy of the open variant and open it. */
        addVariant() {
            if (origin !== null) return;
            history = H.addActiveCopy(history);
        },

        /** Remove variant `index` — for good; the page asks first. */
        removeVariant(index: number) {
            if (origin !== null) return;
            history = H.remove(history, index);
        },

        /**
         * Mark a document as the one on disk.
         *
         * Pass the exact document that was submitted, not the current one: a
         * save is a round-trip, and anything painted while it was in flight
         * must stay dirty. This never rewrites the document — it only moves
         * the mark.
         */
        markSaved(state: LevelDocument = history.document) {
            saved = state;
        },
    };
}

export type LevelDraft = ReturnType<typeof createLevelDraft>;
