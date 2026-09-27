import * as THREE from 'three';
import type { Direction } from '$lib/game/level';
import {
    DOOR_WIDTH,
    DRIVEWAY_HALF,
    FACADE_DEPTH,
    FACADE_FRONT,
    KIT_SCALE,
    LOT_Y,
    WALL_FACE,
    WALL_HEIGHT,
    WALL_OUTSIDE,
    WALL_THICKNESS,
    WORLD_REACH,
    type EnvironmentPlan,
    type Facade,
    type WallProp,
    type WallSide,
    type YardProp,
} from '$lib/game/environment';
import { kitMaterials, type KitMaterials } from '$lib/game/models/palette';
import { createDecoration } from '$lib/game/models/warehouse';
import { mergeStatic } from '$lib/game/three-utils';

/**
 * The meshes for an `EnvironmentPlan`: the warehouse walls and their fittings,
 * the yard, the lot and the street of facades.
 *
 * Ported from the "Warehouse Robot — 3D Kit" design (`buildWarehouseWorld`).
 * The small parts — door, windows, vents, forklift — are built in the kit's
 * own metres inside a group scaled by `KIT_SCALE`, so their numbers stay a
 * straight copy of the kit's; the large ones — walls, lot, facades — are laid
 * out in scene units, since they have to meet the level's grid.
 *
 * The whole thing shares one palette and is merged by `mergeStatic` into a
 * handful of meshes: it is static, never picked, and several hundred parts
 * would otherwise be several hundred draw calls.
 */
export function buildEnvironment(plan: EnvironmentPlan): THREE.Group {
    const m = kitMaterials();
    const root = new THREE.Group();

    root.add(buildLot(plan, m));
    root.add(buildWalls(plan, m));
    root.add(buildPipes(plan, m));
    for (const prop of plan.wallProps) {
        // TEMP: windows disabled. Skipped here rather than in the planner, so
        // their slots stay reserved and every other prop keeps its place.
        if (prop.kind === 'window') continue;
        root.add(onWall(prop.wall, prop.centre, wallProp(prop, m)));
    }
    if (plan.door !== null) root.add(buildDriveway(plan.door, m));
    root.add(buildYard(plan.yardProps, m));
    root.add(buildStreet(plan, m));

    const merged = mergeStatic(root);
    // Materials no part ended up using (glass on a level with no windows)
    // are not reachable from `merged`, so `clearGroup` would never free them.
    const used = new Set(merged.children.map((mesh) => (mesh as THREE.Mesh).material));
    for (const material of Object.values(m)) if (!used.has(material)) material.dispose();
    return merged;
}


// ============================================================
// Helpers
// ============================================================

type Vec3 = [number, number, number];

function box(parent: THREE.Object3D, material: THREE.Material, size: Vec3, position: Vec3): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position);
    parent.add(mesh);
    return mesh;
}

function add(
    parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    position: Vec3,
    rotation?: Vec3,
): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    if (rotation) mesh.rotation.set(...rotation);
    parent.add(mesh);
    return mesh;
}

/** A group for parts authored in the kit's metres. */
function kitGroup(): THREE.Group {
    const group = new THREE.Group();
    group.scale.setScalar(KIT_SCALE);
    return group;
}

/**
 * Hang `object` on a wall's inside face at `along` (x for the back wall, z
 * for the left one). Wall parts are authored facing +z — out of the wall,
 * into the room — with +x along the wall, so the left wall's are turned a
 * quarter to face +x.
 */
function onWall(wall: WallSide, along: number, object: THREE.Object3D): THREE.Object3D {
    if (wall === 'back') {
        object.position.set(along, 0, WALL_FACE);
    } else {
        object.position.set(WALL_FACE, 0, along);
        object.rotation.y = Math.PI / 2;
    }
    return object;
}


// ============================================================
// Ground
// ============================================================

/**
 * Where the lot ends: flush with the back of the facade rows. Any further and
 * it shows as a strip of ground above the rooftops, where the sky belongs.
 */
const WORLD_BACK = FACADE_FRONT - FACADE_DEPTH;

/**
 * The lot: one flat sheet around the level with a hole cut exactly where the
 * level stands, so a pit still drops through to the void below instead of
 * filling in with ground.
 */
function buildLot(plan: EnvironmentPlan, m: KitMaterials): THREE.Object3D {
    // Drawn in the shape's x/y plane with y = -z, then laid flat.
    const rect = (x0: number, z0: number, x1: number, z1: number, path: THREE.Path) => {
        path.moveTo(x0, -z0);
        path.lineTo(x1, -z0);
        path.lineTo(x1, -z1);
        path.lineTo(x0, -z1);
        path.lineTo(x0, -z0);
        return path;
    };
    const shape = rect(WORLD_BACK, WORLD_BACK, plan.width + WORLD_REACH, plan.height + WORLD_REACH, new THREE.Shape()) as THREE.Shape;
    shape.holes.push(rect(-0.5, -0.5, plan.width - 0.5, plan.height - 0.5, new THREE.Path()));

    const geometry = new THREE.ShapeGeometry(shape);
    geometry.rotateX(-Math.PI / 2);
    const lot = new THREE.Mesh(geometry, m.grass);
    lot.position.y = LOT_Y;
    return lot;
}


// ============================================================
// Walls
// ============================================================

/** The top of both walls, from the lot up. */
const WALL_TOP = LOT_Y + WALL_HEIGHT;
const JAMB = 0.16 * KIT_SCALE;
const DOOR_HALF = DOOR_WIDTH / 2 + JAMB;
const DOOR_TOP = 3.22 * KIT_SCALE;

function buildWalls(plan: EnvironmentPlan, m: KitMaterials): THREE.Object3D {
    const g = new THREE.Group();
    const thick = WALL_THICKNESS;
    const centre = WALL_FACE - thick / 2;

    /** A box along `wall` from `a0` to `a1`, pushed `inset` into the room. */
    const run = (wall: WallSide, a0: number, a1: number, y0: number, y1: number, t: number, inset: number, material: THREE.Material) => {
        const length = a1 - a0, mid = (a0 + a1) / 2, y = (y0 + y1) / 2;
        if (wall === 'back') box(g, material, [length, y1 - y0, t], [mid, y, centre + inset]);
        else box(g, material, [t, y1 - y0, length], [centre + inset, y, mid]);
    };

    /** One stretch of wall: shell body and a dark cap. */
    const segment = (wall: WallSide, a0: number, a1: number, y0 = LOT_Y) => {
        run(wall, a0, a1, y0, WALL_TOP, thick, 0, m.wall);
        run(wall, a0, a1, WALL_TOP, WALL_TOP + 0.07, thick + 0.04, 0, m.dark);
    };

    // The back wall runs out over the corner; the left wall stops at it.
    const backEnd = plan.width - 0.5;
    if (plan.door === null) {
        segment('back', WALL_OUTSIDE, backEnd);
    } else {
        const door = plan.door;
        segment('back', WALL_OUTSIDE, door - DOOR_HALF);
        segment('back', door + DOOR_HALF, backEnd);
        segment('back', door - DOOR_HALF, door + DOOR_HALF, DOOR_TOP);
        // A sill across the opening, so the step down to the lot is not a gap.
        run('back', door - DOOR_HALF, door + DOOR_HALF, LOT_Y, 0, thick, 0, m.dark);
        g.add(onWall('back', door, rollupDoor(m)));
    }
    segment('left', WALL_FACE, plan.height - 0.5);

    box(g, m.dark, [0.22, WALL_HEIGHT + 0.07, 0.22], [centre, LOT_Y + (WALL_HEIGHT + 0.07) / 2, centre]);
    return g;
}

/** The kit's roll-up door, rolled part-way down, set in the wall's thickness. */
function rollupDoor(m: KitMaterials): THREE.Object3D {
    const g = kitGroup();
    const W = 2.8, H = 3.0, jamb = 0.16, depth = WALL_THICKNESS / KIT_SCALE;
    const z = -depth / 2;

    for (const x of [-1, 1]) box(g, m.dark, [jamb, H, depth], [x * (W / 2 + jamb / 2), H / 2, z]);
    box(g, m.dark, [W + jamb * 2, 0.22, depth + 0.02], [0, H + 0.11, z]);
    add(g, new THREE.CylinderGeometry(0.19, 0.19, W, 24), m.shell, [0, H - 0.24, z + 0.02], [0, 0, Math.PI / 2]);

    const slat = 0.14, count = 12;
    for (let i = 0; i < count; i++) {
        box(g, i % 3 === 2 ? m.accent : m.shell, [W - 0.02, slat - 0.012, 0.06], [0, H - 0.5 - i * slat, z]);
    }
    box(g, m.dark, [W, 0.09, 0.09], [0, H - 0.5 - count * slat, z]);
    return g;
}


// ============================================================
// Wall fittings
// ============================================================

/** Just under the cap, wherever the wall's top is. */
const PIPE_Y = WALL_TOP - 0.1;
const PIPE_OUT = 0.16 * KIT_SCALE;
const PIPE_R = 0.055 * KIT_SCALE;

/** One pipe run along the top of both walls, bracketed every other tile. */
function buildPipes(plan: EnvironmentPlan, m: KitMaterials): THREE.Object3D {
    const g = new THREE.Group();
    const at = WALL_FACE + PIPE_OUT;
    const backLength = plan.width - 0.5 - at, leftLength = plan.height - 0.5 - at;

    add(g, new THREE.CylinderGeometry(PIPE_R, PIPE_R, backLength, 16), m.greyMid,
        [at + backLength / 2, PIPE_Y, at], [0, 0, Math.PI / 2]);
    add(g, new THREE.CylinderGeometry(PIPE_R, PIPE_R, leftLength, 16), m.greyMid,
        [at, PIPE_Y, at + leftLength / 2], [Math.PI / 2, 0, 0]);
    add(g, new THREE.SphereGeometry(PIPE_R * 1.3, 16, 12), m.greyMid, [at, PIPE_Y, at]);

    for (let i = 1; i < plan.width; i += 2) {
        box(g, m.shell, [0.04, 0.07, PIPE_OUT], [i, PIPE_Y, WALL_FACE + PIPE_OUT / 2]);
    }
    for (let i = 1; i < plan.height; i += 2) {
        box(g, m.shell, [PIPE_OUT, 0.07, 0.04], [WALL_FACE + PIPE_OUT / 2, PIPE_Y, i]);
    }
    return g;
}

/** A fitting in wall-local kit metres: +x along the wall, +z out of it. */
function wallProp(prop: WallProp, m: KitMaterials): THREE.Object3D {
    switch (prop.kind) {
        case 'window':    return clerestoryWindow(m);
        case 'vent':      return louveredVent(m);
        case 'sign':      return wallSign(m);
        case 'pipe_drop': return pipeDrop(m);
    }
}

function clerestoryWindow(m: KitMaterials): THREE.Object3D {
    const g = kitGroup();
    // Clerestory: high up under the pipe run, whatever the wall's height.
    const W = 2.2, H = 0.8, y = (PIPE_Y - 0.3) / KIT_SCALE - H / 2, f = 0.07;

    box(g, m.pane, [W, H, 0.02], [0, y, 0.01]);
    for (const s of [-1, 1]) {
        box(g, m.dark, [W + f, f, 0.06], [0, y + s * H / 2, 0.03]);
        box(g, m.dark, [f, H, 0.06], [s * W / 2, y, 0.03]);
    }
    box(g, m.dark, [0.04, H, 0.05], [0, y, 0.03]);
    box(g, m.shell, [W + 0.14, 0.05, 0.12], [0, y - H / 2 - 0.05, 0.06]);
    return g;
}

function louveredVent(m: KitMaterials): THREE.Object3D {
    const g = kitGroup();
    // The kit's 2.5 m, raised a scene unit for the taller wall.
    const W = 0.9, H = 0.6, y = 2.5 + 1 / KIT_SCALE;

    box(g, m.dark, [W, H, 0.04], [0, y, 0.02]);
    for (let i = 0; i < 5; i++) {
        box(g, m.shell, [W - 0.12, 0.05, 0.06], [0, y - H / 2 + 0.1 + i * 0.1, 0.06]);
    }
    return g;
}

function wallSign(m: KitMaterials): THREE.Object3D {
    const g = kitGroup();
    const y = 2.2;

    box(g, m.accent, [1.1, 0.55, 0.04], [0, y, 0.02]);
    box(g, m.dark, [0.9, 0.36, 0.02], [0, y, 0.05]);
    // Two lines of "lettering", so the face reads as a sign and not a hole.
    box(g, m.shell, [0.6, 0.05, 0.01], [-0.05, y + 0.06, 0.065]);
    box(g, m.shell, [0.4, 0.05, 0.01], [-0.15, y - 0.06, 0.065]);
    add(g, new THREE.SphereGeometry(0.05, 16, 12), m.glass, [0, y + 0.4, 0.05]);
    return g;
}

/** A drop off the top pipe to the floor, with a valve at hand height. */
function pipeDrop(m: KitMaterials): THREE.Object3D {
    const g = kitGroup();
    const po = 0.16, pr = 0.055, top = PIPE_Y / KIT_SCALE, bottom = 0.35, valve = 1.35;

    add(g, new THREE.SphereGeometry(pr * 1.3, 16, 12), m.greyMid, [0, top, po]);
    add(g, new THREE.CylinderGeometry(pr, pr, top - bottom, 16), m.greyMid, [0, (top + bottom) / 2, po]);
    add(g, new THREE.CylinderGeometry(pr * 1.4, pr * 1.4, 0.12, 16), m.greyMid, [0, bottom, po]);
    add(g, new THREE.CylinderGeometry(0.03, 0.03, 0.14, 12), m.greyMid, [0, valve, po + 0.07], [Math.PI / 2, 0, 0]);
    add(g, new THREE.TorusGeometry(0.12, 0.022, 10, 24), m.accent, [0, valve, po + 0.14]);
    return g;
}


// ============================================================
// Yard
// ============================================================

function buildDriveway(door: number, m: KitMaterials): THREE.Object3D {
    const g = new THREE.Group();
    const width = DRIVEWAY_HALF * 2 - 0.2;
    // On through the gap in the facades, down the side street to the block behind.
    const z0 = WALL_OUTSIDE, z1 = FACADE_FRONT - FACADE_DEPTH, length = z0 - z1;
    const top = LOT_Y + 0.05;

    box(g, m.dark, [width, 0.05, length], [door, LOT_Y + 0.025, (z0 + z1) / 2]);
    box(g, m.accent, [width, 0.008, 0.1], [door, top + 0.004, z0 - 0.6]);
    for (const s of [-1, 1]) {
        for (let z = z0 - 1.1; z > z1 + 0.4; z -= 1) {
            box(g, m.shell, [0.07, 0.008, 0.5], [door + s * (width / 2 - 0.1), top + 0.004, z]);
        }
    }
    return g;
}

function buildYard(props: YardProp[], m: KitMaterials): THREE.Object3D {
    const g = new THREE.Group();
    const rails = new Set(props.filter((p) => p.kind === 'guard_rail').map((p) => `${p.x}:${p.z}`));

    for (const prop of props) {
        const object = yardProp(prop, m, rails);
        object.position.set(prop.x, LOT_Y, prop.z);
        object.rotation.y = prop.yaw;
        g.add(object);
    }
    return g;
}

function yardProp(prop: YardProp, m: KitMaterials, rails: Set<string>): THREE.Object3D {
    switch (prop.kind) {
        case 'forklift':     return forklift(m);
        case 'hand_truck':   return handTruck(m);
        case 'pallet_stack': return palletStack(m);
        case 'tote_stack':   return toteStack(m);
        case 'cone':         return createDecoration('cone', {}, m);
        case 'barrel':       return createDecoration('barrel', {}, m);
        case 'guard_rail': {
            // Rails in the yard run along z; join each to its neighbours.
            const connections: Direction[] = [];
            if (rails.has(`${prop.x}:${prop.z - 1}`)) connections.push('north');
            if (rails.has(`${prop.x}:${prop.z + 1}`)) connections.push('south');
            return createDecoration('guard_rail', { connections: connections.length ? connections : ['north', 'south'] }, m);
        }
    }
}

/**
 * The level's pallet is stretched to cover a 3 × 2 footprint; out here it is
 * brought back to the kit's real size against the robot.
 */
function smallPallet(m: KitMaterials): THREE.Object3D {
    const pallet = createDecoration('pallet', {}, m);
    pallet.scale.set(0.3, 0.4, 0.3);
    return pallet;
}
const PALLET_HEIGHT = 0.22 * 0.4;

function palletStack(m: KitMaterials): THREE.Object3D {
    const g = new THREE.Group();
    g.add(smallPallet(m));
    const second = smallPallet(m);
    second.position.y = PALLET_HEIGHT;
    second.rotation.y = 0.06;
    g.add(second);

    for (const x of [-0.2, 0.22]) {
        const t = tote(m);
        t.position.set(x, PALLET_HEIGHT * 2, 0);
        t.rotation.y = x * 0.4;
        g.add(t);
    }
    return g;
}

function toteStack(m: KitMaterials): THREE.Object3D {
    const g = new THREE.Group();
    const lower = tote(m);
    g.add(lower);
    const upper = tote(m);
    upper.position.y = 0.32 * KIT_SCALE;
    upper.rotation.y = 0.12;
    g.add(upper);
    return g;
}

function tote(m: KitMaterials): THREE.Object3D {
    const g = kitGroup();
    const W = 0.6, D = 0.4, H = 0.32, t = 0.02;

    box(g, m.shell, [W, t, D], [0, t / 2, 0]);
    box(g, m.shell, [W, H, t], [0, H / 2, -D / 2 + t / 2]);
    box(g, m.shell, [W, H * 0.55, t], [0, H * 0.275, D / 2 - t / 2]);
    for (const x of [-1, 1]) {
        box(g, m.shell, [t, H, D - t * 2], [x * (W / 2 - t / 2), H / 2, 0]);
        box(g, m.dark, [0.03, 0.03, D + 0.02], [x * (W / 2 + 0.004), H - 0.015, 0]);
    }
    box(g, m.accent, [0.22, 0.1, 0.012], [0, H * 0.34, D / 2 + 0.001]);
    box(g, m.dark, [W + 0.02, 0.03, 0.03], [0, H - 0.015, -D / 2 - 0.004]);
    box(g, m.dark, [W + 0.02, 0.03, 0.03], [0, H * 0.55 - 0.015, D / 2 + 0.004]);
    return g;
}

function handTruck(m: KitMaterials): THREE.Object3D {
    const g = kitGroup();
    const frame = new THREE.Group();

    for (const x of [-1, 1]) {
        add(frame, new THREE.CylinderGeometry(0.024, 0.024, 1.15, 12), m.accent, [x * 0.17, 0.575, 0]);
    }
    for (const y of [0.34, 0.72]) {
        add(frame, new THREE.CylinderGeometry(0.018, 0.018, 0.34, 10), m.accent, [0, y, 0], [0, 0, Math.PI / 2]);
    }
    add(frame, new THREE.CylinderGeometry(0.022, 0.022, 0.38, 12), m.dark, [0, 1.13, -0.03], [0, 0, Math.PI / 2]);
    box(frame, m.shell, [0.38, 0.025, 0.24], [0, 0.03, 0.11]);
    for (const x of [-1, 1]) {
        add(frame, new THREE.CylinderGeometry(0.115, 0.115, 0.055, 20), m.dark, [x * 0.215, 0.115, -0.02], [0, 0, Math.PI / 2]);
        add(frame, new THREE.CylinderGeometry(0.04, 0.04, 0.06, 12), m.shell, [x * 0.215, 0.115, -0.02], [0, 0, Math.PI / 2]);
    }
    frame.rotation.x = -0.14;
    frame.position.y = 0.02;
    g.add(frame);
    return g;
}

function forklift(m: KitMaterials): THREE.Object3D {
    const g = kitGroup();

    box(g, m.accent, [0.9, 0.5, 1.3], [0, 0.5, -0.15]);
    box(g, m.accent, [0.86, 0.24, 0.6], [0, 0.86, -0.45]);
    box(g, m.dark, [0.44, 0.1, 0.4], [0, 0.8, 0.1]);
    box(g, m.dark, [0.44, 0.34, 0.09], [0, 0.97, -0.13]);

    for (const [x, z, r, w] of [[-1, 0.45, 0.26, 0.2], [1, 0.45, 0.26, 0.2], [-1, -0.75, 0.19, 0.16], [1, -0.75, 0.19, 0.16]]) {
        add(g, new THREE.CylinderGeometry(r, r, w, 20), m.dark, [x * 0.46, r, z], [0, 0, Math.PI / 2]);
        add(g, new THREE.CylinderGeometry(r * 0.4, r * 0.4, w + 0.02, 12), m.shell, [x * 0.46, r, z], [0, 0, Math.PI / 2]);
    }

    for (const x of [-1, 1]) box(g, m.shell, [0.07, 1.7, 0.09], [x * 0.3, 0.85, 0.72]);
    box(g, m.dark, [0.72, 0.12, 0.06], [0, 0.34, 0.78]);
    for (const x of [-1, 1]) box(g, m.dark, [0.12, 0.035, 0.9], [x * 0.22, 0.29, 1.24]);

    for (const [x, z] of [[-1, -0.6], [1, -0.6], [-1, 0.5], [1, 0.5]]) {
        box(g, m.shell, [0.055, 1.05, 0.055], [x * 0.42, 1.28, z]);
    }
    box(g, m.shell, [0.94, 0.06, 1.22], [0, 1.83, -0.05]);
    add(g, new THREE.SphereGeometry(0.06, 16, 12), m.glass, [0, 1.9, -0.05]);
    return g;
}


// ============================================================
// Street
// ============================================================

/**
 * Both facade rows, plus one building closing off the side
 * street the driveway runs down, so it ends at a wall rather than at the
 * edge of the world.
 */
function buildStreet(plan: EnvironmentPlan, m: KitMaterials): THREE.Object3D {
    const g = new THREE.Group();

    if (plan.door !== null) {
        const end = buildFacade({ row: 'back', start: 0, end: 5, height: 3.4, tone: 'greyMid', door: 0, windows: false }, m);
        end.position.set(plan.door, LOT_Y, FACADE_FRONT - FACADE_DEPTH);
        g.add(end);
    }

    for (const facade of plan.facades) {
        const object = buildFacade(facade, m);
        const mid = (facade.start + facade.end) / 2;
        if (facade.row === 'back') {
            object.position.set(mid, LOT_Y, FACADE_FRONT);
        } else {
            object.position.set(FACADE_FRONT, LOT_Y, mid);
            object.rotation.y = Math.PI / 2;
        }
        g.add(object);
    }
    return g;
}

/** A minimal industrial shed, frontage on local z = 0 facing +z, centred on x. */
function buildFacade(facade: Facade, m: KitMaterials): THREE.Object3D {
    const g = new THREE.Group();
    const L = facade.end - facade.start, H = facade.height;
    const body = m[facade.tone];
    // A shade off the wall's own, so the door reads without adding colour.
    const panel = facade.tone === 'greyLight' ? m.greyMid : m.greyLight;

    // The roof is the body's own top, with only a dark parapet along the
    // frontage: a whole dark roof is the biggest thing on screen when zoomed
    // out, and far too heavy.
    box(g, body, [L, H, FACADE_DEPTH], [0, H / 2, -FACADE_DEPTH / 2]);
    box(g, m.dark, [L + 0.06, 0.16, 0.12], [0, H + 0.08, 0]);

    if (facade.door !== null) {
        const width = Math.min(2, L - 1.2);
        box(g, panel, [width, 2, 0.03], [facade.door, 1, 0.015]);
        box(g, m.dark, [width + 0.14, 0.09, 0.05], [facade.door, 2.04, 0.025]);
    }

    if (facade.windows) {
        // Kept clear of a loading door's lintel on the lowest sheds.
        const y = Math.max(H - 0.9, 2.55), count = Math.floor((L - 0.6) / 1.1);
        const start = -((count - 1) * 1.1) / 2;
        for (let i = 0; i < count; i++) {
            box(g, m.dark, [0.62, 0.42, 0.03], [start + i * 1.1, y, 0.015]);
        }
    }
    return g;
}
