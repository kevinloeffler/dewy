import * as THREE from 'three';
import type { CargoConveyorTile, ConveyorTile, Coord, Tile } from '$lib/game/level';
import { DIRECTION_YAW } from '$lib/game/grid';
import { createDropOffBay } from '$lib/game/models/drop-off-bay';

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
 * Animated sub-objects are named so `World` can find them:
 *   'doorLeaves' | 'switchLever' | 'platePad'
 */

const TILE = 1;
const SLAB = 0.1;
/** Gap between belt chevrons. `World` scrolls them; see `scrollBelts`. */
const CHEVRON_SPACING = 0.28;
/** Slab centre, chosen so its top surface sits exactly on y = 0 — the
 *  base-centre origin every model in `models/` assumes. */
const SLAB_Y = -SLAB / 2;

export const COLORS = {
    floorLight: 0xc4c4c4,
    floorDark:  0xa6a6a6,
    wall:       0x888888,
    void:       0x1b1d22,
    conveyor:   0x3a3d46,
    chevron:    0x8fa3b8,
    cargo:      0xf0a500,
    door:       0xb05a3a,
    plate:      0xd0c48a,
    switchBase: 0x4a4d58,
    lever:      0xe85d3a,
    goal:       0x4caf82,
} as const;

export class TileFactory {
    private geometries = new Map<string, THREE.BufferGeometry>();
    private materials = new Map<number, THREE.Material>();
    /** Groups from `createDropOffBay`, which owns its own resources. */
    private owned: THREE.Object3D[] = [];

    /**
     * Build the visual for one tile, or `null` for a pit's missing floor.
     * The returned object is positioned by the caller.
     */
    create(tile: Tile, coord: Coord): THREE.Object3D | null {
        switch (tile.kind) {
            case 'floor':
                return this.floor(coord);
            case 'pit':
                return this.pit();
            case 'wall':
                return this.box(TILE, 1, TILE, COLORS.wall, 0.5);
            case 'robot_gap':
                return this.robotGap(coord);
            case 'conveyor':
                return this.conveyor(tile, COLORS.chevron);
            case 'cargo_conveyor':
                return this.conveyor(tile, COLORS.cargo);
            case 'door':
                return this.door(coord);
            case 'pressure_plate':
                return this.pressurePlate(coord);
            case 'switch':
                return this.switchTile(coord);
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
        return new Set<{ dispose(): void }>([...this.geometries.values(), ...this.materials.values()]);
    }

    dispose(): void {
        for (const geometry of this.geometries.values()) geometry.dispose();
        for (const material of this.materials.values()) material.dispose();
        this.geometries.clear();
        this.materials.clear();
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

    private robotGap(coord: Coord) {
        const group = new THREE.Group();
        group.add(this.floor(coord));
        // Wall with a robot-height arch cut under it: clearance below y = 0.45.
        group.add(this.box(TILE, 0.55, TILE, COLORS.wall, 0.725));
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

    private door(coord: Coord) {
        const group = new THREE.Group();
        group.add(this.floor(coord));

        const leaves = new THREE.Group();
        leaves.name = 'doorLeaves';
        for (const side of [-1, 1]) {
            const leaf = this.box(0.5, 1, 0.15, COLORS.door, 0.5);
            leaf.position.x = side * 0.25;
            leaves.add(leaf);
        }
        group.add(leaves);
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

    private switchTile(coord: Coord) {
        const group = new THREE.Group();
        group.add(this.floor(coord));

        const base = new THREE.Mesh(
            this.geo('cyl:switchBase', () => new THREE.CylinderGeometry(0.14, 0.14, 0.06, 10)),
            this.mat(COLORS.switchBase),
        );
        base.position.y = 0.03;
        group.add(base);

        // Pivot at the base so the lever swings rather than slides.
        const lever = new THREE.Group();
        lever.name = 'switchLever';
        lever.position.y = 0.06;
        const stick = this.box(0.06, 0.3, 0.06, COLORS.lever, 0.15);
        lever.add(stick);
        lever.rotation.x = 0.5;
        group.add(lever);
        return group;
    }

    private goal(coord: Coord) {
        const group = new THREE.Group();
        group.add(this.floor(coord));
        group.add(this.box(0.8, 0.02, 0.8, COLORS.goal, 0.02, true));
        return group;
    }
}
