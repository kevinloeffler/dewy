import * as THREE from 'three';
import { darkenColor } from '$lib/util';
import { CRATE_COLORS, type CrateColor } from '$lib/game/crate-color';

/**
 * Creates an Aperture-Science–inspired storage crate.
 *
 * @param options
 * @param options.scale  Uniform scale factor (default 1)
 * @param options.color  Crate colour — omit for a grey (uncoloured) crate
 * @returns THREE.Group
 */
export function createCrate(options: {
	scale?: number;
	color?: CrateColor;
} = {}): THREE.Group {
	const {
		scale = 1,
		color,
	} = options;

	const colorHex = CRATE_COLORS[color ?? 'grey'];

	const group = new THREE.Group();

	const S  = 0.5
	const hs = S / 2

	// ─── Colors
	const frameColor = darkenColor(colorHex, 0)
	const panelColor = colorHex

	// ─── Materials ───────────────────────────────────────────────────────────────
	const matFrame = new THREE.MeshStandardMaterial({ color: frameColor, roughness: 0.3, metalness: 0.5, flatShading: true });
	const matPanel = new THREE.MeshStandardMaterial({ color: panelColor, roughness: 0.3, metalness: 0.1, flatShading: true });

	// ─── Dark metallic frame cube ─────────────────────────────────────────────────
	// The full-size cube acts as the dark border visible around each panel
	const meshBase = new THREE.Mesh(new THREE.BoxGeometry(S, S, S), matFrame);
	meshBase.position.y = hs;
	group.add(meshBase);

	// ─── Face panels ─────────────────────────────────────────────────────────────
	// Each face gets a light-coloured square panel that protrudes slightly.
	// At 68% of face width the dark frame border is ~16% of S on each side.
	const pW = S * 0.68
	const pT = 0.02    // protrusion depth

	const geoFB = new THREE.BoxGeometry(pW, pW, pT); // front / back (XY)
	const geoTB = new THREE.BoxGeometry(pW, pT, pW); // top  / bottom (XZ)
	const geoLR = new THREE.BoxGeometry(pT, pW, pW); // left / right  (YZ)

	const panels: [THREE.BufferGeometry, THREE.Vector3][] = [
		[geoFB, new THREE.Vector3(0,   hs,       hs + pT / 2)],  // front  +Z
		[geoFB, new THREE.Vector3(0,   hs,      -hs - pT / 2)],  // back   -Z
		[geoTB, new THREE.Vector3(0,   S + pT / 2, 0)],          // top    +Y
		[geoTB, new THREE.Vector3(0,  -pT / 2,    0)],           // bottom -Y
		[geoLR, new THREE.Vector3(hs + pT / 2,  hs, 0)],         // right  +X
		[geoLR, new THREE.Vector3(-hs - pT / 2, hs, 0)],         // left   -X
	];
	for (const [geo, pos] of panels) {
		const m = new THREE.Mesh(geo, matPanel);
		m.position.copy(pos);
		group.add(m);
	}


	group.scale.setScalar(scale);
	return group;
}
