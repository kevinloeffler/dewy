# Level variants — implementation plan

> **Status (2026-10-28): implemented.** Differences from the plan below:
> - The undo rules live in a pure `editor/history.ts`; `draft.svelte.ts` is a thin rune wrapper.
> - `syncReachGoal` moved to document level in `editor/operations.ts` (the per-world `setTile` / `resize` no longer sync).
>   Undoing a layout edit re-syncs instead of storing goals in variant entries.
> - Resize clears the variant histories, which its entry keeps, and undoing it restores them.
> - The player checks **every** variant headless, the visible one included, and withholds the visible mark until its
>   animation ends. That way a run cut short by Reset or a switch still has all its marks.
> - Switching variants never replays (as decided). The marks stay; Start runs everything again.

One level, up to 9 worlds. Everything in the right panel stays global (name,
description, instructions, world size, options, goals); only the layout
varies. The student's code is shared, every Run runs it against every variant,
and the level is complete only when every variant completes.

## Decisions (agreed)

- **Variant chips:** numbered chips `1 … 9` in the top-right corner of the world, no
  thumbnails. Designer: a `+` above them. Hidden when a level has only one
  variant, so existing levels look exactly as they do today.
- **Goals:** the rules are global but resolved **per variant**, against that
  variant's own tiles. A red bay only in variant 1 is a goal only in variant 1.
- **Run:** the visible variant animates as it does today. All other variants
  run headless on Run and get ✓/✗ straight away. The visible chip gets its
  badge when its animation ends.
- **Switching variants never replays.** It shows the chosen variant in its
  initial state. Its badge stays, and pressing Start runs everything again.
- **Undo is per variant:** nothing is ever undone in a variant that isn't on screen.

---

## 1. Data model (`src/lib/game/level.ts`)

`Level` keeps its meaning: **one playable world**. The engine, `rules.ts`,
`goals.ts`, `sensors.ts`, `world.ts` and every editor operation keep taking a
`Level` and stay untouched. A new stored type wraps it:

```ts
/** The part of a level that differs between variants. */
export type LevelVariant = {
    /** Stable, so undo histories and Svelte keys survive a deleted variant. */
    id: string;
    tiles: Partial<Record<TileKey, Tile>>;
    items: Item[];
    decorations: Decoration[];
    motionSensors: MotionSensor[];
    robot: RobotConfig;
};

/** What the database stores: global settings plus 1–9 variants. */
export type LevelDocument = Omit<Level, keyof Omit<LevelVariant, 'id'>> & {
    variants: LevelVariant[];
};

export const MAX_VARIANTS = 9;
```

New pure module `src/lib/game/variants.ts`:

- `variantLevel(doc, index): Level`: globals plus `variants[index]`, flattened.
  This is the only way a variant becomes playable.
- `withVariant(doc, index, level): LevelDocument`: writes an edited `Level`
  back: layout fields into `variants[index]`, global fields onto the document.
  This keeps every operation in `operations.ts` working unchanged.
- `addVariant(doc, fromIndex)`: duplicates a variant with a new id. A no-op at
  `MAX_VARIANTS`.
- `removeVariant(doc, index)`: refused when it is the last one.
- `resizeDocument(doc, w, h)`: runs the existing `resize` on every variant.
- `nextVariantId(doc)`: `v1`, `v2`, …

Ids inside a variant (doors, belts, items, sensors) are per variant. The engine
only ever sees one variant, and a duplicate keeps its copied ids, which is fine.

## 2. Goals per variant

`effectiveGoals(level)` already reads the variant's tiles when it gets a
flattened `Level`, so bay goals become per-variant automatically. Two gaps:

- **`reach_goal`:** make it resolve like the bays. It applies to a variant only if
  that variant has a goal tile (`effectiveGoals` drops it otherwise).
- **`syncReachGoal`** (in `operations.ts`) decides from the one variant it sees.
  Deleting the goal tile in variant 2 would drop the goal for variant 1. Move
  the sync up to the document level: after `withVariant`, compare "any variant
  has a goal tile" before and after. The per-`Level` version stays for
  single-world callers, or is removed if nothing else uses it.
- **Bay override UI (`GoalEditor`):** list the colours present in *any* variant.
  The count's upper bound is the largest total across variants. `bayGoals`'s
  existing `min(count, total)` clamps per variant.
- The student's goal list shows the **visible variant's** goals, which is what
  `hud.goals` already does once it runs on `variantLevel(doc, active)`.

## 3. Parsing and validation

- `parse.ts`: `parseLevel` parses a `LevelDocument`: the global fields as
  today, `variants` of length 1–`MAX_VARIANTS` with unique ids, and each
  variant's layout through the existing field parsers. It refuses the old flat
  shape (the migration guarantees none remain in the DB).
  `parseLevelJson` (import) is the one place worth accepting the legacy shape,
  by wrapping it into one variant, so exported files keep working.
- `validateLevel` stays per world. Add `validateDocument(doc)`, which runs it on
  every variant and prefixes problems with `Variante n: …` when there is more
  than one. "No level goal" becomes per variant. This feeds the designer's
  `ValidationList` and `levels.ts` metadata (`problems`).

## 4. Migration

`scripts/data-migrations/0003_level_variants.js`:

```js
export function up(db) {
    const rows = db.prepare('select id, data from level').all();
    const update = db.prepare('update level set data = ? where id = ?');
    for (const row of rows) {
        const { tiles, items, decorations, motionSensors, robot, ...rest } = JSON.parse(row.data);
        const data = { ...rest, variants: [{ id: 'v1', tiles, items, decorations, motionSensors, robot }] };
        update.run(JSON.stringify(data), row.id);
    }
}
```

There's no schema migration, because `level.data` stays a JSON text column.
Only its `$type<…>` in `schema.ts` changes to `LevelDocument`.

## 5. Server

Mostly type changes. `Level` becomes `LevelDocument` in:

- `src/lib/server/levels.ts`: create/read/save. `createLevel` uses an
  `emptyDocument` (from `emptyLevel` wrapped into one variant). `problems`
  uses `validateDocument`.
- `src/lib/server/courses.ts`: item loading and `duplicateCourse` / `copyLevel`
  copy `data` whole, so variants come along for free.
- `src/lib/game/levels/tutorial-01.ts` and `index.ts`: wrap into one variant.
- `/designer/[id]` save action: validation already goes through `parseLevel`.

The `complete` action on the item route is unchanged. The client only posts it
when every variant passes, the same trust it has today.

## 6. Player (`LevelPlayer.svelte`)

### Headless runner: `src/lib/game/run.ts`

```ts
/** Runs `code` on one variant without animation, for its ✓/✗. */
export async function runHeadless(level: Level, code: string): Promise<RunResult>
```

This is a fresh `GameEngine(level, { energy })`, a `createRobotApi` with an
`EventPlayer` whose methods resolve immediately, and `runScript`. The
interpreter already yields periodically and the 500-command cap still applies,
so nine runs stay cheap and an infinite loop can't freeze the tab. It's pure
enough to unit-test next to `engine.test.ts`.

### State

- `props.level` becomes a `LevelDocument`. `active` is the visible variant
  index, and `level = $derived(variantLevel(doc, active))`.
- `results = $state<(RunResult['status'] | null)[]>`, one per variant.
- `stale`: set when `code` changes after a run. Chips grey out.

### Run (shared by Run, Step and Cmd+Enter in `begin()`)

1. Gate on memory, as today. A parse error shows as it does now, with no badges.
2. Clear `results`. Start `runHeadless` for every variant except `active`,
   and write each result into `results` as it lands.
3. Start the animated `execute()` on `active`, unchanged.
4. In `report()`: write `results[active]`. Then:
   - **All complete:** celebrate and call `oncomplete`, as today.
   - **Visible complete, others not:** no celebration. Show a notice
     *"Variante 1 geschafft – 2 Varianten noch nicht"* and highlight the ✗ chips.
   - **Visible failed:** today's crash/error handling.

Step uses the same `begin()`, so the hidden variants get their badges on the
first Step too. That's one code path instead of two, and stepping one world
while knowing the others' outcome is useful.

### Switching

`select(index)` → `reset()` (aborts a running animation), build a new `GameEngine`
on the new variant, `world.loadLevel(...)`, `sync()`. Badges stay. There's no replay,
and notices/line markers clear because they belonged to the other variant.
Fumble warnings and the console only ever come from the animated variant.

### `VariantChips.svelte` (new, shared with the designer)

```ts
props: {
    count: number;
    active: number;
    results?: (RunResult['status'] | null)[];
    stale?: boolean;
    onselect: (index: number) => void;
    onadd?: () => void;          // designer only; renders the "+"
    ondelete?: (index: number) => void;  // designer only
}
```

It sits in the top-right corner of the world, arranged as a column or wrapping row.
It isn't rendered when `count === 1` and there is no `onadd`.

## 7. Designer

### Draft (`draft.svelte.ts`)

The draft holds a `LevelDocument` plus the active variant id, and still exposes
`draft.level` (= `variantLevel(doc, active)`) and `draft.edit(op)`. So
`DesignerCanvas`, `LevelInspector`, `GoalEditor` and `TilePalette` keep working,
with `edit` routing through `withVariant`.

History is split:

- **Per-variant stacks**, `Map<variantId, { past, future }>` of `LevelVariant`
  snapshots, for layout edits.
- **One settings stack** for global fields (name, description, instructions,
  options, goals), as snapshots of those fields only.
- Each entry gets a sequence number. **Undo takes the newer of the active variant's
  top entry and the settings stack's top entry.** The right panel is always
  visible, so a global undo never changes anything out of sight.
- `edit` classifies the change by what differs: layout → variant stack, global →
  settings stack, both (e.g. `syncReachGoal` on placing the first goal tile) →
  one variant entry that also carries the goals before and after.
- **Resize** touches every variant, so it can't live in one variant's stack.
  It is a settings entry carrying all layouts, and it is **undoable only while
  it is the newest entry anywhere**. Any later layout edit makes it permanent.
  That's the only rule that can't silently undo a later edit in another variant.
- **Add / delete variant** stay outside the history. Add duplicates the active
  variant and switches to it, with an empty history. Delete asks for
  confirmation, drops that variant's stack, and is unavailable for the last variant.
- `begin` / `preview` / `commit` (drag gestures) apply to the active variant. Switching
  variants mid-gesture cancels it.
- `dirty` stays a reference check on the document.

### UI

- `VariantChips` with `onadd` / `ondelete` over `DesignerCanvas`.
- `ValidationList` reads `validateDocument`.
- Test-play goes through the saved level, as today.

## 8. Docs

- `src/lib/game/game-mechanics.md`: new *Variants* section (shared code, per-variant
  goals, complete = all variants) and remove "Random maps" from *Deferred*
  only once randomness lands.
- `src/lib/game/CLAUDE.md`: `variants.ts` and `run.ts`, and "`Level` is one world, the
  database stores `LevelDocument`".
- `CLAUDE.md`: one line under *Database* / *Data migrations* if useful.

## Phases (each shippable)

1. **Model and migration.** `LevelDocument`, `variants.ts`, parse/validate, migration,
   server and tutorial types. Every level has exactly one variant and no UI changes.
   Tests: parse (document, limits, legacy import), `withVariant` round-trip,
   per-variant `effectiveGoals`, document-level `syncReachGoal`.
2. **Player.** `runHeadless`, chips with badges, run/switch logic. Can be tested
   by hand-editing a level's JSON to two variants.
3. **Designer.** Chips with add/delete and the split draft history. Tests for the
   history rules (per-variant undo, settings interleaving, resize barrier). Rune
   files need a `.svelte.test.ts`.
4. **Docs.**

## Open points

- **Resize barrier.** The alternative is "resize clears all undo histories (with
  a confirm if it crops content)". That's simpler but loses undo for resize entirely.
- **Reordering variants.** Not planned for v1, since ids make adding it later cheap.
