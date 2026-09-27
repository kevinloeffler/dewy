import type { Level, Tile, TileKey } from '$lib/game/level';

/**
 * Tutorial 01 — "First Delivery".
 *
 *       x=0  1  2  3  4  5
 *  y=0   #   #  #  #  #  #
 *  y=1   #   G  .  C  .  #
 *  y=2   #   .  X  X  .  #
 *  y=3   #   .  .  g  .  #
 *  y=4   #   R  .  .  B  #
 *  y=5   #   #  #  #  #  #
 *
 *  # wall · . floor · X pit · G goal · C red crate · g grey crate
 *  B red drop-off bay · R robot start (facing north)
 *
 * The pits block the direct descent, so the crate has to come back down
 * column 4. Solvable in 12 commands against an energy budget of 15.
 */

const tiles: Partial<Record<TileKey, Tile>> = {};

// Perimeter wall. Everything inside is left unauthored — a missing key
// inside the grid is plain floor.
for (let x = 0; x < 6; x++) {
    tiles[`${x},0`] = { kind: 'wall' };
    tiles[`${x},5`] = { kind: 'wall' };
}
for (let y = 1; y < 5; y++) {
    tiles[`0,${y}`] = { kind: 'wall' };
    tiles[`5,${y}`] = { kind: 'wall' };
}

tiles['1,1'] = { kind: 'goal' };
tiles['2,2'] = { kind: 'pit' };
tiles['3,2'] = { kind: 'pit' };
tiles['4,4'] = { kind: 'drop_off', color: 'red' };

export const tutorial01: Level = {
    id: 'tutorial-01',
    name: 'Erste Lieferung',
    description: 'Hol die rote Kiste und stell sie in die rote Abgabestelle. Pass auf die Löcher auf.',
    instructions: null,
    width: 6,
    height: 6,
    tiles,
    items: [
        { kind: 'crate_colour', id: 'crate-red', color: 'red', position: { x: 3, y: 1 } },
        { kind: 'crate_grey', id: 'crate-grey', position: { x: 3, y: 3 } },
    ],
    decorations: [],
    motionSensors: [],
    robot: { position: { x: 1, y: 4 }, facing: 'north' },
    options: { energy: 15, memory: null, showInventory: false, languageStage: 1 },
    goals: [
        { kind: 'reach_goal' },
        { kind: 'deliver_specific', color: 'red', dropOffPosition: { x: 4, y: 4 } },
    ],
};
