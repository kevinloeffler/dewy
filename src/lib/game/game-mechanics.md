# Robot Warehouse Game — Mechanics Reference

## World

- Flat XY tile grid, isometric 3D presentation (purely visual)
- Static, fully visible world — tiles never change state
- Hard crash on all invalid actions — robot panics, execution halts, offending line turns red
- Line-by-line execution with a visible line indicator

---

## Floor Tiles

| Tile | Description |
|------|-------------|
| Floor | Standard walkable tile for robot and crates |
| Pit | No tile — robot crashes if it steps here |
| Conveyor belt | Moves robot and crates one tile in a fixed direction automatically |
| Cargo belt | Conveyor for crates only — robot cannot step on it |

---

## Walls & Structure

| Element | Description |
|---------|-------------|
| Wall | Fully impassable for robot and crates — crash on contact |
| Door | Impassable until unlocked via keycard + `open()`, then passable for both robot and crates |
| Robot gap | A hole in the wall only the robot fits through — crates cannot pass |

---

## Crates

- **Grey crate** — pushable and pickable, no delivery goal, used to activate pressure plates and block paths
- **Colour crate** — pushable and pickable, must be delivered to the matching drop-off bay
- Pushing is implicit — walking into a crate moves it one tile in the robot's facing direction
- A crate pushed into a wall, pit, or another crate crashes the robot
- Crates cannot chain-push other crates — a crate behind a crate is effectively a wall
- The robot can carry at most one crate at a time

---

## Items

| Item | Description |
|------|-------------|
| Keycard | Picked up and held in inventory — consumed by `open()` on a linked door |

---

## Sensors & Triggers

| Element | Description |
|---------|-------------|
| Motion sensor | Has a fixed set of forbidden tiles clearly marked on the map — robot entering any of them fails the level immediately |
| Pressure plate | Active while a robot or crate stands on it — linked to a door, sensor, or conveyor |
| Switch | Flipped via `toggle()` — linked to a door, motion sensor, or conveyor belt |
| Drop-off bay | Goal tile for cargo — plain bays accept any crate, colour bays accept only the matching colour |

---

## Crash Conditions

- Walking into a wall, world edge, or impassable door
- Stepping into a pit
- Pushing a crate into a wall, pit, or another crate
- Entering a motion sensor's forbidden zone
- Calling `open()` without the required keycard
- Calling `pick()` on an empty tile
- Calling `pick()` when already carrying a crate
- Calling `drop()` when not carrying a crate
- Battery runs out — program exceeds the line budget

---

## Optional & Adaptive UI

| Feature | Behaviour |
|---------|-----------|
| Battery / line budget | Maximum number of lines the student can write — counts down in the editor as they type, encourages loops and abstraction |
| Inventory | Shown automatically when the level contains keycards — not a manual designer toggle |

---

## Deferred (not in v1)

- Elevation / height layers
- Fog of war
- Random maps
- Star rating system
- Time limit
- Tiles that change state on repeated visits
- Portals
