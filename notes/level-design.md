# Dewy — Level Design Reference

Everything a level author needs: the language students write, how it is unlocked
stage by stage, the limits a level can set, and the functional elements of the
world and how they behave.

Sources of truth in code: `src/lib/game/level.ts` (data model), `rules.ts` /
`engine.ts` (behaviour), `script/` (language), `goals.ts` (goals),
`editor/operations.ts` / `editor/parse.ts` (limits). The deeper mechanics notes
are `src/lib/game/game-mechanics.md` and `src/lib/game/robot.md`.

---

## 1. The level at a glance

| Setting | Values | Notes |
|---|---|---|
| Grid size | 4 – 24 tiles per side (width and height independent) | Shrinking drops everything outside the new grid; the robot is clamped back inside |
| Robot | one start tile + facing (north/east/south/west) | Exactly one per variant |
| Language stage | 1 – 5 | Gates which language features parse (see §3) |
| Energy (battery) | positive integer, or unlimited | Counts robot commands (see §4) |
| Memory | positive integer, or unlimited | Counts program statements (see §4) |
| Goals | reach goal tile and/or deliver to bays | See §6 |
| Variants | 1 – 9 layouts | One program must solve all of them (see §7) |
| Texts | name, description, Markdown instructions | Instructions can embed images (`/images/…`) |

A new level starts at stage 5 with no energy or memory limit.

---

## 2. The robot's commands

Every command acts on the **tile directly ahead** of the robot — except
`isGoal()`, which checks the tile the robot is standing on. API functions are
bare globals (`moveForward()`, never `robot.moveForward()`) and take no
arguments.

### Actions (cost 1 energy each — except `wait()`)

| Command | What it does | Crash / fumble |
|---|---|---|
| `moveForward()` | Step one tile forward. Walking into a crate **pushes** it one tile | Crashes on anything solid (see §5.1) or a crate that can't move |
| `turnLeft()` / `turnRight()` | Rotate 90° in place | — |
| `pick()` | Pick up the crate ahead (into hand) or pocket a keycard ahead | Fumbles if nothing there, or if already carrying a crate and the item is a crate |
| `drop()` | Put the carried crate on the tile ahead | Fumbles if not carrying; crashes if the tile can't hold a crate |
| `open()` | Unlock the door ahead with its keycard (consumed) | Fumbles if no door ahead or no matching keycard |
| `toggle()` | Flip the switch ahead | Fumbles if no switch ahead |
| `wait()` | Stand still for one tick — the world still ticks (belts move, plates settle) | Costs **no energy**, only memory |

### Sensors (free, unlocked at stage 3)

| Sensor | Checks | Returns |
|---|---|---|
| `isBlocked()` | Would `moveForward()` crash? (physical only — a pushable crate with space behind is *not* blocked; a sensor zone is *not* blocked) | `boolean` |
| `isCrate()` | Crate (grey or colour) ahead | `boolean` |
| `isCarrying()` | Robot holds a crate (keycards don't count) | `boolean` |
| `isGoal()` | Robot is **standing on** a goal tile | `boolean` |
| `isDropOff()` | Drop-off bay ahead (plain, colour or multi) | `boolean` |
| `crateColor()` | Colour of the carried crate | `"red"`, `"green"`, `"blue"`, `"purple"`, `"pink"`, `"yellow"`, or `null` (grey or empty-handed) |
| `isDangerous()` | Tile ahead is in an **active** motion sensor's zone | `boolean` |

There are deliberately **no** sensors for doors, switches, keycards or how full a
multi bay is — which is why those situations fumble instead of crash.

### Crash vs. fumble

- **Crash** — the program was fine, the world said no (collision, fall, caught by
  a sensor, out of energy). Execution stops, the line turns red, the robot panics.
- **Fumble** — a command had nothing to act on. The robot looks confused, a
  warning names the line, the command still costs 1 energy, and **the run
  carries on**. A fumble never changes the world.
- **Script error** — the program itself is wrong (syntax, locked feature, unknown
  command, wrong types). Shown differently from a crash.

---

## 3. The language and its stages

The student language is a JavaScript subset plus one non-JS construct,
`repeat(n) { … }`. It is parsed by the game itself (`src/lib/game/script/`),
so locked features are rejected **before the run**, with a German message naming
the feature ("… sind in diesem Level noch nicht freigeschaltet").

### Stage table

| Stage | Unlocks | Example |
|---|---|---|
| **1** | Sequencing of actions (all 8 actions incl. `wait()`), comments | `moveForward(); turnLeft();` |
| **2** | `repeat(n) { … }` | `repeat(4) { moveForward(); }` |
| **3** | `if` / `else`, `else if`, **all sensors** | `if (isBlocked()) { turnLeft(); } else { moveForward(); }` |
| **4** | `while`, **variables** (`let`, assignment) | `while (!isGoal()) { moveForward(); }` |
| **5** | `function` declarations with parameters, `return` | `function deliver() { … }` |

Stages are cumulative. Calling a sensor below stage 3 is rejected too, so a
stage-1/2 level is genuinely sensor-free — the student has to count.

Expressions (`!`, `&&`, `||`, comparisons, arithmetic, literals) are not gated
on their own; in practice they only become useful once `if`/`while`/`let` are
available.

### What the language contains

- **Statements:** expression call `x();`, `let name = expr;`, `name = expr;`,
  `if (…) {…} else {…}`, `while (…) {…}`, `repeat (expr) {…}`,
  `function name(a, b) {…}`, `return;` / `return expr;`. Braces are required —
  a bare `{ … }` block is an error.
- **Values:** numbers (decimal only, e.g. `3`, `2.5`), strings (`"…"`, `'…'` or
  `` `…` `` — no interpolation), `true`, `false`, `null`, functions.
- **Operators:** `!` and unary `-`; `* / %`; `+ -` (`+` also joins strings);
  `< > <= >=`; `=== !==`; `&&` `||` (short-circuit, return an operand like JS).
- **Comments:** `// line` and `/* block */`.

### What it deliberately does not contain

No `==`/`!=` (an error tells the student to use `===`), no `for`, `const`,
`var`, arrays, objects, `.` property access, `++`/`+=`, `break`/`continue`,
`switch`, arrow functions or a standard library. Commands without parentheses
(`moveForward;`) are an error with a hint.

### Runtime rules

- `repeat(n)`: `n` must be a number ≥ 0; it is rounded down. Any expression
  works, e.g. a variable at stage 4+.
- Arithmetic and `<`-style comparisons need numbers (`+` with a string joins).
- Division / modulo by zero is a script error.
- Robot commands always win over student names: declaring `function moveForward()`
  cannot shadow the real one.
- User functions must be called with exactly as many arguments as parameters.
  Functions are closures; recursion is allowed up to **64 calls deep**.

---

## 4. Limits

| Limit | Set by | Counts | When checked | Effect |
|---|---|---|---|---|
| **Energy** | level (`options.energy`) | 1 per action (`moveForward`, `turnLeft`, `turnRight`, `pick`, `drop`, `open`, `toggle`). Sensing and `wait()` are free. Fumbles still cost 1 | during the run | Running out **crashes** the robot mid-run |
| **Memory** | level (`options.memory`) | Statements, not lines. Blank lines and comments are free. A block costs 1 + its body; `else` is not its own statement | before the run | Over-budget program can be typed but not started |
| Runaway cap | engine (fixed) | Every command incl. `wait()` | during the run | Stops the run at **energy + 500** commands (500 with no energy set) — reported as a bug in the program, not a battery problem |
| Loop cap | interpreter (fixed) | Iterations of one `while`/`repeat` | during the run | **10 000** iterations — catches loops with no actions in them |
| Call depth | interpreter (fixed) | Nested user-function calls | during the run | **64** — catches endless recursion |

Memory examples:

```js
moveForward(); moveForward(); moveForward();   // 3
repeat(3) { moveForward(); }                    // 2
if (isBlocked()) { turnLeft(); } else { moveForward(); }   // 3
```

Design use: energy punishes inefficient routes and "spam and hope"; memory
pushes students toward `repeat`, loops and functions. Either, both or neither
can be set.

---

## 5. Functional elements

### 5.1 Who can pass what

| Element | Robot | Crate | Notes |
|---|---|---|---|
| Floor | ✅ | ✅ | Default for every unset tile |
| **Wall** (generic blocked tile) | 💥 | 💥 | Fully solid |
| Pit | 💥 falls | 💥 | Robot "steps in" and falls; a crate pushed in crashes the robot |
| World edge | 💥 | 💥 | Outside `width`×`height` |
| Door — closed | 💥 | 💥 | |
| Door — open | ✅ | ✅ | |
| Robot gap | ✅ only empty-handed | 💥 | Dewy-shaped hole in a wall |
| Crate gap | 💥 | ✅ | Crate-shaped hole; crates can be pushed, dropped, belted onto and picked from it |
| Conveyor belt | ✅ rides | ✅ rides | |
| Cargo belt | 💥 | ✅ rides | Crate-only, even when stopped |
| Switch | 💥 | 💥 | Solid — the robot faces it and `toggle()`s |
| Pressure plate | ✅ | ✅ | Pressed while robot or crate stands on it |
| Goal tile | ✅ | ✅ | |
| Drop-off bay (plain/colour) | ✅ | ✅ | |
| Multi bay | 💥 | swallowed | Solid for the robot; `isBlocked()` and `isDropOff()` are both true in front of it |
| Motion sensor zone | ✅ but 💥 if active | ✅ ignored | Not a tile — hangs over the floor |
| Decorations (pallet, shelf, pillar, …) | 💥 | 💥 | Purely furniture, behave exactly like walls but can cover several tiles |

A crate can never be pushed into another crate (no chain pushing) — a crate
behind a crate is effectively a wall.

### 5.2 Wall (generic blocked tile)

The basic obstacle. Robot and crates crash into it; `isBlocked()` is true in
front of it. Decorations are the visual alternative with the same rule.

### 5.3 Pit

An authored hole. Walking in makes the robot fall (crash). Pushing or dropping a
crate into it also crashes. `isBlocked()` is true in front of a pit.

### 5.4 Goal tile

The target for the **reach goal** objective. `isGoal()` is true while the robot
stands on it. Reaching it **latches**: once touched, the goal stays satisfied, so a
level can ask "reach the goal *and* deliver the crate" in any order. A belt ride
that passes over it counts.

### 5.5 Crates

| Crate | Pushable | Pickable | Delivery |
|---|---|---|---|
| Grey | ✅ | ✅ | Never — a tool for plates, blocking, belts |
| Colour (red, green, blue, purple, pink, yellow) | ✅ | ✅ | Must reach a matching bay |

- Push: walk into it; it moves one tile in the robot's facing. Crashes if the tile
  behind it is blocked for crates.
- Carry: one crate at a time, via `pick()` / `drop()`. Doors can be opened and
  switches toggled while carrying.
- A tile holding both a crate and a keycard gives up the crate first on `pick()`.

### 5.6 Drop-off bays

- **Plain bay** (`color: null`) — accepts any coloured crate.
- **Colour bay** — accepts only its colour.
- A crate is delivered by `drop()`, by a push, or by a belt carrying it on.
- A delivered crate counts **only while it rests on the bay**: picking or pushing
  it off reopens the goal (the last delivery always sticks, since the level
  completes instantly).
- A wrong-colour or grey crate on a bay is no crash — it just sits there and can
  be picked up again.

### 5.7 Multi bay

A bay switched to a funnel with a **capacity** of 1–99.

- Swallows every crate it accepts; above it a counter shows e.g. `2/5`.
- Swallowing is permanent — the crate cannot come back out.
- It keeps swallowing when full (no sensor could tell the student it's full).
- Wrong colour / grey crates stand in its mouth and can be picked back up.
- Solid for the robot — it delivers by `drop()` or pushing, never by walking in.
- For goals it is **one bay**, filled once it reaches its capacity. A cargo belt
  ending in a multi bay empties into it crate by crate.
- The robot may not start on a multi bay.

### 5.8 Keycard & door

- **Door:** has a `doorId`, optional name, an initial state (open/closed) and a
  purely visual facing. Several tiles can share one `doorId` and act as one door.
- **Keycard:** linked to a `doorId`. `pick()` silently pockets it into the
  inventory (it is never held in hand, so `isCarrying()` is unaffected). The
  inventory UI appears automatically when the level has keycards.
- `open()` facing the door with its keycard **unlocks it permanently** and
  consumes the card — regardless of any switch or plate linked to that door.
- Doors can also be driven by switches/plates (§5.10).
- A door never closes on a tile where the robot or a crate is standing.

### 5.9 Switch & pressure plate

Both name a `targetId`: a door, a driven belt, or a motion sensor.

- **Switch** — solid tile with an initial on/off. `toggle()` flips it.
- **Pressure plate** — walkable; *asserted* while the robot or any crate stands on
  it. A grey crate parked on a plate holds it down permanently.

**Linking rule:** while any linked control is asserted, the target's authored
initial state is **inverted**. So the author picks polarity with the start value:

| Target authored as… | Asserted control makes it… |
|---|---|
| Door closed | open |
| Door open | closed |
| Belt running (power) | stopped |
| Belt stopped (power) | running |
| Belt forward (reverse) | reversed |
| Sensor active | off |
| Sensor off | active |

Several controls on one target combine as **OR** — a second one can't undo the
first. The world "settles" after every command, so a plate stepped on opens its
door before the next command runs.

### 5.10 Conveyor belt & cargo belt

- **Conveyor belt:** carries the robot and crates; **cargo belt:** carries crates
  only — the robot crashes stepping onto it.
- A rider is carried **to the end of the belt**, tile by tile, at no extra energy.
  Any command that ends on a belt (even `turnLeft()` or `wait()`) sets it off;
  sensing does not.
- The world ticks per tile, so plates, doors, sensors, deliveries and goal tiles
  along the route all react mid-ride.
- A belt **jams, never crashes**: a rider blocked by a wall, edge, pit, closed
  door or a non-moving crate simply stops — that's how crates queue up at the end
  of a cargo belt. A freed rider continues.
- Riders on one belt advance together. Two riders swapping places, or two belts
  feeding one tile, both stall (deterministic, independent of placement order).
- A ring belt carries its rider exactly **one lap**.

**Driven belts:** give belt tiles a `beltId` (+ optional name) to make them a
switch/plate target. All tiles with the same id behave as one belt. Choose the
effect:

- **power** — the control starts/stops it. A stopped conveyor is inert floor the
  robot may stand on; a stopped cargo belt is still crate-only.
- **reverse** — the belt always runs; the control flips its direction.

A belt without a `beltId` always runs in its drawn direction.

### 5.11 Motion sensor

A ceiling camera hanging over one tile, watching an **odd** width × depth
rectangle centred on it (1×1, 3×3, 3×5, …).

- If the robot **enters** any zone tile while the sensor is **active**, the level
  fails immediately — even when just passing through on a belt.
- Crates are ignored. The sensor blocks nothing; when off, its zone is ordinary
  floor. What lies beneath it (walls, belts) is irrelevant.
- The zone is drawn red while active, green while off.
- `isDangerous()` reports an active zone ahead; `isBlocked()` does **not**.
- Has a `sensorId` (+ optional name) and initial active state, so it can be
  targeted by switches and plates.
- The robot may not start inside an initially active zone (validation error).

---

## 6. Goals

A level is complete the moment **all** its goals hold — the program stops there.

| Goal | How it is satisfied |
|---|---|
| **Reach goal** | The robot has stood on a goal tile (latches) |
| **Deliver to bays** | Implicit: for every bay colour present, **all** bays of that colour must be filled. The author can only *lower* the count per colour (0 drops it). Adding a bay raises the requirement automatically |

- A plain bay is filled while an accepted crate rests on it; a multi bay once it
  has swallowed its capacity.
- Goals are resolved per variant: "reach goal" only applies to variants that have
  a goal tile; bay goals only to the bay colours a variant contains.
- A level with no effective goals can be played but never finished — validation
  flags it.

---

## 7. Variants

Up to **9** layouts per level. They share name, texts, grid size, energy,
memory, language stage and goals; each has its own tiles, items, decorations,
sensors and robot start.

- The student writes **one** program; the level is solved only when it solves
  **every** variant. The visible one runs animated, the rest headless.
- This is the main tool against counting tiles: only sensor-driven programs
  answer the same way in every world. It makes most sense at stage 3+ — below
  that students have no sensors, so variants must be solvable by the same fixed
  sequence.
- Each variant has its own undo history in the designer.
- Ids (doors, belts, items) are per variant.

---

## 8. Validation (what the designer warns about)

- Switch or plate linked to nothing, or to an id that is no door, belt or sensor
- Two doors / belts / sensors with the same name
- Keycard not linked to an existing door
- Duplicate item, decoration or sensor ids; two items on one tile; two sensors
  over one tile
- Items, decorations, sensors or robot outside the grid; items or robot inside a
  decoration; overlapping decorations
- Robot starting on a multi bay, or in an active sensor zone
- No goals at all; "reach goal" without any goal tile
- Not enough crates: each colour needs at least the crates its required bays
  consume (multi bays count their full capacity); plain bays take only colour
  crates not already needed elsewhere. Grey crates never count.

---

## 9. Design tips

- **Stages 1–2** (no sensors): the solution is a fixed sequence. Use memory limits
  to force `repeat`; keep layouts readable so students can count.
- **Stage 3**: introduce sensors with `if`. Variants become meaningful — vary the
  wall position or the crate colour so a fixed sequence fails.
- **Stage 4**: `while (!isGoal())`, wall-following, "walk until drop-off". Vary
  corridor lengths across variants.
- **Stage 5**: repeated sub-tasks (multiple deliveries) plus a tight memory limit
  make functions pay off.
- Use energy to punish wandering, but leave headroom — fumbles cost energy too.
- Prefer fumble-style situations (no keycard, nothing to pick) for teaching; save
  crashes for real collisions the student could have sensed.
- Remember what students **cannot** sense: doors, switches, keycards, plates,
  belts, multi-bay fill level. Puzzles around those must be solvable by reading
  the map, not by asking the robot.
