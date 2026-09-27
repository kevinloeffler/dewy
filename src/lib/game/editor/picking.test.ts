import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GROUND, coordOf, pickTileFrom } from './picking';
import { emptyLevel, setTile } from './operations';
import { TileFactory } from '../models/tiles';
import { aimIsometricCamera, createIsometricCamera } from '../three-utils';
import { tileAt } from '../grid';
import type { Coord, Level } from '../level';

/**
 * Picking needs a camera, a scene graph and a raycaster — none of which need
 * a WebGL context — so the behaviour the designer depends on is testable in
 * the same plain-Node suite as the engine.
 */

/** The same walk `World.buildTiles` does, including the coord stamp. */
function buildTileRoot(level: Level) {
    const factory = new TileFactory();
    const root = new THREE.Group();

    for (let x = 0; x < level.width; x++) {
        for (let y = 0; y < level.height; y++) {
            const coord = { x, y };
            const tile = tileAt(level, coord);
            if (!tile) continue;

            const object = factory.create(tile, coord);
            if (!object) continue;

            object.position.x += x;
            object.position.z += y;
            object.userData.coord = coord;
            root.add(object);
        }
    }

    return root;
}

/** A camera framed on the level exactly the way `World.frameCamera` does. */
function cameraFor(level: Level) {
    const camera = createIsometricCamera(7, 1, 10);
    const centre = new THREE.Vector3((level.width - 1) / 2, 0, (level.height - 1) / 2);
    aimIsometricCamera(camera, centre, 10);
    return camera;
}

/** Where a world-space point lands on screen, in normalised device coords. */
function ndcOf(point: THREE.Vector3, camera: THREE.Camera) {
    const projected = point.clone().project(camera);
    return new THREE.Vector2(projected.x, projected.y);
}

/** What picking would answer if it only used the ground plane. `|| 0` keeps
 *  `Math.round`'s negative zero out of the comparison — this test is about
 *  which tile you land on, not which zero. */
function planePick(camera: THREE.Camera, ndc: THREE.Vector2): Coord | null {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, camera);
    const point = raycaster.ray.intersectPlane(GROUND, new THREE.Vector3());
    return point ? { x: Math.round(point.x) || 0, y: Math.round(point.z) || 0 } : null;
}

const pick = (root: THREE.Object3D, camera: THREE.Camera, ndc: THREE.Vector2, level: Level) =>
    pickTileFrom(new THREE.Raycaster(), camera, root, ndc, level);

describe('pickTileFrom', () => {
    it('picks the tile a floor click lands on', () => {
        const level = emptyLevel('x', 'X', 6, 6);
        const root = buildTileRoot(level);
        const camera = cameraFor(level);

        // The top surface of a floor slab sits exactly on y = 0.
        const ndc = ndcOf(new THREE.Vector3(2, 0, 4), camera);

        expect(pick(root, camera, ndc, level)).toEqual({ x: 2, y: 4 });
    });

    it('picks the wall itself when you click the top of a wall', () => {
        const level = setTile(emptyLevel('x', 'X', 6, 6), { x: 1, y: 1 }, { kind: 'wall' });
        const root = buildTileRoot(level);
        const camera = cameraFor(level);

        // A wall is a unit cube, so its top face is at y = 1.
        const ndc = ndcOf(new THREE.Vector3(1, 1, 1), camera);

        expect(pick(root, camera, ndc, level)).toEqual({ x: 1, y: 1 });

        // This is the whole reason picking raycasts meshes: at the game's
        // fixed isometric angle, plane math reads that same click as a tile a
        // full diagonal away, which would make every wall unclickable.
        // The camera sits at (+d, +d, +d), so a point one unit up reads back
        // one tile *nearer* the origin on the ground plane.
        expect(planePick(camera, ndc)).not.toEqual({ x: 1, y: 1 });
        expect(planePick(camera, ndc)).toEqual({ x: 0, y: 0 });
    });

    it('walks up from a child mesh to the tile that owns it', () => {
        const level = setTile(emptyLevel('x', 'X', 6, 6), { x: 3, y: 2 }, {
            kind: 'door', doorId: 'door-1', initiallyOpen: false, facing: 'south',
        });
        const root = buildTileRoot(level);
        const camera = cameraFor(level);

        // A door is a group of leaves, so the hit is never the stamped object.
        const ndc = ndcOf(new THREE.Vector3(3, 0, 2), camera);

        expect(pick(root, camera, ndc, level)).toEqual({ x: 3, y: 2 });
    });

    it('ignores scenery that carries no coord, such as the backdrop walls', () => {
        const level = emptyLevel('x', 'X', 6, 6);
        const root = buildTileRoot(level);
        const camera = cameraFor(level);
        const ndc = ndcOf(new THREE.Vector3(2, 0, 2), camera);

        // A tall unstamped slab directly between the camera and that tile.
        const backdrop = new THREE.Mesh(
            new THREE.BoxGeometry(1, 4, 1),
            new THREE.MeshBasicMaterial(),
        );
        backdrop.position.set(4, 2, 4);
        root.add(backdrop);

        expect(pick(root, camera, ndc, level)).toEqual({ x: 2, y: 2 });
    });

    it('returns null for a click past the edge of the grid', () => {
        const level = emptyLevel('x', 'X', 6, 6);
        const root = buildTileRoot(level);
        const camera = cameraFor(level);

        expect(pick(root, camera, ndcOf(new THREE.Vector3(-6, 0, -6), camera), level)).toBe(null);
        expect(pick(root, camera, ndcOf(new THREE.Vector3(20, 0, 20), camera), level)).toBe(null);
    });

    it('finds every tile of a full grid, once each', () => {
        const level = emptyLevel('x', 'X', 5, 5);
        const root = buildTileRoot(level);
        const camera = cameraFor(level);

        for (let x = 0; x < 5; x++) {
            for (let y = 0; y < 5; y++) {
                const ndc = ndcOf(new THREE.Vector3(x, 0, y), camera);
                expect(pick(root, camera, ndc, level), `tile ${x},${y}`).toEqual({ x, y });
            }
        }
    });
});

describe('coordOf', () => {
    it('returns a copy, so a caller cannot write into the scene graph', () => {
        const object = new THREE.Object3D();
        object.userData.coord = { x: 1, y: 2 };

        const coord = coordOf(object)!;
        coord.x = 99;

        expect(object.userData.coord).toEqual({ x: 1, y: 2 });
    });

    it('is null for an object with no tile above it', () => {
        expect(coordOf(new THREE.Object3D())).toBe(null);
    });
});
