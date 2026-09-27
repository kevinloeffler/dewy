import type { Level } from './level';
import { createRng, hashString, type Rng } from './random';

/**
 * The world around a level: the warehouse's two backdrop walls and what hangs
 * on them, the yard behind them, and the street of neighbouring facades that
 * closes the world off.
 *
 * None of it is authored. It is *invented* here from the level's id, so it is
 * stable — every student sees the same yard on every reload — while two
 * levels still look different. This file only decides where things go; it is
 * pure, so the layout can be tested without WebGL. `models/environment.ts`
 * turns a plan into meshes, the same split as `decorations.ts` and
 * `models/warehouse.ts`.
 *
 * Coordinates are scene units: tile centres at `0..width-1` / `0..height-1`,
 * the level's floor top at y = 0. The back wall's inside face is at
 * z = -0.5 and runs along x; the left wall's is at x = -0.5 and runs along z.
 * The camera looks in from +x/+z, so the other two sides stay open.
 *
 * Only `id`, `width` and `height` are read — tiles never move the scenery,
 * which is what lets `World` keep one build across the designer's strokes.
 */


// ============================================================
// Dimensions
// ============================================================

/**
 * The design kit is authored in metres against a 1.5 m tile; a tile here is
 * one unit. Everything below is the kit's measurement times this.
 */
export const KIT_SCALE = 1 / 1.5;

/** The kit's wall, plus a unit so the room reads as a hall rather than a pen. */
export const WALL_HEIGHT = 3.6 * KIT_SCALE + 1;
export const WALL_THICKNESS = 0.16;
/** Where the inside faces of both walls sit. */
export const WALL_FACE = -0.5;
/** The outside faces. */
export const WALL_OUTSIDE = WALL_FACE - WALL_THICKNESS;

/** Height of the lot outside, flush with the underside of the level's floor slab. */
export const LOT_Y = -0.1;

/** From a wall's inside face to the front of the facades across the street. */
export const STREET = 7;
/** The front line of both facade rows. */
export const FACADE_FRONT = WALL_FACE - STREET;
export const FACADE_DEPTH = 6;

/**
 * How far the facade rows and the lot run past the level, in units. The frame
 * at `maxZoom` 12 on a 3:1 canvas reaches about 42 along a row, so this keeps
 * the world's end off-screen with room to spare.
 */
export const WORLD_REACH = 60;

/** The roll-up door's opening: two tiles, centred on a tile boundary. */
export const DOOR_WIDTH = 2.8 * KIT_SCALE;
/** Half-width of the driveway leading out of it. */
export const DRIVEWAY_HALF = 1.3;
/** The narrowest level whose back wall gets a door — see `planDoor`. */
export const DOOR_MIN_WIDTH = 4;


// ============================================================
// Plan
// ============================================================

export type WallSide = 'back' | 'left';

export type WallPropKind = 'window' | 'vent' | 'sign' | 'pipe_drop';

/**
 * Something hung on a wall. `slot` is the first tile it spans along the
 * wall — x for the back wall, z for the left — and `centre` the scene
 * coordinate along that axis it is centred on.
 */
export type WallProp = {
    kind: WallPropKind;
    wall: WallSide;
    slot: number;
    span: number;
    centre: number;
};

export type YardPropKind =
    | 'forklift'
    | 'pallet_stack'
    | 'hand_truck'
    | 'tote_stack'
    | 'cone'
    | 'barrel'
    | 'guard_rail';

export type YardProp = {
    kind: YardPropKind;
    x: number;
    z: number;
    yaw: number;
    /** Footprint radius the scatter kept clear around it. */
    radius: number;
};

export type FacadeTone = 'greyLight' | 'greyMid' | 'greyDark';

/**
 * One neighbouring building. `start`/`end` run along its row — x for the
 * back row, z for the left row. `door` is the loading door's offset from the
 * frontage's centre, or null for a blank wall. `windows` puts a strip of
 * upper-floor windows along the frontage.
 */
export type Facade = {
    row: WallSide;
    start: number;
    end: number;
    height: number;
    tone: FacadeTone;
    door: number | null;
    windows: boolean;
};

export type EnvironmentPlan = {
    width: number;
    height: number;
    /** Centre x of the roll-up door in the back wall, or null for a solid wall. */
    door: number | null;
    wallProps: WallProp[];
    yardProps: YardProp[];
    facades: Facade[];
};

/** What decides a plan. Equal keys, equal plans. */
export function environmentKey(level: Pick<Level, 'id' | 'width' | 'height'>): string {
    return `${level.id}:${level.width}x${level.height}`;
}

export function planEnvironment(level: Pick<Level, 'id' | 'width' | 'height'>): EnvironmentPlan {
    const { width, height } = level;

    // Each part draws from its own stream: resizing a level should not
    // reshuffle the facades just because the wall grew a vent.
    const fork = (salt: string) => createRng(hashString(`${level.id}#${salt}`));

    const door = planDoor(width, fork('door'));
    return {
        width,
        height,
        door,
        wallProps: planWallProps(width, height, door, fork('walls')),
        yardProps: planYard(width, height, door, fork('yard')),
        facades: planFacades(width, height, door, fork('facades')),
    };
}


// ============================================================
// Walls
// ============================================================

/**
 * The door spans the two tiles either side of boundary `b` and keeps a whole
 * tile clear of each end of the wall, so its jambs never crowd the corner.
 */
function planDoor(width: number, rng: Rng): number | null {
    if (width < DOOR_MIN_WIDTH) return null;
    const boundary = rng.int(2, width - 2);
    return boundary - 0.5;
}

/** The two slots a door at `door` covers. */
export function doorSlots(door: number): [number, number] {
    const boundary = door + 0.5;
    return [boundary - 1, boundary];
}

type PropSpec = { kind: WallPropKind; wall: WallSide; span: number };

function planWallProps(width: number, height: number, door: number | null, rng: Rng): WallProp[] {
    const taken: Record<WallSide, boolean[]> = {
        back: Array(width).fill(false),
        left: Array(height).fill(false),
    };
    if (door !== null) for (const slot of doorSlots(door)) taken.back[slot] = true;

    // Biggest first, so the packer is never left with only one-slot holes
    // for a window.
    const specs: PropSpec[] = [];
    for (let i = rng.int(height >= 3 ? 1 : 0, Math.floor(height / 3)); i > 0; i--) {
        specs.push({ kind: 'window', wall: 'left', span: 2 });
    }
    if (rng.chance(0.75)) specs.push({ kind: 'sign', wall: 'back', span: 1 });
    for (const [wall, length] of [['back', width], ['left', height]] as const) {
        for (let i = rng.int(1, Math.max(1, Math.ceil(length / 5))); i > 0; i--) {
            specs.push({ kind: 'vent', wall, span: 1 });
        }
        if (length >= 4 && rng.chance(0.6)) specs.push({ kind: 'pipe_drop', wall, span: 1 });
    }

    const props: WallProp[] = [];
    for (const spec of specs) {
        const slots = taken[spec.wall];
        const starts = rng.shuffle([...Array(Math.max(0, slots.length - spec.span + 1)).keys()]);
        const slot = starts.find((start) => {
            for (let i = start; i < start + spec.span; i++) if (slots[i]) return false;
            return true;
        });
        if (slot === undefined) continue;

        for (let i = slot; i < slot + spec.span; i++) slots[i] = true;
        props.push({ ...spec, slot, centre: slot + (spec.span - 1) / 2 });
    }
    return props;
}


// ============================================================
// Yard
// ============================================================

type Rect = { x0: number; x1: number; z0: number; z1: number };

/** Keep this far from walls, facades and each other. */
const YARD_MARGIN = 0.25;

/** The strip behind each wall, out to the facades, plus the corner they share. */
export function yardZones(width: number, height: number): Record<'back' | 'left' | 'corner', Rect> {
    const near = WALL_OUTSIDE - YARD_MARGIN;
    const far = FACADE_FRONT + YARD_MARGIN;
    return {
        back: { x0: WALL_OUTSIDE, x1: width + 1.5, z0: far, z1: near },
        left: { x0: far, x1: near, z0: WALL_OUTSIDE, z1: height + 1.5 },
        corner: { x0: far, x1: near, z0: far, z1: near },
    };
}

/** The driveway from the door to the street, as the yard must leave it. */
export function drivewayRect(door: number): Rect {
    return { x0: door - DRIVEWAY_HALF, x1: door + DRIVEWAY_HALF, z0: FACADE_FRONT, z1: WALL_OUTSIDE };
}

const YARD_RADIUS: Record<YardPropKind, number> = {
    forklift: 0.9,
    pallet_stack: 0.55,
    hand_truck: 0.3,
    tote_stack: 0.35,
    cone: 0.2,
    barrel: 0.25,
    guard_rail: 0.35,
};

function planYard(width: number, height: number, door: number | null, rng: Rng): YardProp[] {
    const zones = yardZones(width, height);
    const driveway = door === null ? null : drivewayRect(door);
    const props: YardProp[] = [];

    const fits = (x: number, z: number, radius: number, zone: Rect) => {
        if (x - radius < zone.x0 || x + radius > zone.x1) return false;
        if (z - radius < zone.z0 || z + radius > zone.z1) return false;
        if (driveway && x + radius > driveway.x0 && x - radius < driveway.x1
            && z + radius > driveway.z0 && z - radius < driveway.z1) return false;
        return props.every((p) => Math.hypot(p.x - x, p.z - z) >= p.radius + radius + YARD_MARGIN);
    };

    const scatter = (kind: YardPropKind, zone: Rect, yaw = rng.range(-0.5, 0.5)) => {
        const radius = YARD_RADIUS[kind];
        for (let attempt = 0; attempt < 40; attempt++) {
            const x = rng.range(zone.x0 + radius, zone.x1 - radius);
            const z = rng.range(zone.z0 + radius, zone.z1 - radius);
            if (!fits(x, z, radius, zone)) continue;
            props.push({ kind, x, z, yaw, radius });
            return true;
        }
        return false;
    };

    // The forklift waits on the driveway, forks towards the door — placed
    // outright rather than scattered, since the driveway is kept clear of
    // everything else.
    if (door !== null) {
        // Far enough out to clear the wall's sightline: at this camera angle
        // the wall hides everything closer behind it than its own height.
        props.push({ kind: 'forklift', x: door, z: WALL_FACE - WALL_HEIGHT - 1.4, yaw: 0, radius: YARD_RADIUS.forklift });
        for (let i = rng.int(0, 2); i > 0; i--) {
            const side = rng.chance(0.5) ? -1 : 1;
            const x = door + side * (DRIVEWAY_HALF + 0.35);
            const z = rng.range(zones.back.z0 + 0.3, zones.back.z1 - 0.3);
            if (fits(x, z, YARD_RADIUS.cone, zones.back)) props.push({ kind: 'cone', x, z, yaw: rng.range(0, Math.PI), radius: YARD_RADIUS.cone });
        }
    }

    // Barrels huddle in the corner behind the warehouse.
    if (rng.chance(0.8)) {
        for (let i = rng.int(2, 3); i > 0; i--) scatter('barrel', zones.corner, 0);
    }

    // A run of guard rail along the outside of the left wall.
    if (height >= 3 && rng.chance(0.6)) {
        const length = rng.int(2, Math.min(4, height - 1));
        const start = rng.int(0, height - length);
        const x = WALL_OUTSIDE - 0.4;
        for (let z = start; z < start + length; z++) {
            // No yaw: a rail's shape encodes its run — see `buildGuardRail`.
            props.push({ kind: 'guard_rail', x, z, yaw: 0, radius: YARD_RADIUS.guard_rail });
        }
    }

    const clutter: YardPropKind[] = ['pallet_stack', 'pallet_stack', 'hand_truck', 'tote_stack', 'cone', 'cone', 'barrel'];
    for (const [zone, length] of [[zones.back, width], [zones.left, height]] as const) {
        for (let i = rng.int(2, 2 + Math.floor(length / 3)); i > 0; i--) {
            const kind = rng.pick(clutter);
            // Pallets sit square to the wall behind them, like someone put them there.
            scatter(kind, zone, kind === 'pallet_stack' ? rng.range(-0.1, 0.1) : undefined);
        }
    }

    return props;
}


// ============================================================
// Facades
// ============================================================

const FACADE_MIN = 3;
const FACADE_MAX = 8;

function planFacades(width: number, height: number, door: number | null, rng: Rng): Facade[] {
    const facades: Facade[] = [];
    // The back row also covers the corner block, so it starts behind the
    // left row; the left row starts at the back row's frontage.
    const backStart = FACADE_FRONT - FACADE_DEPTH;
    const backEnd = width + WORLD_REACH;
    const leftEnd = height + WORLD_REACH;

    // Leave the street open where the driveway meets it.
    const backRuns: [number, number][] = door === null
        ? [[backStart, backEnd]]
        : [[backStart, door - DRIVEWAY_HALF - 0.4], [door + DRIVEWAY_HALF + 0.4, backEnd]];

    for (const [start, end] of backRuns) fillRow(facades, 'back', start, end, rng);
    fillRow(facades, 'left', FACADE_FRONT, leftEnd, rng);
    return facades;
}

/** Pack `[start, end)` with buildings, with the odd alley between them. */
function fillRow(facades: Facade[], row: WallSide, start: number, end: number, rng: Rng) {
    let cursor = start;
    while (end - cursor > 0.5) {
        let length = rng.range(FACADE_MIN, FACADE_MAX);
        // Never leave a sliver: a remainder too short for a building is
        // absorbed by this one instead.
        if (end - (cursor + length) < FACADE_MIN) length = end - cursor;

        const door = length >= 3.5 && rng.chance(0.6)
            ? rng.range(-(length / 2 - 1.3), length / 2 - 1.3)
            : null;
        facades.push({
            row,
            start: cursor,
            end: cursor + length,
            height: rng.range(3, 4.5),
            tone: rng.pick(['greyLight', 'greyMid', 'greyDark'] as const),
            door,
            windows: rng.chance(0.55),
        });
        cursor += length;
        if (end - cursor > FACADE_MIN + 1 && rng.chance(0.15)) cursor += 1;
    }
}
