import * as THREE from 'three';
import { CRATE_COLORS, type CrateColor } from '$lib/game/crate-color';

/**
 * Creates an industrial loading-bay drop-off tile.
 *
 * Origin convention: base-center — y=0 is the floor plane.
 * Footprint is exactly 1×1 (one world tile).
 *
 * @param options
 * @param options.scale  Uniform scale factor                       (default 1)
 * @param options.color  Required crate colour — omit for a plain bay (gold accent)
 * @returns THREE.Group
 */
export function createDropOffBay(options: {
	scale?: number;
	color?: CrateColor;
} = {}): THREE.Group {
	const {
		scale = 1,
		color,
	} = options;

	const group = new THREE.Group();

	const T  = 1.0    // tile footprint (1 world unit = 1 tile)
	const PH = 0.04   // platform slab height
	const LH = 0.07   // raised lip height
	const LW = 0.065  // lip width

	const accentColor = CRATE_COLORS[color ?? 'grey'];

	const matFloor  = new THREE.MeshStandardMaterial({ color: 0x252830, roughness: 0.75, metalness: 0.45, flatShading: true });
	const matLip    = new THREE.MeshStandardMaterial({ color: 0x3d4050, roughness: 0.55, metalness: 0.65, flatShading: true });
	const matAccent = new THREE.MeshStandardMaterial({ color: accentColor, emissive: new THREE.Color(accentColor), emissiveIntensity: 0.35, roughness: 0.40, metalness: 0.20, flatShading: true });

	// ─── Floor slab ──────────────────────────────────────────────────────────────
	const meshFloor = new THREE.Mesh(new THREE.BoxGeometry(T, PH, T), matFloor);
	meshFloor.position.y = PH / 2;
	group.add(meshFloor);

	// ─── Raised border lip ───────────────────────────────────────────────────────
	// Front/back strips span the full tile width; left/right fill between them.
	const lipInner = T - LW * 2;
	const lipY     = PH + LH / 2;
	for (const [geo, x, z] of [
		[new THREE.BoxGeometry(T,          LH, LW), 0,               T / 2 - LW / 2],  // front +Z
		[new THREE.BoxGeometry(T,          LH, LW), 0,              -T / 2 + LW / 2],  // back  -Z
		[new THREE.BoxGeometry(LW, LH, lipInner),   T / 2 - LW / 2,  0             ],  // right +X
		[new THREE.BoxGeometry(LW, LH, lipInner),  -T / 2 + LW / 2,  0             ],  // left  -X
	] as [THREE.BufferGeometry, number, number][]) {
		const m = new THREE.Mesh(geo, matLip);
		m.position.set(x, lipY, z);
		group.add(m);
	}

	// ─── Accent stripe on lip top ────────────────────────────────────────────────
	const SH      = 0.008
	const SW      = LW * 0.52
	const stripeY = PH + LH + SH / 2
	for (const [geo, x, z] of [
		[new THREE.BoxGeometry(T,          SH, SW), 0,               T / 2 - SW / 2],
		[new THREE.BoxGeometry(T,          SH, SW), 0,              -T / 2 + SW / 2],
		[new THREE.BoxGeometry(SW, SH, lipInner),   T / 2 - SW / 2,  0             ],
		[new THREE.BoxGeometry(SW, SH, lipInner),  -T / 2 + SW / 2,  0             ],
	] as [THREE.BufferGeometry, number, number][]) {
		const m = new THREE.Mesh(geo, matAccent);
		m.position.set(x, stripeY, z);
		group.add(m);
	}

	// ─── Floor markings ──────────────────────────────────────────────────────────
	const MH    = 0.006
	const markY = PH + MH / 2

	// Center cross — aiming marker
	const CL = T * 0.26
	const CW = T * 0.038
	for (const [w, d] of [[CL, CW], [CW, CL]] as [number, number][]) {
		const m = new THREE.Mesh(new THREE.BoxGeometry(w, MH, d), matAccent);
		m.position.y = markY;
		group.add(m);
	}

	// Corner L-brackets — standard warehouse floor markings
	// Each L is two arms meeting at the outer corner, opening toward the bay centre.
	const BL = T * 0.10   // arm length
	const BW = T * 0.025  // arm width
	const BO = T / 2 - LW - 0.04  // outer corner offset from tile centre
	for (const [cx, cz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as [number, number][]) {
		const mX = new THREE.Mesh(new THREE.BoxGeometry(BL, MH, BW), matAccent);
		mX.position.set(cx * (BO - BL / 2), markY, cz * BO);
		group.add(mX);
		const mZ = new THREE.Mesh(new THREE.BoxGeometry(BW, MH, BL), matAccent);
		mZ.position.set(cx * BO, markY, cz * (BO - BL / 2));
		group.add(mZ);
	}

	group.scale.setScalar(scale);
	return group;
}
