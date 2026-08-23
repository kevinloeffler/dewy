# Game

This directory holds all files related to the game.

The game mechanics are documented in `./game-mechanics.md`
The robot api is documented in `./robot.md`

Three.js 3D models are stored in the `./models` directory.

`level.ts` is an immutable serializable type definition. This information is stored in the database.
`level-state.ts` holds the runtime state of the game and is not persisted.
