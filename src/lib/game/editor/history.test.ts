import { describe, expect, it } from 'vitest';
import {
    activeIndex,
    activeLevel,
    addActiveCopy,
    canRedo,
    canUndo,
    commitGesture,
    createHistory,
    edit,
    editDocument,
    redo,
    remove,
    resize,
    select,
    undo,
    writeLevel,
    type History,
} from './history';
import { emptyLevel, setDocumentBayGoal, setMeta, setTile } from './operations';
import { singleVariant } from '../variants';
import type { Coord, Level, Tile } from '../level';

const wall: Tile = { kind: 'wall' };
const start = () => createHistory(singleVariant(emptyLevel('test', 'Test')));

/** Paint `tile` at `at` in the open variant. */
const paint = (history: History, at: Coord, tile: Tile = wall) => {
    const from = activeLevel(history);
    return edit(history, from, setTile(from, at, tile));
};

const rename = (history: History, name: string) => {
    const from = activeLevel(history);
    return edit(history, from, setMeta(from, { name }));
};

const tilesOf = (history: History, index = activeIndex(history)) =>
    history.document.variants[index].tiles;

describe('edit, undo, redo', () => {
    it('undoes and redoes a layout edit', () => {
        const painted = paint(start(), { x: 1, y: 1 });
        expect(tilesOf(painted)).toEqual({ '1,1': wall });

        const undone = undo(painted);
        expect(tilesOf(undone)).toEqual({});
        expect(canUndo(undone)).toBe(false);

        const redone = redo(undone);
        expect(tilesOf(redone)).toEqual({ '1,1': wall });
        expect(canRedo(redone)).toBe(false);
    });

    it('records nothing for an edit that changed nothing', () => {
        const history = start();
        const from = activeLevel(history);
        expect(edit(history, from, from)).toBe(history);
        expect(edit(history, from, setTile(from, { x: 1, y: 1 }, { kind: 'floor' }))).toBe(history);
    });

    it('interleaves layout and settings edits in the order they were made', () => {
        let history = paint(start(), { x: 1, y: 1 });
        history = rename(history, 'Neu');
        history = paint(history, { x: 2, y: 2 });

        history = undo(history);
        expect(tilesOf(history)).toEqual({ '1,1': wall });
        expect(history.document.name).toBe('Neu');

        history = undo(history);
        expect(history.document.name).toBe('Test');
        expect(tilesOf(history)).toEqual({ '1,1': wall });

        history = redo(history);
        expect(history.document.name).toBe('Neu');
        expect(tilesOf(history)).toEqual({ '1,1': wall });
    });

    it('drops redo for what is on screen when a new edit is made', () => {
        let history = undo(paint(start(), { x: 1, y: 1 }));
        history = paint(history, { x: 2, y: 2 });
        expect(canRedo(history)).toBe(false);
    });
});

describe('a history per variant', () => {
    /** Variant 1 with a wall at 1,1, then a copy opened as variant 2. */
    const twoVariants = () => addActiveCopy(paint(start(), { x: 1, y: 1 }));

    it('opens the new copy with a history of its own', () => {
        const history = twoVariants();
        expect(activeIndex(history)).toBe(1);
        expect(tilesOf(history)).toEqual({ '1,1': wall });
        expect(canUndo(history)).toBe(false);
    });

    it('never undoes a variant that is not open', () => {
        let history = paint(twoVariants(), { x: 2, y: 2 });
        history = select(history, 0);

        history = undo(history);
        expect(tilesOf(history, 0)).toEqual({});
        expect(tilesOf(history, 1)).toEqual({ '1,1': wall, '2,2': wall });
        expect(canUndo(history)).toBe(false);

        history = undo(select(history, 1));
        expect(tilesOf(history, 1)).toEqual({ '1,1': wall });
    });

    it('undoes settings from any variant, newest first', () => {
        let history = rename(twoVariants(), 'Neu');
        history = select(history, 0);
        history = paint(history, { x: 3, y: 3 });

        history = undo(history);
        expect(tilesOf(history, 0)).toEqual({ '1,1': wall });

        history = undo(history);
        expect(history.document.name).toBe('Test');
    });

    it('forgets the history of a removed variant and opens its neighbour', () => {
        let history = paint(twoVariants(), { x: 2, y: 2 });
        const second = history.document.variants[1].id;

        history = remove(history, 1);
        expect(history.document.variants).toHaveLength(1);
        expect(activeIndex(history)).toBe(0);
        expect(history.variants[second]).toBeUndefined();

        // Variant 1's own history survived.
        expect(tilesOf(undo(history))).toEqual({});
    });

    it('keeps the open variant open when another one is removed', () => {
        let history = addActiveCopy(twoVariants());
        const open = history.activeId;
        history = remove(history, 0);
        expect(history.activeId).toBe(open);
    });
});

describe('resize', () => {
    it('undoes a resize, and the histories it cleared, while nothing has happened since', () => {
        let history = paint(start(), { x: 6, y: 6 });
        history = resize(history, 4, 4);
        expect(tilesOf(history)).toEqual({});
        expect(history.document.width).toBe(4);

        history = undo(history);
        expect(history.document.width).toBe(8);
        expect(tilesOf(history)).toEqual({ '6,6': wall });

        // The paint before it is still there to undo.
        expect(tilesOf(undo(history))).toEqual({});
    });

    it('makes a resize permanent once any variant is edited after it', () => {
        let history = addActiveCopy(start());
        history = resize(history, 6, 6);
        history = paint(select(history, 0), { x: 1, y: 1 });

        // Undoing from variant 2 must not take variant 1's paint with it.
        history = undo(select(history, 1));
        expect(history.document.width).toBe(6);
        expect(tilesOf(history, 0)).toEqual({ '1,1': wall });
    });

    it('stays undoable under a settings edit made after it', () => {
        let history = resize(start(), 6, 6);
        history = rename(history, 'Neu');

        history = undo(undo(history));
        expect(history.document.name).toBe('Test');
        expect(history.document.width).toBe(8);
    });

    it('refuses a size change through edit', () => {
        const history = start();
        const from = activeLevel(history);
        expect(() => edit(history, from, { ...from, width: 5 })).toThrow();
    });
});

describe('document-level settings and drags', () => {
    it('records a shared bay goal as a settings edit', () => {
        let history = paint(start(), { x: 1, y: 1 }, { kind: 'drop_off', color: 'red' });
        history = editDocument(history, setDocumentBayGoal(history.document, 'red', 0));
        expect(history.document.goals).toEqual([{ kind: 'deliver_bays', color: 'red', count: 0 }]);

        history = undo(history);
        expect(history.document.goals).toEqual([]);
        expect(tilesOf(history)).toEqual({ '1,1': { kind: 'drop_off', color: 'red' } });
    });

    it('records a whole drag as one step, not the goal it brought along', () => {
        const history = start();
        const origin = { document: history.document, level: activeLevel(history) };

        // Two frames of a drag, each computed from where it started.
        let previewed: Level = setTile(origin.level, { x: 1, y: 1 }, { kind: 'goal' });
        let dragging = { ...history, document: writeLevel(origin.document, 0, origin.level, previewed) };
        previewed = setTile(origin.level, { x: 2, y: 1 }, { kind: 'goal' });
        dragging = { ...dragging, document: writeLevel(origin.document, 0, origin.level, previewed) };

        const committed = commitGesture(dragging, origin, previewed);
        expect(committed.document.goals).toEqual([{ kind: 'reach_goal' }]);
        expect(committed.settings.past).toEqual([]);

        const undone = undo(committed);
        expect(tilesOf(undone)).toEqual({});
        expect(undone.document.goals).toEqual([]);
    });
});
