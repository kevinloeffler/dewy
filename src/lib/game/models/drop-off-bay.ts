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

/**
 * Creates a multi bay: a squat dark pipe, its rim in the colour it accepts, that crates
 * drop into and never come back out of.
 *
 * Origin convention: base-center — y=0 is the floor plane.
 * Just the pipe, with no slab of its own: the tile factory stands it on the
 * ordinary floor, the way it does a goal or a plate.
 *
 * Square, like the plain bay's lip, and built the same way: each ring is four
 * boxes. The bore is wider than a crate, so a crate the bay refuses can still
 * stand inside it, poking out over the rim. The throat is an opaque plate
 * just above the floor: a swallowed crate sinks through it out of sight.
 *
 * @param options
 * @param options.scale  Uniform scale factor                       (default 1)
 * @param options.color  Required crate colour — omit for a plain bay
 * @returns THREE.Group
 */
export function createMultiBay(options: {
	scale?: number;
	color?: CrateColor;
} = {}): THREE.Group {
	const {
		scale = 1,
		color,
	} = options;

	const group = new THREE.Group();

	// All half-widths, from the tile centre.
	const BORE   = 0.32   // inside of the walls — a 0.5 crate is 0.25
	const BODY   = 0.38   // outside of the walls
	const RIM    = 0.43   // outside of the rim
	const TOP    = 0.46   // height of the rim's top edge
	const RIM_H  = 0.12   // how tall the rim is
	const THROAT = 0.02

	const accentColor = CRATE_COLORS[color ?? 'grey'];

	// The plain bay's dark slab for the walls, so only the rim carries colour.
	const matBody   = new THREE.MeshStandardMaterial({ color: 0x252830, roughness: 0.75, metalness: 0.45, flatShading: true });
	const matPipe   = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.35, metalness: 0.15, flatShading: true });
	const matThroat = new THREE.MeshBasicMaterial({ color: 0x07080a });

	/**
	 * A square ring of four boxes between `inner` and `outer`, from `bottom`
	 * up `height`. Front and back span the full width; the sides fill between.
	 */
	const ring = (inner: number, outer: number, bottom: number, height: number, material: THREE.Material) => {
		const wall = outer - inner;
		const middle = (outer + inner) / 2;
		const y = bottom + height / 2;
		for (const [geo, x, z] of [
			[new THREE.BoxGeometry(outer * 2, height, wall), 0, middle],        // front +Z
			[new THREE.BoxGeometry(outer * 2, height, wall), 0, -middle],       // back  -Z
			[new THREE.BoxGeometry(wall, height, inner * 2), middle, 0],        // right +X
			[new THREE.BoxGeometry(wall, height, inner * 2), -middle, 0],       // left  -X
		] as [THREE.BufferGeometry, number, number][]) {
			const m = new THREE.Mesh(geo, material);
			m.position.set(x, y, z);
			group.add(m);
		}
	};

	// ─── Pipe ────────────────────────────────────────────────────────────────────
	const rimBottom = TOP - RIM_H;
	ring(BORE, BODY, 0, rimBottom, matBody);
	ring(BORE, RIM, rimBottom, RIM_H, matPipe);

	// ─── Corner L-brackets ───────────────────────────────────────────────────────
	// The plain bay's floor markings, moved up onto the rim — down on the floor
	// the pipe would cover them. Each L opens toward the bore.
	const MH = 0.006
	const BL = 0.09                // arm length — stops short of the bore
	const BW = 0.025               // arm width
	const BO = RIM - 0.03          // outer corner offset from the centre
	const markY = TOP + MH / 2
	for (const [cx, cz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as [number, number][]) {
		const mX = new THREE.Mesh(new THREE.BoxGeometry(BL, MH, BW), matBody);
		mX.position.set(cx * (BO - BL / 2 + BW / 2), markY, cz * BO);
		group.add(mX);
		const mZ = new THREE.Mesh(new THREE.BoxGeometry(BW, MH, BL), matBody);
		mZ.position.set(cx * BO, markY, cz * (BO - BL / 2 + BW / 2));
		group.add(mZ);
	}

	// ─── Throat ──────────────────────────────────────────────────────────────────
	const throat = new THREE.Mesh(new THREE.PlaneGeometry(BORE * 2, BORE * 2), matThroat);
	throat.rotation.x = -Math.PI / 2;
	throat.position.y = THROAT;
	group.add(throat);

	group.scale.setScalar(scale);
	return group;
}

/** How high a multi bay's counter floats, above the rim and clear of a crate. */
export const BAY_COUNTER_HEIGHT = 0.78;

/**
 * The "2/5" a multi bay shows above itself — a sprite, so it faces the
 * camera from any angle. Browser-only: it draws into a canvas.
 */
export type BayCounter = {
	sprite: THREE.Sprite;
	set(count: number, capacity: number): void;
	dispose(): void;
};

export function createBayCounter(): BayCounter {
	const canvas = document.createElement('canvas');
	canvas.width = 128;
	canvas.height = 64;
	const context = canvas.getContext('2d')!;
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	const material = new THREE.SpriteMaterial({ map: texture, depthWrite: false });
	const sprite = new THREE.Sprite(material);
	sprite.scale.set(0.44, 0.22, 1);
	sprite.position.y = BAY_COUNTER_HEIGHT;
	sprite.name = 'bayCounter';

	let shown = '';
	return {
		sprite,
		set(count, capacity) {
			const text = `${count}/${capacity}`;
			const full = count >= capacity;
			const key = `${text}${full}`;
			if (key === shown) return;
			shown = key;

			const { width, height } = canvas;
			const radius = height / 2;
			context.clearRect(0, 0, width, height);
			context.beginPath();
			context.roundRect(2, 2, width - 4, height - 4, radius - 2);
			context.fillStyle = full ? '#2f8f5b' : 'rgba(20, 22, 28, 0.85)';
			context.fill();
			context.lineWidth = 3;
			context.strokeStyle = full ? '#8fe0b2' : 'rgba(255, 255, 255, 0.35)';
			context.stroke();
			context.fillStyle = '#ffffff';
			context.font = `bold ${text.length > 4 ? 30 : 36}px system-ui, sans-serif`;
			context.textAlign = 'center';
			context.textBaseline = 'middle';
			context.fillText(text, width / 2, height / 2 + 2);
			texture.needsUpdate = true;
		},
		dispose() {
			texture.dispose();
			material.dispose();
		},
	};
}
