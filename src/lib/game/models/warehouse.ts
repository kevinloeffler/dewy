import * as THREE from 'three';
import { DIRECTION_DELTA } from '$lib/game/grid';
import type { DecorationKind, Direction } from '$lib/game/level';
import { kitMaterial, type KitMaterials } from '$lib/game/models/palette';

/**
 * The warehouse dressing kit — the models behind `Level.decorations`.
 *
 * Ported from the "Cute warehouse robot" design system, which authors its
 * parts in real-world metres against a 1.4 m robot. Dewy's grid is not metric:
 * a tile is one unit and Tug stands 0.93 of one, so nothing here is a straight
 * copy of those numbers. What carries over is the kit's proportions, its
 * silhouettes and its five-material palette; the sizes are re-derived so each
 * piece fills the footprint `decorations.ts` says it covers.
 *
 * Every builder returns a group centred on the origin in x/z with its base on
 * y = 0 — the same contract `models/crate.ts` and `models/roboter.ts` keep, so
 * `World` can place one by setting `position` alone.
 *
 * Materials are built per instance rather than memoised, as in `crate.ts`: a
 * level holds a handful of these, and `clearGroup` disposes them with it. A
 * caller dressing many pieces at once — the yard in `models/environment.ts` —
 * passes one shared `kitMaterials()` instead, so they can be merged.
 */


// ============================================================
// Palette
// ============================================================

/** The four of the kit's materials a decoration is built from. */
type Materials = Pick<KitMaterials, 'shell' | 'accent' | 'dark' | 'wood'>;

function materials(): Materials {
    return {
        shell:  kitMaterial('shell'),
        accent: kitMaterial('accent'),
        dark:   kitMaterial('dark'),
        wood:   kitMaterial('wood'),
    };
}

/** Swatch colours for the palette buttons, so a brush looks like what it paints. */
export const DECORATION_SWATCHES: Record<DecorationKind, number> = {
    pallet:     0xc79a63,
    shelf:      0xf07a3c,
    pillar:     0xf2ece1,
    guard_rail: 0xf07a3c,
    barrel:     0xf07a3c,
    cone:       0xf07a3c,
    tool_cart:  0xf2ece1,
};

function box(
    group: THREE.Group,
    material: THREE.Material,
    size: [number, number, number],
    position: [number, number, number],
): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position);
    group.add(mesh);
    return mesh;
}


// ============================================================
// Entry point
// ============================================================

export type DecorationOptions = {
    /**
     * Guard rails only: the neighbours this one reaches towards. Comes from
     * `railConnections`, which is why the directions are absolute — a rail is
     * the one piece `World` must *not* rotate, since its shape already
     * encodes which way it runs.
     */
    connections?: Direction[];
};

export function createDecoration(
    kind: DecorationKind,
    options: DecorationOptions = {},
    m: Materials = materials(),
): THREE.Group {
    switch (kind) {
        case 'pallet':     return buildPallet(m);
        case 'shelf':      return buildShelf(m);
        case 'pillar':     return buildPillar(m);
        case 'guard_rail': return buildGuardRail(m, options.connections ?? ['east', 'west']);
        case 'barrel':     return buildBarrel(m);
        case 'cone':       return buildCone(m);
        case 'tool_cart':  return buildToolCart(m);
    }
}


// ============================================================
// 3 × 2 — Pallet
// ============================================================

/**
 * A stringer pallet: three feet, a slatted top deck, three bottom boards.
 *
 * Low on purpose. It covers six tiles, so anything tall enough to read as an
 * object from the side would hide a sixth of a small level behind it.
 */
function buildPallet(m: Materials): THREE.Group {
    const g = new THREE.Group();
    const W = 2.86, D = 1.88, deck = 0.05, block = 0.12;

    for (const z of [-D / 2 + block / 2, 0, D / 2 - block / 2]) {
        box(g, m.dark, [W, block, block], [0, deck + block / 2, z]);
    }

    // Six top boards spanning the depth, evenly spread across the width.
    const boards = 6, edge = 0.2;
    for (let i = 0; i < boards; i++) {
        const x = -W / 2 + edge + i * ((W - edge * 2) / (boards - 1));
        box(g, m.wood, [0.3, deck, D], [x, deck + block + deck / 2, 0]);
    }

    for (const z of [-D / 2 + 0.22, 0, D / 2 - 0.22]) {
        box(g, m.wood, [W, deck, 0.36], [0, deck / 2, z]);
    }

    return g;
}


// ============================================================
// 2 × 1 — Shelf
// ============================================================

/** Pallet racking: four uprights, three decked levels between beam pairs. */
function buildShelf(m: Materials): THREE.Group {
    const g = new THREE.Group();
    const W = 1.88, D = 0.88, H = 1.5, post = 0.09;

    for (const x of [-1, 1]) {
        for (const z of [-1, 1]) {
            box(g, m.accent, [post, H, post],
                [x * (W / 2 - post / 2), H / 2, z * (D / 2 - post / 2)]);
        }
    }

    for (const y of [0.05, 0.62, 1.19]) {
        for (const z of [-1, 1]) {
            box(g, m.dark, [W, 0.07, 0.06], [0, y, z * (D / 2 - post / 2)]);
        }
        box(g, m.shell, [W - post, 0.035, D - post], [0, y + 0.05, 0]);
    }

    return g;
}


// ============================================================
// 1 × 1
// ============================================================

/** Structural column with an impact guard at robot height and a capital. */
function buildPillar(m: Materials): THREE.Group {
    const g = new THREE.Group();
    const H = 1.5;

    box(g, m.shell,  [0.38, H, 0.38],   [0, H / 2, 0]);
    box(g, m.accent, [0.46, 0.34, 0.46], [0, 0.17, 0]);
    box(g, m.dark,   [0.62, 0.05, 0.62], [0, 0.025, 0]);
    box(g, m.dark,   [0.5, 0.08, 0.5],  [0, H - 0.04, 0]);

    return g;
}

/**
 * A safety barrier that grows into its neighbours.
 *
 * Drawn as one post at the tile centre plus an arm reaching to the middle of
 * each edge named in `connections`. A row of rails therefore meets post to
 * post with no gap, and a corner or a T falls out of the same rule instead of
 * needing its own piece. Two opposite arms and no neighbours is a lone span.
 */
function buildGuardRail(m: Materials, connections: Direction[]): THREE.Group {
    const g = new THREE.Group();
    const H = 0.55;

    box(g, m.accent, [0.1, H, 0.1], [0, H / 2, 0]);
    box(g, m.dark, [0.24, 0.02, 0.24], [0, 0.01, 0]);

    for (const direction of connections) {
        // Built along +x, then turned so +x points down `direction`. Rotating
        // by θ about +y sends +x to `(cos θ, 0, -sin θ)`, and a grid delta is
        // `(dx, dy)` in scene `(x, z)` — hence the negated dy.
        const delta = DIRECTION_DELTA[direction];
        const arm = new THREE.Group();
        arm.rotation.y = Math.atan2(-delta.y, delta.x);

        const reach = 0.5;
        for (const y of [0.26, H - 0.05]) {
            box(arm, m.shell, [reach, 0.08, 0.055], [reach / 2, y, 0]);
        }
        box(arm, m.dark, [reach, 0.13, 0.035], [reach / 2, 0.09, 0]);

        g.add(arm);
    }

    return g;
}

/** Ribbed drum with a bung in the lid. */
function buildBarrel(m: Materials): THREE.Group {
    const g = new THREE.Group();
    const H = 0.62, R = 0.21;

    const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 28), m.accent);
    body.position.y = H / 2;
    g.add(body);

    for (const y of [0.17, 0.45]) {
        const rib = new THREE.Mesh(new THREE.TorusGeometry(R + 0.004, 0.014, 8, 28), m.dark);
        rib.rotation.x = Math.PI / 2;
        rib.position.y = y;
        g.add(rib);
    }

    for (const y of [0.013, H - 0.013]) {
        const rim = new THREE.Mesh(
            new THREE.CylinderGeometry(R + 0.014, R + 0.014, 0.03, 28),
            m.dark,
        );
        rim.position.y = y;
        g.add(rim);
    }

    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.022, 16), m.shell);
    cap.position.set(0.1, H + 0.007, 0);
    g.add(cap);

    return g;
}

/** Traffic cone: square base, lathed body with a flat top, two collars. */
function buildCone(m: Materials): THREE.Group {
    const g = new THREE.Group();
    const H = 0.52, cut = 0.78, baseH = 0.045;

    const base = new THREE.Mesh(
        new THREE.CylinderGeometry(0.17, 0.19, baseH, 4, 1),
        m.accent,
    );
    base.rotation.y = Math.PI / 4;
    base.position.y = baseH / 2;
    g.add(base);

    // Profile of the taper, truncated before the tip so the top reads flat.
    const radius = (t: number) => 0.115 * Math.pow(1 - t, 0.78) + 0.01;
    const points: THREE.Vector2[] = [];
    for (let i = 0; i <= 20; i++) {
        const t = (i / 20) * cut;
        points.push(new THREE.Vector2(radius(t), t * H));
    }
    points.push(new THREE.Vector2(0, cut * H));

    const body = new THREE.Mesh(new THREE.LatheGeometry(points, 28), m.accent);
    body.position.y = baseH;
    g.add(body);

    for (const y of [0.14, 0.27]) {
        const r = radius(y / H) + 0.008;
        const band = new THREE.Mesh(
            new THREE.CylinderGeometry(r - 0.01, r + 0.004, 0.06, 28),
            m.shell,
        );
        band.position.y = baseH + y;
        g.add(band);
    }

    return g;
}

/** Three-tier trolley on casters, push handle at the back. */
function buildToolCart(m: Materials): THREE.Group {
    const g = new THREE.Group();
    const W = 0.68, D = 0.46, H = 0.7, post = 0.055;

    for (const y of [0.19, 0.44, H - 0.03]) {
        box(g, m.shell, [W, 0.04, D], [0, y, 0]);
    }

    for (const x of [-1, 1]) {
        for (const z of [-1, 1]) {
            box(g, m.accent, [post, H, post],
                [x * (W / 2 - 0.025), H / 2 + 0.045, z * (D / 2 - 0.025)]);

            const caster = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), m.dark);
            caster.position.set(x * (W / 2 - 0.05), 0.05, z * (D / 2 - 0.05));
            g.add(caster);
        }
    }

    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, W, 12), m.dark);
    handle.rotation.z = Math.PI / 2;
    handle.position.set(0, H + 0.11, -D / 2 + 0.025);
    g.add(handle);

    for (const x of [-1, 1]) {
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.145, 10), m.dark);
        stem.position.set(x * (W / 2 - 0.025), H + 0.04, -D / 2 + 0.025);
        g.add(stem);
    }

    return g;
}
