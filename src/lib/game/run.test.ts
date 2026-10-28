import { describe, expect, it } from 'vitest';
import { addVariant, emptyLevel, replaceVariant, setRobot, setTile } from './editor/operations';
import { runHeadless } from './run';
import { singleVariant, variantLevels } from './variants';
import type { LevelDocument } from './level';

/** Two corridors, the goal three tiles away in one and five in the other. */
function corridors(): LevelDocument {
    const empty = setRobot(emptyLevel('c', 'C'), { x: 0, y: 0 }, 'east');
    const near = setTile(empty, { x: 3, y: 0 }, { kind: 'goal' });
    // Written in the way the designer does, so the goal tile brings `reach_goal`.
    let document = addVariant(replaceVariant(singleVariant(empty), 0, near), 0);
    document = replaceVariant(document, 1, setTile(near, { x: 3, y: 0 }, { kind: 'floor' }));
    document = replaceVariant(document, 1, setTile(variantLevels(document)[1], { x: 5, y: 0 }, { kind: 'goal' }));
    return { ...document, options: { ...document.options, languageStage: 4 } };
}

const statuses = (document: LevelDocument, code: string) =>
    Promise.all(variantLevels(document).map((level) => runHeadless(level, code))).then((results) =>
        results.map((result) => result.status),
    );

describe('runHeadless', () => {
    it('solves every variant with a program that asks', async () => {
        expect(await statuses(corridors(), 'while (!isGoal()) { moveForward(); }')).toEqual([
            'complete',
            'complete',
        ]);
    });

    it('solves only the variant a counted program was written for', async () => {
        expect(await statuses(corridors(), 'repeat(3) { moveForward(); }')).toEqual([
            'complete',
            'finished',
        ]);
    });

    it('stops each variant the moment its own goal is reached', async () => {
        // Nine steps would run into the wall in both — but each is solved first.
        expect(await statuses(corridors(), 'repeat(9) { moveForward(); }')).toEqual([
            'complete',
            'complete',
        ]);
    });

    it('crashes into the world like the animated run does', async () => {
        expect(await statuses(corridors(), 'turnLeft();\nmoveForward();')).toEqual(['crash', 'crash']);
    });

    it('keeps to the level’s battery', async () => {
        const document = corridors();
        const tight = { ...document, options: { ...document.options, energy: 4 } };
        expect(await statuses(tight, 'while (!isGoal()) { moveForward(); }')).toEqual([
            'complete',
            'crash',
        ]);
    });
});
