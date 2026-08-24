import * as THREE from 'three';
import { inBounds } from '$lib/game/grid';
import type { Coord, Level } from '$lib/game/level';

/**
 * Turning a pointer position into a tile coordinate.
 *
 * Split out of `World` so it can be tested without a WebGL context: a
 * raycaster, a camera and a scene graph all work fine in plain Node, but
 * `new WebGLRenderer()` does not.
 */

/** The y = 0 plane every tile's top surface sits on. */
export const GROUND = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

/**
 * The coord `World.buildTiles` stamped, found by walking up from a raycast
 * hit — which is usually a child mesh of the tile's root object. Returns a
 * copy so a caller can never write through into the scene graph.
 */
export function coordOf(object: THREE.Object3D): Coord | null {
    for (let node: THREE.Object3D | null = object; node; node = node.parent) {
        const coord = node.userData.coord as Coord | undefined;
        if (coord) return { x: coord.x, y: coord.y };
    }
    return null;
}

/**
 * The tile a ray through `ndc` lands on, or `null` off-world.
 *
 * Hits the tile meshes rather than the ground plane. The camera is a fixed
 * orthographic isometric looking down `(-1, -1, -1)`, so the top face of a
 * one-unit-tall wall lands a whole diagonal tile away from its own footprint
 * on screen — plane math alone would make every wall in a level unclickable.
 * The plane is the fallback for a ray that hits no tile at all, which happens
 * over the gap of a pit.
 */
export function pickTileFrom(
    raycaster: THREE.Raycaster,
    camera: THREE.Camera,
    tileRoot: THREE.Object3D,
    ndc: THREE.Vector2,
    level: Level,
): Coord | null {
    raycaster.setFromCamera(ndc, camera);

    // Nearest hit that belongs to a tile. The two backdrop walls from
    // `buildWalls` carry no coord and fall through this filter.
    for (const hit of raycaster.intersectObjects(tileRoot.children, true)) {
        const coord = coordOf(hit.object);
        if (coord && inBounds(level, coord)) return coord;
    }

    const point = raycaster.ray.intersectPlane(GROUND, new THREE.Vector3());
    if (!point) return null;

    // `Math.round` hands back `-0` for anything in [-0.5, 0), which survives
    // into tile keys and comparisons as a needless second kind of zero.
    const coord = { x: round(point.x), y: round(point.z) };
    return inBounds(level, coord) ? coord : null;
}

function round(value: number): number {
    const rounded = Math.round(value);
    return rounded === 0 ? 0 : rounded;
}
