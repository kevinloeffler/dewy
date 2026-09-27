# Game

This directory holds all files related to the game.

The game mechanics are documented in `./game-mechanics.md`
The robot api is documented in `./robot.md`

Three.js 3D models are stored in the `./models` directory.

`decorations.ts` is the footprint math for `Level.decorations` — the one place
that turns a piece's stored corner and facing back into the tiles it covers.
The renderer, the editor and the engine all read it through there.

`level.ts` is an immutable serializable type definition. This information is stored in the database.
`level-state.ts` holds the runtime state of the game and is not persisted.

`environment.ts` plans the world around a level — the two backdrop walls and
what hangs on them, the yard behind them, and the street of facades that ends
the world. It is pure and seeded from `level.id` (via `random.ts`), so a level
always looks the same and two levels look different; only `id`, `width` and
`height` feed it. `models/environment.ts` turns a plan into meshes, merged by
material with `mergeStatic`. `World` keeps it in its own root, out of the
designer's picking, and rebuilds it only when `environmentKey` changes.
