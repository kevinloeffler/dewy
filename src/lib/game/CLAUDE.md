# Game

This directory holds all files related to the game.

The game mechanics are documented in `./game-mechanics.md`
The robot api is documented in `./robot.md`

Three.js 3D models are stored in the `./models` directory.

`decorations.ts` is the footprint math for `Level.decorations` — the one place
that turns a piece's stored corner and facing back into the tiles it covers.
The renderer, the editor and the engine all read it through there.

`sensors.ts` is the zone math for `Level.motionSensors` — a sensor is stored as
the tile it hangs over plus an odd width and depth, and this is the one place that
turns that into the tiles it watches. Engine, renderer and editor all read it.

`level.ts` is an immutable serializable type definition. A `Level` is **one
playable world**; the database stores a `LevelDocument` — the shared settings
(texts, size, options, goals) plus 1 to 9 `variants`, each a layout (tiles,
items, decorations, sensors, robot). `variants.ts` turns one back into the
other: `variantLevel(document, i)` is the only way a variant becomes playable,
so the engine, the renderer and every editor operation keep working on a single
world. Goals are stored once but resolved per world by `effectiveGoals`, so
each variant asks only for the bays and goal tile it has.
`level-state.ts` holds the runtime state of the game and is not persisted.

`run.ts` runs a program headless on one world — the same engine and
interpreter with `nullPlayer` — which is how the player checks the variants
that are not on screen.

`editor/history.ts` is the designer's undo history: one stack per variant plus
one for the shared settings, so nothing is undone out of sight. It is pure;
`editor/draft.svelte.ts` only keeps the current state in a rune. Document-level
edits — `syncReachGoal`, `addVariant`, `resizeDocument`, `setDocumentBayGoal` —
live in `editor/operations.ts` beside the per-world ones.

`environment.ts` plans the world around a level — the two backdrop walls and
what hangs on them, the yard behind them, and the street of facades that ends
the world. It is pure and seeded from `level.id` (via `random.ts`), so a level
always looks the same and two levels look different; only `id`, `width` and
`height` feed it. `models/environment.ts` turns a plan into meshes, merged by
material with `mergeStatic`. `World` keeps it in its own root, out of the
designer's picking, and rebuilds it only when `environmentKey` changes.
