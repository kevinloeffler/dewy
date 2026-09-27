import * as THREE from 'three';
import type { CargoConveyorTile, ConveyorTile, Coord, Direction, DoorTile, SwitchTile, Tile } from '$lib/game/level';
import { DIRECTION_DELTA, DIRECTION_YAW } from '$lib/game/grid';
import { createDropOffBay } from '$lib/game/models/drop-off-bay';
import { kitMaterial, type KitMaterialName } from '$lib/game/models/palette';
import { LONE_WALL, type WallShape } from '$lib/game/partitions';

/**
 * Placeholder visuals for every tile kind.
 *
 * Only `drop_off` has a real model so far; the rest are colour-coded
 * primitives whose job is to prove the data path from `Level.tiles` to the
 * scene. Replacing one with a proper model means changing one branch here.
 *
 * Geometry and materials are memoised: a 20×20 level shares two floor
 * geometries rather than allocating four hundred.
 *
 * Walls are the exception to "one tile, one model": each is drawn as a slim
 * partition joining its neighbours, so the caller passes the `WallShape`
 * `partitions.ts` worked out for it. They share the warehouse walls' own
 * materials, which is what makes the room and its walls read as one building.
 *
 * Animated sub-objects are named so `World` can find them:
 *   'doorLeaves' | 'switchLever' | 'switchLight' | 'platePad'
 */

const TILE = 1;
/** Indoor walls: as tall as a shelf, so they read as walls and not kerbs. */
const PARTITION_HEIGHT = 1.5;
const PARTITION_THICKNESS = 0.24;
const PARTITION_CAP = 0.06;
/**
 * Headroom under a robot gap's bridge. The robot's head tops out near 0.88
 * (0.93 at `ROBOT_SCALE` 0.95), so this leaves it visibly clear with room to
 * spare, while the bridge above stays thick enough to read as wall.
 */
const GAP_CLEARANCE = 1.05;
/** A door's leaves fill the wall's full height, under its cap. */
const DOOR_HEIGHT = PARTITION_HEIGHT;
const SLAB = 0.1;
/** Gap between belt chevrons. `World` scrolls them; see `scrollBelts`. */
const CHEVRON_SPACING = 0.28;
/** Slab centre, chosen so its top surface sits exactly on y = 0 — the
 *  base-centre origin every model in `models/` assumes. */
const SLAB_Y = -SLAB / 2;

export const COLORS = {
    floorLight: 0xc4c4c4,
    floorDark:  0xb6b6b6,
    void:       0x1b1d22,
    conveyor:   0x3a3d46,
    chevron:    0x8fa3b8,
    cargo:      0xf0a500,
    door:       0xc96b46,
    doorMark:   0xf5f5f5,
    plate:      0xd0c48a,
    switchBase: 0x4a4d58,
    lever:      0xe85d3a,
    switchOn:   0x3ddc6a,
    switchOff:  0xe8403a,
    goal:       0x0b7a3e,
    goalMark:   0xffffff,
} as const;

export class TileFactory {
    private geometries = new Map<string, THREE.BufferGeometry>();
    private materials = new Map<number, THREE.Material>();
    /** Groups from `createDropOffBay`, which owns its own resources. */
    private owned: THREE.Object3D[] = [];

    /** Warehouse-kit materials, memoised like `materials` and shared the same way. */
    private kit = new Map<KitMaterialName, THREE.Material>();

    /**
     * Build the visual for one tile, or `null` for a pit's missing floor.
     * The returned object is positioned by the caller.
     *
     * `shape` only matters to a wall or a robot gap: the neighbours it joins.
     * Left out — a brush preview — it draws as a lone span.
     */
    create(tile: Tile, coord: Coord, shape: WallShape = LONE_WALL): THREE.Object3D | null {
        switch (tile.kind) {
            case 'floor':
                return this.floor(coord);
            case 'pit':
                return this.pit();
            case 'wall':
                return this.partition(coord, shape, 0);
            case 'robot_gap':
                // A bridge in the wall. Never filled: a gap is a hole.
                return this.partition(coord, { arms: shape.arms, fill: false }, GAP_CLEARANCE);
            case 'conveyor':
                return this.conveyor(tile, COLORS.chevron);
            case 'cargo_conveyor':
                return this.conveyor(tile, COLORS.cargo);
            case 'door':
                return this.door(tile, coord);
            case 'pressure_plate':
                return this.pressurePlate(coord);
            case 'switch':
                return this.switchTile(tile, coord);
            case 'goal':
                return this.goal(coord);
            case 'drop_off': {
                const bay = createDropOffBay({ color: tile.color ?? undefined });
                this.owned.push(bay);
                return bay;
            }
        }
    }

    /**
     * The geometries and materials this factory memoises and reuses across
     * levels. Tearing a level down must skip these — see `disposeObject`.
     */
    shared(): ReadonlySet<{ dispose(): void }> {
        return new Set<{ dispose(): void }>([
            ...this.geometries.values(),
            ...this.materials.values(),
            ...this.kit.values(),
        ]);
    }

    dispose(): void {
        for (const geometry of this.geometries.values()) geometry.dispose();
        for (const material of this.materials.values()) material.dispose();
        for (const material of this.kit.values()) material.dispose();
        this.geometries.clear();
        this.materials.clear();
        this.kit.clear();
        this.owned = [];
    }

    // ── Shared resources ─────────────────────────────────────────────────

    private geo(key: string, build: () => THREE.BufferGeometry): THREE.BufferGeometry {
        let geometry = this.geometries.get(key);
        if (!geometry) {
            geometry = build();
            this.geometries.set(key, geometry);
        }
        return geometry;
    }

    private mat(color: number, emissive = false): THREE.Material {
        const key = emissive ? color + 0x1000000 : color;
        let material = this.materials.get(key);
        if (!material) {
            material = emissive
                ? new THREE.MeshStandardMaterial({
                      color,
                      emissive: new THREE.Color(color),
                      emissiveIntensity: 0.5,
                      roughness: 0.4,
                      flatShading: true,
                  })
                : new THREE.MeshLambertMaterial({ color });
            this.materials.set(key, material);
        }
        return material;
    }

    private kitMat(name: KitMaterialName): THREE.Material {
        let material = this.kit.get(name);
        if (!material) {
            material = kitMaterial(name);
            this.kit.set(name, material);
        }
        return material;
    }

    /**
     * One block of partition, `w` × `d` in plan, from `bottom` up to the
     * partition's height, with a dark cap a hair wider — the warehouse walls'
     * cap, at partition scale.
     */
    private wallPiece(parent: THREE.Object3D, w: number, d: number, x: number, z: number, bottom: number) {
        const h = PARTITION_HEIGHT - bottom;
        this.kitBox(parent, w, h, d, 'wall', x, bottom + h / 2, z);
        this.wallCap(parent, w, d, x, z);
    }

    /** Just the cap — what runs on unbroken over a doorway. */
    private wallCap(parent: THREE.Object3D, w: number, d: number, x: number, z: number) {
        this.kitBox(parent, w + 0.03, PARTITION_CAP, d + 0.03, 'dark', x, PARTITION_HEIGHT + PARTITION_CAP / 2, z);
    }

    /**
     * Dark uprights down both sides of a robot gap's opening, from the floor
     * to its bridge — the same trim as the walls' tops. One per arm: each
     * stands where the gap meets the wall beside it.
     */
    private gapJambs(parent: THREE.Object3D, shape: WallShape, bottom: number) {
        const c = PARTITION_CAP;
        const across = PARTITION_THICKNESS + 0.03;
        for (const arm of shape.arms) {
            const { x, y } = DIRECTION_DELTA[arm];
            const offset = TILE / 2 - c / 2;
            if (x !== 0) this.kitBox(parent, c, bottom, across, 'dark', x * offset, bottom / 2, 0);
            else this.kitBox(parent, across, bottom, c, 'dark', 0, bottom / 2, y * offset);
        }
    }

    private kitBox(parent: THREE.Object3D, w: number, h: number, d: number, material: KitMaterialName, x: number, y: number, z: number) {
        const key = `box:${w},${h},${d}`;
        const mesh = new THREE.Mesh(this.geo(key, () => new THREE.BoxGeometry(w, h, d)), this.kitMat(material));
        mesh.position.set(x, y, z);
        parent.add(mesh);
    }

    private box(w: number, h: number, d: number, color: number, y: number, emissive = false) {
        const key = `box:${w},${h},${d}`;
        const mesh = new THREE.Mesh(this.geo(key, () => new THREE.BoxGeometry(w, h, d)), this.mat(color, emissive));
        mesh.position.y = y;
        return mesh;
    }

    // ── Tile kinds ───────────────────────────────────────────────────────

    private slabColor(coord: Coord): number {
        return (coord.x + coord.y) % 2 === 0 ? COLORS.floorLight : COLORS.floorDark;
    }

    private floor(coord: Coord) {
        return this.box(TILE, SLAB, TILE, this.slabColor(coord), SLAB_Y);
    }

    /** No walkable surface — just a dark plate far below to read as depth. */
    private pit() {
        return this.box(TILE, 0.05, TILE, COLORS.void, -0.6);
    }

    /**
     * A partition on a floor slab: a post at the centre, an arm to each edge
     * in `shape.arms`, and the filler square towards the south-east when the
     * wall is thick there. Arms of neighbouring tiles meet end to end at the
     * shared edge, so a run is one unbroken wall.
     */
    private partition(coord: Coord, shape: WallShape, bottom: number) {
        const group = new THREE.Group();
        group.add(this.floor(coord));

        const t = PARTITION_THICKNESS;
        const has = (d: Direction) => shape.arms.includes(d);
        // A straight run through the tile is one piece, not two arms and a
        // post: every extra join along a wall's face shows as a seam.
        const eastWest = has('east') && has('west');
        const northSouth = has('north') && has('south');
        if (eastWest) this.wallPiece(group, TILE, t, 0, 0, bottom);
        if (northSouth) this.wallPiece(group, t, TILE, 0, 0, bottom);
        if (!eastWest && !northSouth) this.wallPiece(group, t, t, 0, 0, bottom);
        for (const arm of shape.arms) {
            if ((eastWest && (arm === 'east' || arm === 'west'))
                || (northSouth && (arm === 'north' || arm === 'south'))) continue;
            const { x, y } = DIRECTION_DELTA[arm];
            if (x !== 0) this.wallPiece(group, TILE / 2, t, x * TILE / 4, 0, bottom);
            else this.wallPiece(group, t, TILE / 2, 0, y * TILE / 4, bottom);
        }
        if (shape.fill) this.wallPiece(group, TILE, TILE, TILE / 2, TILE / 2, bottom);
        if (bottom > 0) this.gapJambs(group, shape, bottom);
        return group;
    }

    /**
     * A driven belt gets its own chevron material rather than the memoised
     * shared one: `World` dims a stopped belt by fading that colour, and a
     * shared material would take every other belt in the level with it. The
     * clone is not in `shared()`, so `clearGroup` disposes it with the level.
     */
    private conveyor(tile: ConveyorTile | CargoConveyorTile, chevronColor: number) {
        const group = new THREE.Group();
        group.add(this.box(TILE, SLAB, TILE, COLORS.conveyor, SLAB_Y));

        const material = tile.control
            ? new THREE.MeshLambertMaterial({ color: chevronColor })
            : this.mat(chevronColor);

        // The chevrons live in their own named group so `World` can scroll
        // them. The tile is rotated, not the chevrons, so local +Z is always
        // the direction of travel — scrolling is `+z` whichever way it points.
        const chevrons = new THREE.Group();
        chevrons.name = 'beltChevrons';
        for (let i = -1; i <= 1; i++) {
            const chevron = new THREE.Mesh(
                this.geo('box:0.5,0.03,0.12', () => new THREE.BoxGeometry(0.5, 0.03, 0.12)),
                material,
            );
            chevron.position.y = 0.02;
            chevron.position.z = i * CHEVRON_SPACING;
            chevrons.add(chevron);
        }
        group.add(chevrons);

        group.rotation.y = DIRECTION_YAW[tile.direction];
        return group;
    }

    /**
     * The leaves group is turned rather than the whole tile, so `World` can go
     * on sliding each leaf along its local x whichever way the door is hung.
     */
    /**
     * A white chevron on a door leaf, pointing `side` (-1 left, +1 right):
     * out from the centre, the way the leaf slides when the door opens.
     * One extruded "<" rather than two crossed bars, so its point is a clean
     * mitre; standing `z` off the leaf's face.
     */
    private chevron(side: number, z: number): THREE.Object3D {
        const geometry = this.geo(`chevron:${side}`, () => {
            const depth = 0.16, half = 0.2, stroke = 0.09;
            // Drawn pointing -x, then mirrored for a right-hand leaf.
            const point = (x: number, y: number) => new THREE.Vector2(-side * x, y);
            const shape = new THREE.Shape([
                point(-depth / 2, 0),
                point(depth / 2, half),
                point(depth / 2 + stroke, half),
                point(-depth / 2 + stroke, 0),
                point(depth / 2 + stroke, -half),
                point(depth / 2, -half),
            ]);
            const extruded = new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: false });
            extruded.translate(0, 0, -0.006);
            return extruded;
        });
        const mesh = new THREE.Mesh(geometry, this.mat(COLORS.doorMark));
        mesh.position.z = z;
        return mesh;
    }

    private door(tile: DoorTile, coord: Coord) {
        const group = new THREE.Group();
        group.add(this.floor(coord));

        const leaves = new THREE.Group();
        leaves.name = 'doorLeaves';
        for (const side of [-1, 1]) {
            const leaf = this.box(0.5, DOOR_HEIGHT, 0.15, COLORS.door, DOOR_HEIGHT / 2);
            leaf.position.x = side * 0.25;
            // On both faces, since a door is seen from either side. A child
            // of the leaf, so it slides with it — `World` moves the leaves.
            for (const face of [-1, 1]) leaf.add(this.chevron(side, face * (0.15 / 2 + 0.006)));
            leaves.add(leaf);
        }
        leaves.rotation.y = DIRECTION_YAW[tile.facing];
        group.add(leaves);

        // The wall's cap runs on over the doorway, so a closed door reads as
        // part of one continuous wall. Open, the leaves slide into the
        // neighbouring walls, which are thicker than they are.
        const cap = new THREE.Group();
        this.wallCap(cap, TILE, PARTITION_THICKNESS, 0, 0);
        cap.rotation.y = DIRECTION_YAW[tile.facing];
        group.add(cap);
        return group;
    }

    private pressurePlate(coord: Coord) {
        const group = new THREE.Group();
        group.add(this.floor(coord));
        const pad = this.box(0.8, 0.05, 0.8, COLORS.plate, 0.035);
        pad.name = 'platePad';
        group.add(pad);
        return group;
    }

    /**
     * The light gets its own material rather than the memoised shared one:
     * `World` recolours it as the switch flips, and a shared material would
     * flip every other switch in the level with it. Like a driven belt's
     * chevrons, the clone is not in `shared()` and is disposed with the level.
     */
    private switchTile(tile: SwitchTile, coord: Coord) {
        const group = new THREE.Group();
        group.add(this.floor(coord));

        group.add(this.box(0.56, 0.1, 0.42, COLORS.switchBase, 0.05));

        // Pivot at the top of the base so the lever swings rather than slides.
        const lever = new THREE.Group();
        lever.name = 'switchLever';
        lever.position.set(-0.08, 0.1, 0);
        lever.add(this.box(0.07, 0.3, 0.07, COLORS.lever, 0.15));
        lever.rotation.x = tile.initiallyOn ? -0.5 : 0.5;
        group.add(lever);

        const color = tile.initiallyOn ? COLORS.switchOn : COLORS.switchOff;
        const light = new THREE.Mesh(
            this.geo('sphere:switchLight', () => new THREE.SphereGeometry(0.045, 12, 8)),
            new THREE.MeshStandardMaterial({
                color,
                emissive: new THREE.Color(color),
                emissiveIntensity: 0.8,
                roughness: 0.3,
            }),
        );
        light.name = 'switchLight';
        light.position.set(0.18, 0.1, 0);
        group.add(light);
        return group;
    }

    private goal(coord: Coord) {
        const group = new THREE.Group();
        group.add(this.floor(coord));
        group.add(this.box(0.8, 0.02, 0.8, COLORS.goal, 0.02, true));
        // A small white X on the pad — "the spot" the robot is headed for.
        for (const angle of [Math.PI / 4, -Math.PI / 4]) {
            const bar = this.box(0.3, 0.01, 0.06, COLORS.goalMark, 0.035);
            bar.rotation.y = angle;
            group.add(bar);
        }
        return group;
    }
}
