import * as THREE from 'three';
import { disposeObject } from '$lib/game/three-utils';

/**
 * Low-poly rounded box: an extruded rounded rectangle whose bevel does all
 * the rounding (1 bevel segment, 2 curve segments). Chamfered rather than
 * filleted — at isometric game size that reads as "rounded" for a fraction
 * of the triangles, which is the whole point of Tug's build.
 *
 * w/h/d are the OUTER dimensions; r is the corner/edge radius. Centred at
 * the origin.
 */
function chamferBox(w: number, h: number, d: number, r: number): THREE.BufferGeometry {
	const bevel = Math.min(r, d / 2 - 0.001);
	const rr = Math.max(0.001, r - bevel);
	const x = w / 2 - bevel, y = h / 2 - bevel;

	const shape = new THREE.Shape();
	shape.moveTo(-x + rr, -y);
	shape.lineTo( x - rr, -y);
	shape.quadraticCurveTo( x, -y,  x, -y + rr);
	shape.lineTo( x,  y - rr);
	shape.quadraticCurveTo( x,  y,  x - rr,  y);
	shape.lineTo(-x + rr,  y);
	shape.quadraticCurveTo(-x,  y, -x,  y - rr);
	shape.lineTo(-x, -y + rr);
	shape.quadraticCurveTo(-x, -y, -x + rr, -y);

	const geo = new THREE.ExtrudeGeometry(shape, {
		depth: d - bevel * 2,
		bevelEnabled: true,
		bevelSize: bevel,
		bevelThickness: bevel,
		bevelSegments: 1,
		curveSegments: 2,
	});
	geo.translate(0, 0, -(d - bevel * 2) / 2);
	return geo;
}

/**
 * Stadium (capsule cross-section) extrusion — the tank treads.
 * `len` runs along X, `h` along Y, `d` along Z.
 */
function stadium(len: number, h: number, d: number, segs: number): THREE.BufferGeometry {
	const r = h / 2, x = len / 2 - r;
	const shape = new THREE.Shape();
	shape.absarc( x, 0, r, -Math.PI / 2, Math.PI / 2, false);
	shape.absarc(-x, 0, r, Math.PI / 2, (Math.PI * 3) / 2, false);

	const geo = new THREE.ExtrudeGeometry(shape, {
		depth: d,
		bevelEnabled: true,
		bevelSize: 0.012,
		bevelThickness: 0.012,
		bevelSegments: 1,
		curveSegments: segs,
	});
	geo.translate(0, 0, -d / 2);
	return geo;
}

// The loader is one rigid boom off a shoulder mounted on the chassis flank.
// It points along local +Z, so a *positive* rotation.x swings it down toward
// the floor and a negative one lifts it.
//
// Where the crate is carried is not a free choice. Dewy's crate is a 0.5-unit
// cube — over two thirds of Tug's chassis depth — so the only pocket of space
// that clears the tracks, the chassis and the head at once is low and well out
// in front. Carried any higher it hides Tug's face from the isometric camera;
// any closer and it intersects the hull. Hence the long reach: BOOM_LENGTH is
// what it takes to put the jaws in that pocket.
const BOOM_LENGTH = 0.479;  // shoulder → jaw centre, where the crate is held

const BOOM_REST   =  0.470; // idle — jaws dropped toward the floor, scoop-ready
const BOOM_RAISED = -0.113; // carrying — jaws up to the carry pocket

const ARM_SMOOTH = 8;       // exponential smoothing rate (higher = snappier)

/** Radius the hubs roll on, model-local. */
const HUB_RADIUS = 0.095;

/**
 * The stadium bevel rounds the tread outline outward on every side, dropping
 * its underside below the shape's nominal bottom edge. Lift the tracks by that
 * much so the model still rests exactly on y = 0.
 */
const TRACK_Y = 0.15 + 0.012;

/** How long the crash animation runs, in seconds. */
export const PANIC_DURATION = 0.9;
const PANIC_SHAKE = 0.055;  // peak positional shake, world units
const PANIC_HZ    = 14;     // shake frequency

/**
 * Live handle returned by createRoboter.
 * Add `group` to the scene; call `update` every frame.
 *
 * The model exposes *poses*, not tweens: `World` owns all timing and drives
 * `setPosition` / `setYaw` from its animation queue. Only the self-timed,
 * cosmetic motion (boom swing, crash shake) lives in here, and none of it
 * ever gates the queue.
 */
export interface Roboter {
	/** THREE.Group — add this to the scene */
	group: THREE.Group;

	/** Place the robot, in world units. Shake offsets are applied on top. */
	setPosition(x: number, z: number): void;
	/**
	 * Set the yaw in radians. Kept **unwrapped** and continuous, so tweening
	 * by ±π/2 always turns the short way and four right turns spin a full
	 * circle instead of snapping back.
	 */
	setYaw(radians: number): void;
	getYaw(): number;
	/** Spin the drive hubs as if the robot had travelled `distance` world units. */
	rollWheels(distance: number): void;

	/**
	 * Raise the boom to carry position.
	 * `immediate` snaps there instead of easing — for `applyState`, which
	 * restores a carried crate with no animation and would otherwise leave it
	 * clipping through the chassis for the length of the ease.
	 */
	pickUp(immediate?: boolean): void;
	/** Lower the boom back to rest. `immediate` snaps, as above. */
	lower(immediate?: boolean): void;
	/**
	 * Anchor for a carried crate — swings with the boom.
	 * Parent objects with `.attach()`, never `.add()`: the robot group is
	 * scaled, and only `attach()` preserves the object's world size.
	 */
	readonly carrySlot: THREE.Object3D;

	/** Crash animation — shake and flash. Returns its duration in seconds. */
	panic(): number;
	/** Clear transient state (shake, eye colour). Used on reset. */
	resetPose(): void;

	/**
	 * Advance animations. Call once per frame with the elapsed time in seconds.
	 * Typically: `roboter.update(clock.getDelta())`
	 */
	update(deltaSeconds: number): void;

	/** Release every geometry and material this model created. */
	dispose(): void;
}

/**
 * Creates the Dewy robot character — "Tug", a tracked hauler.
 *
 * The silhouette is what has to read at isometric game size, so the detail
 * budget goes there: wide treads, a blocky chassis, a big visor head, and two
 * forward claws on a lifting boom. Everything is chamfered boxes and coarse
 * cylinders — no smooth fillets, no stalks, no ear caps.
 *
 * Materials stay at metalness ≤ 0.35 on purpose: the scene has no environment
 * map, so anything more metallic has nothing to reflect and renders near-black.
 * The metal look is carried by a brighter base colour instead.
 *
 * Origin convention: base-center — y=0 is the floor plane.
 * At scale 1 the tracks span 0.88 × 0.86 and the head tops out at 0.93; the
 * claws reach ahead of the tracks, as a loader's should.
 *
 * Named sub-groups via group.getObjectByName():
 *   "chassis" | "head" | "eyes" | "wheels" | "armL" | "armR"
 *
 * @param options
 * @param options.scale       Uniform scale factor (default 1)
 * @param options.bodyColor   Shell / hull colour hex   (default 0xf3e9da — cream)
 * @param options.accentColor Stripe, hubs, claw colour (default 0xe8703a — burnt orange)
 * @param options.wheelColor  Tread colour hex          (default 0x24282c — rubber)
 * @param options.eyeColor    Emissive lens colour      (default 0x7ff0d8 — mint)
 * @param options.armsRaised  Start with the boom in carry position (default false)
 * @returns Roboter
 */
export function createRoboter(options: {
	scale?: number;
	bodyColor?: number;
	accentColor?: number;
	wheelColor?: number;
	eyeColor?: number;
	armsRaised?: boolean;
} = {}): Roboter {
	const {
		scale       = 1,
		bodyColor   = 0xf3e9da,
		accentColor = 0xe8703a,
		wheelColor  = 0x24282c,
		eyeColor    = 0x7ff0d8,
		armsRaised  = false,
	} = options;

	const group = new THREE.Group();
	// Loader animation state — shared across both arms and the carry chain.
	let raised = armsRaised;
	const boomPivots: THREE.Group[] = [];

	// ─── Materials ───────────────────────────────────────────────────────────────
	const matShell  = new THREE.MeshStandardMaterial({ color: bodyColor,   roughness: 0.45, metalness: 0.05 });
	const matAccent = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.40, metalness: 0.10 });
	// Slate is lifted well above Tug's 0x3a4047: these parts sit right against
	// the near-black tracks, and with no environment map the metalness cannot
	// separate them — only the base colour can.
	const matMetal  = new THREE.MeshStandardMaterial({ color: 0x5a6472,    roughness: 0.35, metalness: 0.35 });
	const matRubber = new THREE.MeshStandardMaterial({ color: wheelColor,  roughness: 0.85, metalness: 0.00 });
	const matGlass  = new THREE.MeshStandardMaterial({ color: 0x1d2933,    roughness: 0.15, metalness: 0.20 });
	const matEye    = new THREE.MeshStandardMaterial({ color: eyeColor, emissive: new THREE.Color(eyeColor), emissiveIntensity: 0.60, roughness: 0.30, metalness: 0.00 });

	// ─── Tracks ──────────────────────────────────────────────────────────────────
	// One stadium shell per side with two drive hubs each. The shells are static
	// scenery; only the hubs turn, which is what a sprocket inside a track does.
	const wheelsGroup = new THREE.Group();
	wheelsGroup.name = 'wheels';

	// stadium() lays the capsule out along X; rotate it so the length runs along
	// Z (forward) and the extrusion depth becomes the track's width.
	const geoTread = stadium(0.86, 0.30, 0.22, 6);
	geoTread.rotateY(Math.PI / 2);

	const geoHub = new THREE.CylinderGeometry(HUB_RADIUS, HUB_RADIUS, 0.25, 10);
	geoHub.rotateZ(Math.PI / 2);   // axis along X, so mesh.rotation.x is the roll
	const geoHubBar = new THREE.BoxGeometry(0.020, 0.090, 0.020);

	/** Hubs only — `rollWheels` turns these, never the track shells. */
	const hubs: THREE.Group[] = [];

	for (const side of [-1, 1] as const) {
		const tread = new THREE.Mesh(geoTread, matRubber);
		tread.position.set(side * 0.33, TRACK_Y, 0);
		wheelsGroup.add(tread);

		for (const hz of [-0.26, 0.26]) {
			const hub = new THREE.Group();
			hub.add(new THREE.Mesh(geoHub, matAccent));

			// A bar across the outer face — a bare decagon gives the eye nothing
			// to track, so without this the roll is invisible.
			const bar = new THREE.Mesh(geoHubBar, matMetal);
			bar.position.x = side * 0.132;
			hub.add(bar);

			hub.position.set(side * 0.33, TRACK_Y, hz);
			wheelsGroup.add(hub);
			hubs.push(hub);
		}
	}

	group.add(wheelsGroup);

	// ─── Chassis ─────────────────────────────────────────────────────────────────
	// Blocky hull, y: 0.25 → 0.61, with the accent stripe wrapping its waist.
	const chassis = new THREE.Group();
	chassis.name = 'chassis';

	const meshHull = new THREE.Mesh(chamferBox(0.62, 0.36, 0.78, 0.07), matShell);
	meshHull.position.y = 0.43;
	chassis.add(meshHull);

	const meshStripe = new THREE.Mesh(chamferBox(0.64, 0.09, 0.60, 0.03), matAccent);
	meshStripe.position.y = 0.30;
	chassis.add(meshStripe);

	group.add(chassis);

	// ─── Head ────────────────────────────────────────────────────────────────────
	// The group's origin sits at the chassis/head seam (y 0.61), so the panic
	// tilt reads as the head rocking on its mount rather than sliding sideways.
	const head = new THREE.Group();
	head.name = 'head';
	head.position.set(0, 0.61, 0.03);

	const meshHead = new THREE.Mesh(chamferBox(0.48, 0.32, 0.36, 0.08), matShell);
	meshHead.position.y = 0.16;
	head.add(meshHead);

	const meshVisor = new THREE.Mesh(chamferBox(0.38, 0.20, 0.06, 0.05), matGlass);
	meshVisor.position.set(0, 0.18, 0.17);
	head.add(meshVisor);

	// Two low-res glow spheres sunk into the visor — the whole face, no stalks.
	const eyes = new THREE.Group();
	eyes.name = 'eyes';
	const geoEye = new THREE.SphereGeometry(0.05, 10, 6);
	for (const ex of [-0.09, 0.09]) {
		const eye = new THREE.Mesh(geoEye, matEye);
		eye.position.set(ex, 0.18, 0.195);
		eyes.add(eye);
	}
	head.add(eyes);

	group.add(head);

	// ─── Loader boom ─────────────────────────────────────────────────────────────
	// Shoulder sits on the chassis flank, forward of centre and just inside the
	// tracks. The boom is built along local +Z, so the pivot's `rotation.x` is
	// its angle. At BOOM_REST the jaw tips clear the floor by ≈ 0.04.

	const geoShoulder = new THREE.CylinderGeometry(0.090, 0.090, 0.130, 8);
	geoShoulder.rotateZ(Math.PI / 2);

	// Deliberately chunky. Thinner sections and a wider jaw gap made the pair
	// read as legs on a walking robot rather than as hydraulics on a hauler.
	const geoBoom     = chamferBox(0.13, 0.15, 0.44, 0.045);
	const geoJawUpper = chamferBox(0.17, 0.10, 0.30, 0.035);
	const geoJawLower = chamferBox(0.17, 0.10, 0.30, 0.035);

	/**
	 * A shoulder with the boom hanging off it. `x` is where the shoulder sits;
	 * pass 0 for the invisible carry chain.
	 */
	const buildBoom = (x: number) => {
		const root = new THREE.Group();
		root.position.set(x, 0.42, 0.25);

		const pivot = new THREE.Group();
		pivot.rotation.x = armsRaised ? BOOM_RAISED : BOOM_REST;
		boomPivots.push(pivot);
		root.add(pivot);

		return { root, pivot };
	};

	const buildArm = (side: 1 | -1, name: string): THREE.Group => {
		const { root, pivot } = buildBoom(side * 0.38);
		root.name = name;

		// Shoulder cap stays on the root — it is the joint, so it must not turn.
		// Accent, matching the boom, so the arm visibly mounts to the hull
		// instead of floating alongside it.
		root.add(new THREE.Mesh(geoShoulder, matAccent));

		// Accent, not metal: the boom runs the length of the tracks, and it is
		// the only part that moves — it has to be the thing the eye catches.
		const meshBoom = new THREE.Mesh(geoBoom, matAccent);
		meshBoom.position.z = 0.22;
		pivot.add(meshBoom);

		// Light jaw over dark jaw — the two-tone split is what makes the claw
		// legible against the crate it is holding. Both jaws clear the crate in
		// x, so they bracket it rather than passing through it.
		const jawUpper = new THREE.Mesh(geoJawUpper, matShell);
		jawUpper.position.set(0, 0.065, BOOM_LENGTH);
		jawUpper.rotation.x = -0.22;
		pivot.add(jawUpper);

		const jawLower = new THREE.Mesh(geoJawLower, matMetal);
		jawLower.position.set(0, -0.055, BOOM_LENGTH + 0.01);
		jawLower.rotation.x = 0.20;
		pivot.add(jawLower);

		return root;
	};

	group.add(buildArm( 1, 'armR'));
	group.add(buildArm(-1, 'armL'));

	// ─── Carry slot ──────────────────────────────────────────────────────────────
	// A third, invisible boom on the centre line, its pivot on the same list as
	// the arms'. A held crate inherits the boom smoothing for free — no per-frame
	// work in World, and it can never drift out of the jaws.
	const carryBoom = buildBoom(0);
	carryBoom.root.name = 'carryBoom';

	const carrySlot = new THREE.Group();
	carrySlot.name = 'carry';
	carrySlot.position.z = BOOM_LENGTH;   // between the jaws
	carryBoom.pivot.add(carrySlot);
	group.add(carryBoom.root);

	group.scale.setScalar(scale);

	// ─── Pose state ──────────────────────────────────────────────────────────────
	// Base transform, kept separate from transient shake so the two never fight.
	let baseX = 0;
	let baseZ = 0;
	let yaw   = 0;
	let panicRemaining = 0;

	const eyeRestColor = new THREE.Color(eyeColor);
	const eyePanicColor = new THREE.Color(0xff2a2a);

	/** Drop both links straight onto the current target pose, no easing. */
	const snapPose = () => {
		for (const pivot of boomPivots) pivot.rotation.x = raised ? BOOM_RAISED : BOOM_REST;
	};

	const applyTransform = () => {
		group.position.set(baseX, group.position.y, baseZ);
		group.rotation.y = yaw;
	};

	return {
		group,
		carrySlot,

		setPosition(x: number, z: number) { baseX = x; baseZ = z; applyTransform(); },
		setYaw(radians: number)           { yaw = radians; applyTransform(); },
		getYaw()                          { return yaw; },

		rollWheels(distance: number) {
			// `distance` is in world units but the hub radius is model-local,
			// so undo the group scale before converting to radians.
			const radians = distance / (HUB_RADIUS * scale);
			for (const hub of hubs) hub.rotation.x += radians;
		},

		pickUp(immediate = false) { raised = true;  if (immediate) snapPose(); },
		lower(immediate = false)  { raised = false; if (immediate) snapPose(); },

		panic() {
			panicRemaining = PANIC_DURATION;
			return PANIC_DURATION;
		},

		resetPose() {
			panicRemaining = 0;
			head.rotation.z = 0;
			matEye.emissive.copy(eyeRestColor);
			matEye.emissiveIntensity = 0.60;
			raised = false;
			snapPose();
			applyTransform();
		},

		update(deltaSeconds: number) {
			// Exponential smoothing — framerate-independent ease-out.
			// Asymptotic on purpose: this is ambient motion and is never awaited.
			const t = 1 - Math.exp(-ARM_SMOOTH * deltaSeconds);
			const target = raised ? BOOM_RAISED : BOOM_REST;
			for (const pivot of boomPivots) {
				pivot.rotation.x += (target - pivot.rotation.x) * t;
			}

			if (panicRemaining <= 0) return;

			panicRemaining = Math.max(0, panicRemaining - deltaSeconds);
			const progress = panicRemaining / PANIC_DURATION;   // 1 → 0
			const phase = (1 - progress) * PANIC_DURATION * PANIC_HZ * Math.PI * 2;
			const amplitude = PANIC_SHAKE * progress;

			group.position.x = baseX + Math.sin(phase) * amplitude;
			group.position.z = baseZ + Math.cos(phase * 0.7) * amplitude * 0.6;
			// Shallow on purpose: the head's underside sits flush on the chassis,
			// so a wider rock would crack a gap open at the seam.
			head.rotation.z = Math.sin(phase * 0.5) * 0.14 * progress;
			matEye.emissive.copy(eyeRestColor).lerp(eyePanicColor, progress);
			matEye.emissiveIntensity = 0.60 + Math.abs(Math.sin(phase * 0.5)) * progress;

			if (panicRemaining === 0) {
				head.rotation.z = 0;
				matEye.emissive.copy(eyeRestColor);
				matEye.emissiveIntensity = 0.60;
				applyTransform();
			}
		},

		dispose() { disposeObject(group); },
	};
}
