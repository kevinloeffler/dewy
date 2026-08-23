# Robot API Reference

## Spatial Model

Every interaction acts on the **tile directly ahead** in the robot's facing direction.  
The robot's current tile is always just the robot — it never shares a tile with a crate.

| Action | Tile affected |
|--------|--------------|
| `moveForward()` | Tile ahead |
| `pick()` | Tile ahead |
| `drop()` | Tile ahead |
| `open()` | Tile ahead |
| `toggle()` | Tile ahead |
| All sensing functions | Tile ahead |

---

## Items & Carrying

- The robot can carry **one crate at a time** — held visibly in hand
- **Keycards** are never held — they are silently pocketed into inventory when picked up
- The robot can hold a crate and have keycards in inventory simultaneously
- Doors can be opened and switches toggled while carrying a crate

---

## Movement

### `moveForward()`
Move one tile in the current facing direction.  
If a pushable crate is ahead and the tile behind it is free, the crate is pushed.

**Crashes if:**
- Tile ahead is a wall, closed door, world edge, or pit
- Tile ahead is a switch, or a cargo belt (crates only)
- Tile ahead has a crate with no free tile behind it, or a crate already delivered

Pushing a crate onto a matching drop-off bay **delivers** it, exactly as `drop()` would.

---

### `turnLeft()`
Rotate 90° counter-clockwise. Robot stays on its current tile.

---

### `turnRight()`
Rotate 90° clockwise. Robot stays on its current tile.

---

## Interaction

### `pick()`
Interact with the item on the tile ahead:
- **Crate** → picked up into hand, robot now carries it
- **Keycard** → silently pocketed into inventory

**Crashes if:**
- Tile ahead has no crate or keycard
- Tile ahead has a crate and robot is already carrying a crate
- Tile ahead has a crate that has already been delivered

A keycard is pocketed even while carrying a crate, and a tile holding both a
crate and a keycard gives up the crate first.

---

### `drop()`
Place the carried crate onto the tile ahead.  
If the tile ahead is a matching drop-off bay the level goal is updated.

**Crashes if:**
- Robot is not carrying a crate
- Tile ahead cannot hold a crate: another crate, a wall, a closed door, a pit,
  a switch, a robot gap, or the world edge

A bay that does not accept the crate is **not** a crash — the crate is simply
placed there, so it can be picked back up and taken somewhere else.

---

### `open()`
Unlock the door on the tile ahead using the matching keycard from inventory.  
The keycard is consumed on use.

**Crashes if:**
- Tile ahead is not a door
- Inventory does not contain the matching keycard

---

### `toggle()`
Flip the switch on the tile ahead on or off.  
Affects the switch's linked door, motion sensor, or conveyor belt.

**Crashes if:**
- Tile ahead is not a switch

---

## Sensing

Sensing functions are introduced at **Stage 3** when conditionals are taught.  
All sensing functions check the tile directly ahead unless otherwise noted.

| Function | Checks | Returns |
|----------|--------|---------|
| `isBlocked()` | Tile ahead | `boolean` |
| `isCrate()` | Tile ahead | `boolean` |
| `isCarrying()` | Robot's hand | `boolean` |
| `isGoal()` | Current tile | `boolean` |
| `isDropOff()` | Tile ahead | `boolean` |
| `crateColor()` | Carried crate | `string | null` |
| `isDangerous()` | Tile ahead | `boolean` |

---

### `isBlocked()`
Returns `true` if moving forward would crash the robot.  
A pushable crate with free space behind it returns `false` — the robot can move there.

This is about **physical** obstruction only. A motion sensor's forbidden zone is
walkable floor that happens to be fatal, so it does not count as blocked —
that is what `isDangerous()` is for.

**Returns:** `boolean`

---

### `isCrate()`
Returns `true` if there is a crate (grey or colour) on the tile ahead.

**Returns:** `boolean`

---

### `isCarrying()`
Returns `true` if the robot is currently holding a crate.  
Checks the robot's hand, not inventory — keycards do not affect this.

**Returns:** `boolean`

---

### `isGoal()`
Returns `true` if the robot is standing on the target square.  
This is the one sensing function that checks the **current tile**, not the tile ahead —  
the robot reaches the goal by standing on it.

**Returns:** `boolean`

---

### `isDropOff()`
Returns `true` if the tile ahead is a drop-off bay for cargo delivery.  
Plain bays accept any crate, colour bays only accept the matching colour.

**Returns:** `boolean`

---

### `crateColor()`
Returns the colour label of the crate the robot is currently carrying,  
or `null` if carrying a grey (unlabelled) crate or not carrying anything.

**Returns:** `string | null`  
**Example values:** `"red"`, `"blue"`, `"green"`, `null`

---

### `isDangerous()`
Returns `true` if the tile ahead is inside the forbidden zone of an **active**
motion sensor. A sensor switched off by a linked switch or pressure plate is
safe to walk through, and reports `false`.

**Returns:** `boolean`

---

## Crash Model

All invalid actions crash the robot immediately:
- Execution halts at the offending line
- The line indicator turns red
- A friendly error message explains what went wrong
- The robot plays a panic animation

---

## Language Stages

The JavaScript subset is introduced gradually across levels:

| Stage | Feature | Example |
|-------|---------|---------|
| 1 | Sequencing | `moveForward();` |
| 2 | `repeat(n)` | `repeat(4) { moveForward(); }` |
| 3 | `if` / `else` + sensing | `if (isBlocked()) { turnLeft(); }` |
| 4 | `while` | `while (!isGoal()) { moveForward(); }` |
| 5 | Functions | `function deliver() { ... }` |

---

## Full Example

```js
// Stage 1 — pure sequencing
moveForward();
pick();
turnRight();
moveForward();
drop();

// Stage 2 — repeat loop
repeat(4) {
    moveForward();
}

// Stage 3 — sensing and conditionals
if (isBlocked()) {
    turnLeft();
} else {
    moveForward();
}

// Stage 3 — colour sorting
pick();
if (crateColor() === "red") {
    turnLeft();
} else {
    turnRight();
}
moveForward();
drop();

// Stage 4 — navigate to target square
while (!isGoal()) {
    if (isBlocked()) {
        turnLeft();
    } else {
        moveForward();
    }
}

// Stage 4 — navigate to drop-off bay and deliver
while (!isDropOff()) {
    moveForward();
}
drop();

// Stage 5 — functions
function deliverCrate() {
    while (!isDropOff()) {
        moveForward();
    }
    drop();
}

pick();
deliverCrate();
```