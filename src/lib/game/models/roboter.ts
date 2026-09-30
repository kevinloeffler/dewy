import * as THREE from 'three';
import { disposeObject } from '$lib/game/three-utils';
import type { Reaction } from '$lib/game/reactions';

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

/** How long one wave runs, in seconds: lift, three swings, lower. */
export const WAVE_DURATION = 1.8;
const WAVE_SWINGS = 3;

/** How long the goal celebration runs, in seconds. */
export const CELEBRATE_DURATION = 1.6;
const CELEBRATE_HOP = 0.18; // peak hop height, model units

/**
 * How far a gesture lifts an arm at the shoulder. The boom rests at +0.47
 * (tipped down), so this brings it to about 80° up — high enough to read as
 * raised, short of straight up so the jaws still lean toward the viewer.
 */
const GESTURE_LIFT = -1.85;
/** Share of a gesture spent easing in, and again easing out. */
const GESTURE_RAMP = 0.2;

/** 0 → 1 → 0 over a gesture's progress `p`, eased at both ends. */
function gestureEnvelope(p: number): number {
	const ramp = Math.min(p / GESTURE_RAMP, (1 - p) / GESTURE_RAMP, 1);
	return ramp * ramp * (3 - 2 * ramp);
}

function easeInOut(t: number): number {
	const c = Math.min(1, Math.max(0, t));
	return c * c * (3 - 2 * c);
}

/**
 * 0 → 1 → 0 across the window `from`..`to` of a gesture's progress, eased at
 * both ends by `ramp` of the window. For the parts of a reaction that come
 * and go inside it rather than spanning all of it.
 */
function window01(p: number, from: number, to: number, ramp = 0.25): number {
	if (p <= from || p >= to) return 0;
	const local = (p - from) / (to - from);
	const r = Math.min(local / ramp, (1 - local) / ramp, 1);
	return r * r * (3 - 2 * r);
}

/** 1 at rest, dipping to 0.1 for a blink centred on `at`. */
function blink(p: number, at: number, width = 0.05): number {
	return 1 - 0.9 * Math.max(0, 1 - Math.abs(p - at) / width);
}

/**
 * How long each reaction runs, in seconds. World holds its queue for exactly
 * this long at speed 1, so the error toast lands as the robot finishes.
 */
export const REACTION_DURATIONS: Record<Reaction, number> = {
	collide:    1.3,
	strain:     1.5,
	fall:       1.4,
	confused:   1.7,
	caught:     1.4,
	power_down: 2.2,
	overheat:   2.2,
	shrug:      1.2,
};

/**
 * Reactions that end in a pose rather than back at rest: a robot that fell
 * down a hole, got caught or ran flat should still look it until the student
 * resets. `resetPose` is what lets go of them.
 */
const STICKY: ReadonlySet<Reaction> = new Set(['fall', 'caught', 'power_down']);

/**
 * Live handle returned by createRoboter.
 * Add `group` to the scene; call `update` every frame.
 *
 * The model exposes *poses*, not tweens: `World` owns all timing and drives
 * `setPosition` / `setYaw` from its animation queue. Only the self-timed,
 * cosmetic motion (boom swing, gestures, reactions) lives in here, and none of it
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

	/**
	 * React to a failed run — see `reactions.ts` for what each one means.
	 * Returns its duration in seconds. `fall`, `caught` and `power_down` hold
	 * their final pose until `resetPose`; the rest end back at rest.
	 */
	react(reaction: Reaction): number;
	/**
	 * Wave hello with the arm on the model's -x side — the one nearer a viewer
	 * looking from the front and a little to that side. Returns its duration
	 * in seconds. Purely cosmetic: position and yaw are left where they are.
	 */
	wave(): number;
	/**
	 * Goal celebration — two hops, a full spin, both arms up and the eyes
	 * brightening. Returns its duration in seconds. The spin is an offset on
	 * top of the yaw, so the robot ends facing exactly where it started. The
	 * arms stay down while carrying, so the claws never leave the crate.
	 */
	celebrate(): number;

	/** Clear transient state (reactions, eye colour, gestures). Used on reset. */
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
	// Everything visible hangs off `body`, not `group`: the group carries the
	// placement World drives, the body carries the reactions' tip and slump,
	// pivoted on a track edge rather than the model's centre.
	const body = new THREE.Group();
	body.name = 'body';
	group.add(body);
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

	body.add(wheelsGroup);

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

	body.add(chassis);

	// ─── Head ────────────────────────────────────────────────────────────────────
	// The group's origin sits at the chassis/head seam (y 0.61), so a reaction's
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
	/** Scaled one by one to blink and squint — scaling the group would drag them down the visor. */
	const eyeMeshes: THREE.Mesh[] = [];
	for (const ex of [-0.09, 0.09]) {
		const eye = new THREE.Mesh(geoEye, matEye);
		eye.position.set(ex, 0.18, 0.195);
		eyes.add(eye);
		eyeMeshes.push(eye);
	}
	head.add(eyes);

	body.add(head);

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
		// Gestures turn the root, never the pivot inside it: `update` eases the
		// pivot to the boom's target every frame, and would fight them. ZYX so
		// the lift (x) happens first and the swing (z) then tips the raised arm
		// sideways, rather than twisting it on its own axis.
		root.rotation.order = 'ZYX';

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

	const armR = buildArm( 1, 'armR');
	const armL = buildArm(-1, 'armL');
	body.add(armR, armL);

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
	body.add(carryBoom.root);

	// ─── Steam ───────────────────────────────────────────────────────────────────
	// A few puffs above the head for `overheat`, hidden the rest of the time.
	// One material shared by all of them, so fading is a single opacity write.
	const matSteam = new THREE.MeshStandardMaterial({
		color: 0xffffff, roughness: 1, metalness: 0, transparent: true, opacity: 0, depthWrite: false,
	});
	const geoPuff = new THREE.SphereGeometry(0.07, 8, 6);
	const puffs: THREE.Mesh[] = [];
	for (let i = 0; i < 4; i++) {
		const puff = new THREE.Mesh(geoPuff, matSteam);
		puff.visible = false;
		body.add(puff);
		puffs.push(puff);
	}

	group.scale.setScalar(scale);

	// ─── Pose state ──────────────────────────────────────────────────────────────
	// Base transform, kept separate from the gesture offsets so the two never
	// fight. Offsets are in model units; `applyTransform` scales them.
	let baseX = 0;
	let baseZ = 0;
	let yaw   = 0;

	type GestureKind = 'wave' | 'celebrate' | Reaction;
	let gesture: { kind: GestureKind; elapsed: number } | null = null;
	let hop    = 0;
	let spin   = 0;
	let shakeX = 0;
	let shakeZ = 0;

	const eyeRestColor  = new THREE.Color(eyeColor);
	const eyeAlarmColor = new THREE.Color(0xff2a2a);
	const eyeAmberColor = new THREE.Color(0xffb020);
	const eyeHotColor   = new THREE.Color(0xff7a1a);
	const eyeDeadColor  = new THREE.Color(0x1d2933);  // the visor glass: an eye that is off

	/** Drop both links straight onto the current target pose, no easing. */
	const snapPose = () => {
		for (const pivot of boomPivots) pivot.rotation.x = raised ? BOOM_RAISED : BOOM_REST;
	};

	const applyTransform = () => {
		group.position.set(baseX + shakeX * scale, hop * scale, baseZ + shakeZ * scale);
		group.rotation.y = yaw + spin;
	};

	/**
	 * Tip the body forward (positive `pitch`) or back about a line across the
	 * tracks at `pivotZ` — the front edge to lean in, the rear edge to rear
	 * up — so it rocks on its treads instead of sinking through the floor.
	 */
	const tilt = (pitch: number, pivotZ: number, sink = 0) => {
		body.rotation.x = pitch;
		body.position.set(0, pivotZ * Math.sin(pitch) - sink, pivotZ * (1 - Math.cos(pitch)));
	};

	const setEyes = (color: THREE.Color, intensity: number) => {
		matEye.emissive.copy(color);
		matEye.emissiveIntensity = intensity;
	};

	/** Squash (< 1) to blink or squint, stretch (> 1) to widen in alarm. */
	const setEyeShape = (height: number, width = 1) => {
		for (const eye of eyeMeshes) eye.scale.set(width, height, 1);
	};

	/**
	 * Both arms together, mirrored: `lift` at the shoulder, `spread` tipping
	 * each one outward. Skipped while carrying, like the celebration, so the
	 * claws never leave the crate.
	 */
	const setArms = (lift: number, spread: number) => {
		if (raised) return;
		armL.rotation.x = armR.rotation.x = lift;
		armL.rotation.z = spread;
		armR.rotation.z = -spread;
	};

	/** Put everything a gesture touches back to rest. */
	const clearGesture = () => {
		gesture = null;
		hop = 0;
		spin = 0;
		shakeX = 0;
		shakeZ = 0;
		tilt(0, 0);
		body.rotation.z = 0;
		armL.rotation.set(0, 0, 0);
		armR.rotation.set(0, 0, 0);
		head.rotation.set(0, 0, 0);
		matEye.color.set(eyeColor);
		setEyes(eyeRestColor, 0.60);
		setEyeShape(1);
		matSteam.opacity = 0;
		for (const puff of puffs) puff.visible = false;
		applyTransform();
	};

	/** Pose the wave at progress `p` (0 → 1). */
	const poseWave = (p: number) => {
		const e = gestureEnvelope(p);
		const swing = Math.sin(p * WAVE_SWINGS * Math.PI * 2);
		armL.rotation.x = GESTURE_LIFT * e;
		// Positive z tips this arm outward, away from the head, so the swing
		// stays off-centre and never clips the visor.
		armL.rotation.z = (0.4 + 0.25 * swing) * e;
		// A small head tilt toward the waving arm, as if leaning into it.
		head.rotation.z = 0.06 * e;
	};

	/** Pose the celebration at progress `p` (0 → 1). */
	const poseCelebrate = (p: number) => {
		const e = gestureEnvelope(p);

		// Two hops, landing between them and at the end.
		hop = Math.abs(Math.sin(p * Math.PI * 2)) * CELEBRATE_HOP;
		// One full turn through the middle, so it starts and ends at rest.
		spin = easeInOut((p - 0.2) / 0.6) * Math.PI * 2;
		applyTransform();

		if (!raised) {
			// Both arms up and pumping, mirrored — z tips each one outward.
			const pump = 0.12 * Math.sin(p * Math.PI * 6);
			setArms((GESTURE_LIFT + pump) * e, 0.35 * e);
		}
		// Look up a touch. Shallow because the head sits flush on the
		// chassis: a wider rock cracks a gap open at the seam.
		head.rotation.x = -0.08 * e;
		matEye.emissiveIntensity = 0.60 + 0.9 * e;
	};

	// ─── Reactions ───────────────────────────────────────────────────────────────
	// Each pose is a pure function of progress `p` (0 → 1, held at 1 for a
	// sticky reaction) and the seconds since it started, which drive anything
	// that oscillates at a fixed rate regardless of the reaction's length.
	// Only `strain` needs the frame delta, to spin the hubs.
	type Pose = (p: number, seconds: number, dt: number) => void;

	const REACTION_POSES: Record<Reaction, Pose> = {
		collide(p, s) {
			// Rear up onto the back of the tracks and drop back, twice, each
			// bounce lower: |sin| lands on the floor between them.
			const rear = Math.exp(-5 * p) * Math.abs(Math.sin(p * 10));
			tilt(-0.5 * rear, -0.43);
			// The arms fling up with the knock.
			setArms(-0.6 * rear, 0.15 * rear);

			// Then the dizzy wobble: the head circling on its mount.
			const dizzy = window01(p, 0.2, 1, 0.3);
			const phase = s * Math.PI * 2 * 1.6;
			head.rotation.z = 0.12 * Math.sin(phase) * dizzy;
			head.rotation.x = 0.06 * Math.cos(phase) * dizzy;

			// A white flash on impact, squinting through the dizziness.
			setEyes(eyeRestColor, 0.6 + 1.6 * Math.exp(-10 * p));
			setEyeShape(1 - 0.6 * dizzy);
		},

		strain(p, s, dt) {
			// Lean into the crate, lifting the rear, tracks spinning uselessly.
			const effort = window01(p, 0, 0.72, 0.2);
			tilt(0.12 * effort, 0.43);
			for (const hub of hubs) hub.rotation.x += dt * 18 * effort;
			shakeX = 0.012 * Math.sin(s * Math.PI * 2 * 22) * effort;
			setArms(-0.3 * effort, 0);
			setEyeShape(1 - 0.65 * effort);

			// Give up: a sigh, head dropping.
			const sigh = window01(p, 0.62, 1, 0.3);
			head.rotation.x = 0.14 * sigh;
			setEyes(eyeRestColor, 0.6 - 0.3 * sigh);
			applyTransform();
		},

		fall(p, s) {
			// A cartoon beat hanging over the hole, eyes wide and looking
			// down, arms flailing — then gravity.
			const hang = 0.3;
			const alarm = Math.min(1, p / 0.08);
			setEyeShape(1 + 0.35 * alarm, 1 + 0.2 * alarm);
			setEyes(eyeRestColor, 0.6 + 0.8 * alarm);
			head.rotation.x = 0.14 * alarm;
			setArms((-1.2 + 0.3 * Math.sin(s * Math.PI * 2 * 5)) * alarm, 0.5 * alarm);

			const t = Math.max(0, (p - hang) / (1 - hang));
			// Deep enough to clear the pit's floor at the smallest scale World
			// draws Dewy at, so it vanishes under the void instead of standing
			// in it.
			hop = -3.2 * t * t;
			tilt(0.9 * t, 0);
			applyTransform();
		},

		confused(p) {
			const e = gestureEnvelope(p);
			// Head cocked, looking one way and the other.
			head.rotation.z = 0.1 * e;
			head.rotation.y = 0.4 * Math.sin(p * Math.PI * 2 * 1.5) * e;
			// Arms out, palms up: "what do you want me to do?"
			setArms(-0.8 * e, 0.55 * e);
			setEyes(eyeRestColor.clone().lerp(eyeAmberColor, e), 0.6 + 0.3 * e);
			setEyeShape(blink(p, 0.3) * blink(p, 0.4));
		},

		caught(p, s) {
			// A startled jump, then frozen with the arms straight up.
			hop = p < 0.2 ? 0.1 * Math.sin((p / 0.2) * Math.PI) : 0;
			const up = easeInOut(p / 0.15);
			setArms(-2.3 * up, 0.12 * up);
			head.rotation.x = -0.06 * up;

			// Trembling, and the eyes strobing red like the alarm.
			shakeX = 0.008 * Math.sin(s * Math.PI * 2 * 18) * up;
			const strobe = Math.sin(s * Math.PI * 2 * 3) > 0 ? 1 : 0;
			setEyes(eyeAlarmColor, 0.4 + 1.4 * strobe * up);
			setEyeShape(1 + 0.3 * up, 1 + 0.15 * up);
			applyTransform();
		},

		power_down(p, s) {
			// Flicker, then out. The flicker is two beating sines, so it
			// stutters rather than pulsing evenly.
			const fade = 1 - easeInOut((p - 0.15) / 0.45);
			const flicker = p < 0.6
				? 0.5 + 0.5 * Math.sign(Math.sin(s * 37) + Math.sin(s * 23) + 0.6)
				: 1;
			setEyes(eyeRestColor, 0.6 * fade * flicker);
			matEye.color.copy(eyeRestColor).lerp(eyeDeadColor, 1 - fade * flicker);
			setEyeShape(1 - 0.5 * (1 - fade));

			// Wind down: head sways once, then droops; arms sag; the body
			// settles onto its tracks.
			const sway = window01(p, 0.1, 0.55, 0.4);
			head.rotation.z = 0.08 * Math.sin((p - 0.1) * Math.PI * 2 * 1.2) * sway;
			const slump = easeInOut((p - 0.45) / 0.45);
			head.rotation.x = 0.22 * slump;
			setArms(0.08 * slump, -0.06 * slump);
			tilt(0.04 * slump, 0.43, 0.02 * slump);
		},

		overheat(p, s) {
			// Shaking harder and harder, head spinning on its mount, until it
			// gives out with a last puff.
			const build = p < 0.8 ? (p / 0.8) ** 2 : 1 - easeInOut((p - 0.8) / 0.2);
			const phase = s * Math.PI * 2 * 20;
			shakeX = 0.03 * Math.sin(phase) * build;
			shakeZ = 0.02 * Math.cos(phase * 0.7) * build;
			head.rotation.y = 0.5 * Math.sin(s * Math.PI * 2 * 3) * build;
			head.rotation.z = 0.06 * Math.sin(phase * 0.5) * build;
			setEyes(eyeRestColor.clone().lerp(eyeHotColor, Math.min(1, p * 1.5)), 0.6 + 1.2 * build);
			setEyeShape(1 - 0.4 * Math.max(0, (p - 0.8) / 0.2));
			applyTransform();

			// Steam: puffs rising in turn, each growing as it fades.
			const steam = window01(p, 0.15, 1, 0.15);
			matSteam.opacity = 0.75 * steam;
			puffs.forEach((puff, i) => {
				const rise = (s * 1.3 + i / puffs.length) % 1;
				puff.visible = steam > 0;
				puff.position.set(
					(i % 2 ? 0.12 : -0.12) + 0.08 * rise * (i % 2 ? 1 : -1),
					0.95 + rise * 0.55,
					-0.02,
				);
				puff.scale.setScalar(0.6 + rise * 1.2);
			});
		},

		shrug(p) {
			const e = window01(p, 0, 1, 0.35);
			setArms(-0.9 * e, 0.45 * e);
			head.rotation.z = -0.1 * e;
			hop = -0.02 * e;
			setEyeShape(blink(p, 0.55, 0.06));
			applyTransform();
		},
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

		react(reaction: Reaction) {
			clearGesture();
			gesture = { kind: reaction, elapsed: 0 };
			return REACTION_DURATIONS[reaction];
		},

		wave() {
			clearGesture();
			gesture = { kind: 'wave', elapsed: 0 };
			return WAVE_DURATION;
		},

		celebrate() {
			clearGesture();
			gesture = { kind: 'celebrate', elapsed: 0 };
			return CELEBRATE_DURATION;
		},

		resetPose() {
			clearGesture();
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

			if (!gesture) return;
			gesture.elapsed += deltaSeconds;
			const { kind, elapsed } = gesture;

			if (kind === 'wave' || kind === 'celebrate') {
				const p = elapsed / (kind === 'wave' ? WAVE_DURATION : CELEBRATE_DURATION);
				if (p >= 1) clearGesture();
				else if (kind === 'wave') poseWave(p);
				else poseCelebrate(p);
				return;
			}

			const p = elapsed / REACTION_DURATIONS[kind];
			if (p >= 1 && !STICKY.has(kind)) {
				clearGesture();
				return;
			}
			// A sticky reaction keeps posing at p = 1, so its alarm strobe
			// and tremble carry on until the student resets.
			REACTION_POSES[kind](Math.min(p, 1), elapsed, deltaSeconds);
		},

		dispose() { disposeObject(group); },
	};
}
