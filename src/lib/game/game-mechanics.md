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
| Conveyor belt | Moves robot and crates one tile in a fixed direction automatically. May be driven by a switch or plate |
| Cargo belt | Conveyor for crates only — robot cannot step on it. May be driven the same way |

---

## Belts

A belt carries whatever is standing on it **to the end of the belt** — tile
after tile, until the rider runs off the far end or something stops it. The
whole ride costs nothing beyond the one command that put the robot on the
belt in the first place, and `turnLeft()` on a belt is enough to set it off.
Sensing does not move belts at all.

The ride is not a teleport: the world ticks once per tile. Doors, plates and
deliveries settle between tiles, so a plate the ride crosses can open a door
further down the same belt; a motion sensor fires on a forbidden tile the
ride merely passes **through**; and a goal tile reached mid-ride still counts.

A belt **jams** rather than crashes. A rider whose way is blocked — a wall,
the world edge, a pit, a closed door, a crate that is not itself moving —
simply stays put, and so does whatever is queued behind it. That is what lets
crates pile up at the end of a cargo belt, and it is why nothing in *Crash
Conditions* mentions belts. A jam is not necessarily the end of the ride: a
rider that is freed while the ride is still going carries on.

Riders resolve together, so a line of crates on one belt all advance at once.
Two riders that would trade places, and two belts that feed the same tile,
both stall — neither rider wins, rather than the level turning on which crate
the author happened to place first.

A belt laid out in a ring carries its rider round **one lap** and stops rather
than running forever.

A belt that carries a crate onto a matching bay delivers it, exactly as a push
would.

### Driven belts

A belt may name a **belt id**, which makes it a target a switch or a pressure
plate can drive — the same way one names a door. Every belt tile sharing an id
is one belt and starts, stops and turns round together. A belt with no id
always runs, in the direction it was drawn.

The author picks what an asserted control does to it:

- **power** — the belt stops, or starts. A stopped belt is *inert floor*: it
  carries nothing, but it is not a wall, and the robot may stand on it. A
  stopped cargo belt is still crate-only, since that is the shape of the
  machine rather than its power.
- **reverse** — the belt never stops; it travels the other way instead.

Either way the belt has an authored starting value that the control **inverts**
while it is asserted, exactly as a door does — so "the switch starts the belt"
and "the switch stops the belt" are the same rule with different starting
values.

A belt can be driven by a plate its own ride crosses, which ends the ride
there: the world settles between tiles, so the belt is already dead by the time
the next tile would have been claimed.

---

## Walls & Structure

| Element | Description |
|---------|-------------|
| Wall | Fully impassable for robot and crates — crash on contact |
| Door | Impassable until unlocked via keycard + `open()`, then passable for both robot and crates. A door never closes on a tile the robot or a crate is standing on |
| Robot gap | A hole in the wall only the robot fits through — crates cannot pass |

---

## Decorations

Warehouse furniture. It is authored once and never moves, animates or reacts —
its only rule is that it is **solid**: impassable for the robot and for crates,
exactly like a wall. Unlike a wall it is not a tile, so a single piece can be
several tiles wide.

| Element | Footprint | Description |
|---------|-----------|-------------|
| Pallet | 3 × 2 | Low wooden deck |
| Shelf | 2 × 1 | Pallet racking, taller than the robot |
| Pillar | 1 × 1 | Structural column |
| Guard rail | 1 × 1 | Safety barrier — joins up with the rails beside it into runs, corners and T-junctions |
| Barrel | 1 × 1 | Ribbed drum |
| Cone | 1 × 1 | Traffic cone |
| Tool cart | 1 × 1 | Three-tier trolley |

- A piece is stored as its north-west tile plus a facing; a quarter turn swaps
  the two axes of the footprint, so an east-facing pallet is 2 × 3
- Only the pallet, shelf, guard rail and tool cart look different when turned
- The teacher's brush centres the footprint on the click and slides it back
  onto the grid; it refuses to overlap furniture that is already there

---

## Crates

- **Grey crate** — pushable and pickable, no delivery goal, used to activate pressure plates and block paths. A grey crate is never "delivered", not even on a plain bay — it stays reusable
- **Colour crate** — pushable and pickable, must be delivered to the matching drop-off bay
- A crate reaches a bay either by `drop()` or by being **pushed** onto it — both count as a delivery
- A delivered crate is inert: it still blocks the tile, but it can no longer be pushed or picked up
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
| Motion sensor | A camera hanging from the ceiling over one tile, watching the odd-sized W × D rectangle centred on it (e.g. 3 × 5), its own tile included — robot entering any of those tiles fails the level immediately. It blocks nothing: while switched off, the whole zone is ordinary floor. Only *active* sensors fire; crates are ignored. The zone is marked on the map: **red** while active, **green** while switched off |
| Pressure plate | Active while a robot or crate stands on it — linked to a door, sensor, or belt |
| Switch | Flipped via `toggle()` — linked to a door, motion sensor, or belt. The switch tile is solid: the robot faces it, never stands on it |
| Drop-off bay | Goal tile for cargo — plain bays accept any crate, colour bays accept only the matching colour |

---

## Linked Triggers

A switch or pressure plate names a `targetId` — a door, a motion sensor, or a belt. While any
linked control is **asserted** (switch on, plate held down) the target's authored starting value
is **inverted**. So a door authored closed opens while the plate is pressed, and a door authored
open closes instead — the author picks the polarity by choosing the starting value.

Several controls on one target compose as OR: the second cannot undo the first.
A keycard is different — `open()` unlocks a door permanently, whatever its controls say.

---

## Crash Conditions

- Walking into a wall, world edge, or impassable door
- Walking into a decoration — the crash names the piece ("Da steht ein Regal im Weg")
- Walking into a switch tile, or onto a cargo belt
- Stepping into a pit
- Pushing a crate into a wall, pit, decoration, or another crate
- Entering a motion sensor's forbidden zone
- Calling `open()` without the required keycard
- Calling `pick()` on an empty tile
- Calling `pick()` when already carrying a crate
- Calling `drop()` when not carrying a crate
- Energy runs out — the program used more commands than the battery holds

---

## Optional & Adaptive UI

| Feature | Behaviour |
|---------|-----------|
| Battery / energy | How many commands the robot can run. One robot command — `moveForward`, `turnLeft`, `turnRight`, `pick`, `drop`, `open`, `toggle` — costs one energy; sensing is free. Running out crashes the robot mid-run |
| Memory | How many statements the program may contain. Blank lines and comments are free, and a block costs one plus its body, so `repeat(4) { moveForward(); }` is 2. Checked before the run — an over-budget program can be typed but not run, which pushes students toward loops and functions |
| Inventory | Shown automatically when the level contains keycards — not a manual designer toggle |

A level may set either limit, both, or neither. With no energy set, a runaway
loop still stops at a safety cap of 500 commands — a different message, since
that is a bug in the program rather than a budget the level chose.

---

## Deferred (not in v1)

- Elevation / height layers
- Fog of war
- Random maps
- Star rating system
- Time limit
- Tiles that change state on repeated visits
- Portals
