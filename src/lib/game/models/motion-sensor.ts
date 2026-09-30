import * as THREE from 'three';
import { kitMaterial } from './palette';

/**
 * The colours a sensor wears: green while it is switched off, red while it
 * watches. Shared by the device's lamp and the zone overlay in `World`, so the
 * two can never tell the student different things.
 */
export const SENSOR_OFF = new THREE.Color(0x34c759);
export const SENSOR_ON = new THREE.Color(0xff3b30);

export type MotionSensorModel = {
    group: THREE.Group;
    /** 0 is off (green), 1 is on (red); anything between is mid-fade. */
    setActive(amount: number): void;
};

/**
 * A motion sensor: a camera hanging from the ceiling on a short rod, looking
 * down at the floor, with a status lamp underneath. It hangs above the
 * partition walls, clear of everything on the floor — the tile beneath it is
 * as walkable as any other in its zone.
 * Origin convention: the tile's centre on the floor plane, y=0.
 */
export function createMotionSensor(options: { active?: boolean } = {}): MotionSensorModel {
    const group = new THREE.Group();
    const dark = kitMaterial('dark');
    const shell = kitMaterial('shell');
    const glass = kitMaterial('glass');

    // Just above the 1.5 partitions, so the camera never reads as standing
    // on a wall, and low enough that the isometric view still frames it.
    const HANG = 1.65;
    const ROD = 0.45;

    const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.04, 12), dark);
    mount.position.y = HANG + ROD;
    group.add(mount);

    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, ROD, 8), dark);
    rod.position.y = HANG + ROD / 2;
    group.add(rod);

    // The head tips down, like a camera watching the floor below.
    const head = new THREE.Group();
    head.position.y = HANG;
    head.rotation.x = 0.6;
    group.add(head);

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.3), shell);
    head.add(body);

    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 12), glass);
    lens.rotation.x = Math.PI / 2;
    lens.position.z = 0.16;
    head.add(lens);

    const lampMaterial = new THREE.MeshStandardMaterial({
        color: SENSOR_OFF.clone(),
        emissive: SENSOR_OFF.clone(),
        emissiveIntensity: 0.8,
        roughness: 0.3,
    });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), lampMaterial);
    lamp.position.set(0, -0.09, -0.06);
    head.add(lamp);

    function setActive(amount: number) {
        lampMaterial.color.copy(SENSOR_OFF).lerp(SENSOR_ON, amount);
        lampMaterial.emissive.copy(lampMaterial.color);
    }

    setActive(options.active ? 1 : 0);
    return { group, setActive };
}

// ============================================================
// Zone tiles
// ============================================================

/** Which sides of a zone tile face out of the zone, and so carry the rim. */
export type ZoneEdges = { north: boolean; east: boolean; south: boolean; west: boolean };

const GLOW_SIZE = 64;
/** Alpha across the middle of the zone — the field itself. */
const GLOW_FILL = 0.2;
/** How far the rim's glow reaches inward, in tiles. */
const GLOW_REACH = 0.14;

const glowTextures = new Map<string, THREE.DataTexture>();

/**
 * White with an alpha falloff: bright along each exposed edge, easing to the
 * soft fill inward. The material's colour tints it, so one texture serves
 * both red and green and the fade between them.
 *
 * Only the edges facing out of the zone glow, so a whole rectangle reads as
 * one lit field with a bright rim rather than a grid of squares. There are
 * sixteen possible edge sets; each is built once and shared for good, which
 * is also why nothing here is ever disposed — `clearGroup` leaves textures be.
 */
function glowTexture(edges: ZoneEdges): THREE.DataTexture {
    const key = `${+edges.north}${+edges.east}${+edges.south}${+edges.west}`;
    const cached = glowTextures.get(key);
    if (cached) return cached;

    const data = new Uint8Array(GLOW_SIZE * GLOW_SIZE * 4);
    for (let j = 0; j < GLOW_SIZE; j++) {
        // Row 0 is v = 0, which the floor plane below puts at the south edge.
        const v = (j + 0.5) / GLOW_SIZE;
        for (let i = 0; i < GLOW_SIZE; i++) {
            const u = (i + 0.5) / GLOW_SIZE;
            let d = Infinity;
            if (edges.north) d = Math.min(d, 1 - v);
            if (edges.south) d = Math.min(d, v);
            if (edges.east) d = Math.min(d, 1 - u);
            if (edges.west) d = Math.min(d, u);

            const rim = d === Infinity ? 0 : Math.exp(-d / GLOW_REACH);
            const alpha = GLOW_FILL + (1 - GLOW_FILL) * rim * 0.85;

            const p = (j * GLOW_SIZE + i) * 4;
            data[p] = data[p + 1] = data[p + 2] = 255;
            data[p + 3] = Math.round(alpha * 255);
        }
    }

    const texture = new THREE.DataTexture(data, GLOW_SIZE, GLOW_SIZE, THREE.RGBAFormat);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
    glowTextures.set(key, texture);
    return texture;
}

/**
 * One tile of a sensor's watched zone: a flat glowing square on the floor.
 * Its material's `color` is what `World` fades between green and red.
 */
export function createSensorZoneTile(active: boolean, edges: ZoneEdges): THREE.Mesh {
    const material = new THREE.MeshBasicMaterial({
        color: (active ? SENSOR_ON : SENSOR_OFF).clone(),
        map: glowTexture(edges),
        transparent: true,
        depthWrite: false,
    });
    // A full tile, not an inset one: neighbouring tiles meet edge to edge so
    // the fill runs unbroken across the zone.
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    mesh.rotation.x = -Math.PI / 2;
    return mesh;
}

/** Which edges of each tile in `zone` face out of it — see `glowTexture`. */
export function zoneEdges(zone: { x: number; y: number }[]): ZoneEdges[] {
    const inZone = new Set(zone.map((c) => `${c.x},${c.y}`));
    const outside = (x: number, y: number) => !inZone.has(`${x},${y}`);
    return zone.map(({ x, y }) => ({
        north: outside(x, y - 1),
        east: outside(x + 1, y),
        south: outside(x, y + 1),
        west: outside(x - 1, y),
    }));
}
