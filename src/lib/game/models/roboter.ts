import * as THREE from 'three';
import { disposeObject } from '$lib/game/three-utils';

/**
 * Rounded-rectangle prism built from ExtrudeGeometry + bevel.
 * w/h/d are the OUTER dimensions; r is the corner/edge radius.
 * Centred at origin. Low-poly: 3 curve segments, 2 bevel steps.
 */
function roundedBoxGeo(w: number, h: number, d: number, r: number): THREE.BufferGeometry {
	const shape = new THREE.Shape();
	const hw = w / 2, hh = h / 2;
	shape.moveTo(-hw + r, -hh);
	shape.lineTo( hw - r, -hh);
	shape.quadraticCurveTo( hw, -hh,  hw, -hh + r);
	shape.lineTo( hw,  hh - r);
	shape.quadraticCurveTo( hw,  hh,  hw - r,  hh);
	shape.lineTo(-hw + r,  hh);
	shape.quadraticCurveTo(-hw,  hh, -hw,  hh - r);
	shape.lineTo(-hw, -hh + r);
	shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);

	const geo = new THREE.ExtrudeGeometry(shape, {
		depth: d,
		bevelEnabled: true,
		bevelSize: r,
		bevelThickness: r,
		bevelSegments: 2,
		curveSegments: 3,
	});
	geo.translate(0, 0, -d / 2);
	return geo;
}

const ARM_REST   = -0.28;  // pivot rotation.x at idle (slight forward tilt)
const ARM_RAISED = -1.42;  // pivot rotation.x when carrying (arms extend toward +Z front)
const ARM_SMOOTH = 8;      // exponential smoothing rate (higher = snappier)

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
 * cosmetic motion (arm swing, crash shake) lives in here, and none of it
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
	/** Roll the wheels as if the robot had travelled `distance` world units. */
	rollWheels(distance: number): void;

	/** Animate arms up to carry position */
	pickUp(): void;
	/** Animate arms back down to rest */
	lower(): void;
	/**
	 * Anchor for a carried crate — swings with the arms.
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
 * Creates the Dewy robot character — Wall·E inspired design.
 * Binocular cylindrical eye housings, accordion neck, rounded boxy body.
 *
 * Origin convention: base-center — y=0 is the floor plane.
 * Footprint fits within a 1×1 world tile.
 *
 * Named sub-groups via group.getObjectByName():
 *   "chassis" | "neck" | "head" | "eyes" | "wheels" | "armL" | "armR"
 *
 * @param options
 * @param options.scale       Uniform scale factor (default 1)
 * @param options.bodyColor   Primary chassis colour hex (default 0xd4a028 — Wall·E ochre)
 * @param options.accentColor Trim / joint colour hex   (default 0x2a2a32 — dark gunmetal)
 * @param options.wheelColor  Wheel colour hex          (default 0x1a1a22 — near-black)
 * @param options.eyeColor    Emissive lens colour      (default 0xffe070 — warm amber)
 * @param options.armsRaised  Start with arms in carry position (default false)
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
		bodyColor   = 0xd4a028,
		accentColor = 0x2a2a32,
		wheelColor  = 0x1a1a22,
		eyeColor    = 0xffe070,
		armsRaised  = false,
	} = options;

	const group = new THREE.Group();
	// Arm animation state — shared across both pivots
	let targetAngle = armsRaised ? ARM_RAISED : ARM_REST;
	const armPivots: THREE.Group[] = [];

	// ─── Materials ───────────────────────────────────────────────────────────────
	const matBody      = new THREE.MeshStandardMaterial({ color: bodyColor,   roughness: 0.60, metalness: 0.45, flatShading: true });
	const matAccent    = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.70, metalness: 0.55, flatShading: true });
	const matWheel     = new THREE.MeshStandardMaterial({ color: wheelColor,  roughness: 0.90, metalness: 0.10, flatShading: true });
	const matEye       = new THREE.MeshStandardMaterial({ color: eyeColor, emissive: new THREE.Color(eyeColor), emissiveIntensity: 0.95, roughness: 0.10, metalness: 0.00, flatShading: true });
	const matDark      = new THREE.MeshStandardMaterial({ color: 0x111116,    roughness: 0.85, metalness: 0.30, flatShading: true });
	const matShine     = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.60, roughness: 0.20, flatShading: true });
	const matBlush     = new THREE.MeshStandardMaterial({ color: 0xf499a8,    roughness: 0.70, metalness: 0.00, flatShading: true });
	const matIndicator = new THREE.MeshStandardMaterial({ color: 0xff7030, emissive: new THREE.Color(0xff6020), emissiveIntensity: 0.85, roughness: 0.20, flatShading: true });

	// ─── Chassis ─────────────────────────────────────────────────────────────────
	// Compact, boxy Wall·E body — y: 0.195 → 0.420
	const chassis = new THREE.Group();
	chassis.name = 'chassis';

	// Rounded body — r=0.032 gives a soft chamfered cube feel
	const geoBody = roundedBoxGeo(0.38, 0.225, 0.34, 0.032);
	const meshBody = new THREE.Mesh(geoBody, matBody);
	meshBody.position.y = 0.308;
	chassis.add(meshBody);

	// Orange chest indicator — Wall·E battery/power bar
	const geoIndicatorFrame = new THREE.BoxGeometry(0.110, 0.048, 0.007);
	const meshIndicatorFrame = new THREE.Mesh(geoIndicatorFrame, matDark);
	meshIndicatorFrame.position.set(0, 0.377, 0.174);
	chassis.add(meshIndicatorFrame);

	const geoIndicator = new THREE.BoxGeometry(0.094, 0.034, 0.007);
	const meshIndicator = new THREE.Mesh(geoIndicator, matIndicator);
	meshIndicator.position.set(0, 0.377, 0.177);
	chassis.add(meshIndicator);

	// Corner bolts — industrial detail
	const geoBolt = new THREE.BoxGeometry(0.015, 0.015, 0.011);
	const boltPos: [number, number, number][] = [
		[ 0.198, 0.408,  0.133], [ 0.198, 0.408, -0.133],
		[ 0.198, 0.210,  0.133], [ 0.198, 0.210, -0.133],
		[-0.198, 0.408,  0.133], [-0.198, 0.408, -0.133],
		[-0.198, 0.210,  0.133], [-0.198, 0.210, -0.133],
	];
	for (const [bx, by, bz] of boltPos) {
		const bolt = new THREE.Mesh(geoBolt, matAccent);
		bolt.position.set(bx, by, bz);
		chassis.add(bolt);
	}

	group.add(chassis);

	// ─── Neck (accordion / segmented — Wall·E folding neck) ─────────────────────
	const neck = new THREE.Group();
	neck.name = 'neck';

	// Three stacked rings tapering inward, with dark gaps between
	const neckRings: [number, number, number, number][] = [
		[0.175, 0.019, 0.155, 0.432],
		[0.154, 0.017, 0.134, 0.452],
		[0.136, 0.015, 0.116, 0.470],
	];
	for (const [w, h, d, y] of neckRings) {
		const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), matAccent);
		mesh.position.y = y;
		neck.add(mesh);
	}
	for (const gy of [0.441, 0.460]) {
		const gap = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.007, 0.11), matDark);
		gap.position.y = gy;
		neck.add(gap);
	}

	group.add(neck);

	// ─── Head ─────────────────────────────────────────────────────────────────────
	// Compact boxy head — the binocular eyes dominate the face
	// y: 0.478 → 0.678, center y = 0.578, front face z = +0.135
	const head = new THREE.Group();
	head.name = 'head';

	// Rounded head — slightly tighter radius so it reads as a distinct shape from the body
	const geoHead = roundedBoxGeo(0.32, 0.20, 0.27, 0.028);
	const meshHead = new THREE.Mesh(geoHead, matBody);
	meshHead.position.y = 0.578;
	head.add(meshHead);

	// Top panel crease
	const meshTopLine = new THREE.Mesh(new THREE.BoxGeometry(0.325, 0.008, 0.275), matAccent);
	meshTopLine.position.set(0, 0.594, 0);
	head.add(meshTopLine);

	// Blush marks on cheeks (below the eye housings)
	const geoBlush = new THREE.BoxGeometry(0.046, 0.016, 0.005);
	for (const side of [-1, 1] as const) {
		const blush = new THREE.Mesh(geoBlush, matBlush);
		blush.position.set(side * 0.108, 0.534, 0.137);
		head.add(blush);
	}

	// Speaker grille at bottom of head face (replaces drawn mouth)
	const meshGrille = new THREE.Mesh(new THREE.BoxGeometry(0.094, 0.019, 0.006), matDark);
	meshGrille.position.set(0, 0.490, 0.138);
	head.add(meshGrille);
	const geoSlot = new THREE.BoxGeometry(0.018, 0.011, 0.004);
	for (const sx of [-0.030, 0, 0.030]) {
		const slot = new THREE.Mesh(geoSlot, matAccent);
		slot.position.set(sx, 0.490, 0.142);
		head.add(slot);
	}

	// Compact antenna with glowing orange tip (Dewy identity marker)
	const meshAntPole = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.080, 6), matAccent);
	meshAntPole.position.set(0.058, 0.718, 0);
	head.add(meshAntPole);
	const meshAntBall = new THREE.Mesh(new THREE.SphereGeometry(0.026, 6, 4), matIndicator);
	meshAntBall.position.set(0.058, 0.758, 0);
	head.add(meshAntBall);

	// ── Binocular eye housings (Wall·E) ─────────────────────────────────────────
	// Origin of the eyes group sits at the head's front-face centre.
	// rotation.x = 0.14 gives a slight downward tilt — Wall·E's curious look.
	// All child positions are local to this rotated frame.
	const eyes = new THREE.Group();
	eyes.name = 'eyes';
	eyes.position.set(0, 0.578, 0.135);
	eyes.rotation.x = 0.14;

	// Shared eye geometries
	const geoHousing = new THREE.CylinderGeometry(0.054, 0.054, 0.082, 8);
	const geoBezel   = new THREE.CylinderGeometry(0.061, 0.061, 0.010, 8);
	const geoRecess  = new THREE.CylinderGeometry(0.046, 0.046, 0.022, 8);
	const geoLens    = new THREE.SphereGeometry(0.040, 6, 4);
	const geoShineGeo = new THREE.BoxGeometry(0.014, 0.014, 0.004);

	// Bridge connecting both housings
	const meshBridge = new THREE.Mesh(new THREE.BoxGeometry(0.132, 0.060, 0.082), matAccent);
	meshBridge.position.set(0, 0, 0.041);
	eyes.add(meshBridge);

	for (const ex of [-0.078, 0.078]) {
		// Octagonal outer housing — oriented along local Z via rotation.x = π/2
		// Spans local z: 0 (flush with head face) → 0.082 (protrudes forward)
		const housing = new THREE.Mesh(geoHousing, matAccent);
		housing.rotation.x = Math.PI / 2;
		housing.position.set(ex, 0, 0.041);
		eyes.add(housing);

		// Front bezel ring — slightly wider, dark
		const bezel = new THREE.Mesh(geoBezel, matDark);
		bezel.rotation.x = Math.PI / 2;
		bezel.position.set(ex, 0, 0.087);
		eyes.add(bezel);

		// Dark inner recess — creates depth/pupil illusion
		const recess = new THREE.Mesh(geoRecess, matDark);
		recess.rotation.x = Math.PI / 2;
		recess.position.set(ex, 0, 0.076);
		eyes.add(recess);

		// Glowing amber lens — the warm Wall·E eye
		const lens = new THREE.Mesh(geoLens, matEye);
		lens.position.set(ex, 0, 0.090);
		eyes.add(lens);

		// White shine dot — upper-right of lens for liveliness
		const shine = new THREE.Mesh(geoShineGeo, matShine);
		shine.position.set(ex + 0.018, 0.016, 0.098);
		eyes.add(shine);
	}

	head.add(eyes);
	group.add(head);

	// ─── Wheels ──────────────────────────────────────────────────────────────────
	const wheelsGroup = new THREE.Group();
	wheelsGroup.name = 'wheels';

	const wRadius = 0.090;
	const wThick  = 0.080;

	const geoWheelRim   = new THREE.CylinderGeometry(wRadius, wRadius, wThick, 8);
	const geoWheelTread = new THREE.CylinderGeometry(wRadius + 0.010, wRadius + 0.010, wThick * 0.44, 8);
	const geoWheelHub   = new THREE.CylinderGeometry(wRadius * 0.38, wRadius * 0.38, wThick + 0.006, 6);

	const wCorners: [number, number][] = [
		[ 0.196,  0.132],
		[-0.196,  0.132],
		[ 0.196, -0.132],
		[-0.196, -0.132],
	];

	for (const [wx, wz] of wCorners) {
		const wg = new THREE.Group();
		const rim   = new THREE.Mesh(geoWheelRim,   matWheel);
		const tread = new THREE.Mesh(geoWheelTread, matAccent);
		const hub   = new THREE.Mesh(geoWheelHub,   matBody);
		rim.rotation.z   = Math.PI / 2;
		tread.rotation.z = Math.PI / 2;
		hub.rotation.z   = Math.PI / 2;
		wg.add(rim, tread, hub);
		wg.position.set(wx, wRadius, wz);
		wheelsGroup.add(wg);
	}

	group.add(wheelsGroup);

	// ─── Arms ────────────────────────────────────────────────────────────────────
	// Shoulder pivot at (±0.225, 0.382, 0.010).
	// Prominent round elbow + wrist cylinder joints (Wall·E mechanical aesthetic).
	// Scoop-style two-prong claw at the end.
	// At rest (rotation.x = 0.28) claw tips sit ≈ y 0.055 above floor — no clipping.

	const buildArm = (side: 1 | -1, name: string): THREE.Group => {
		const arm = new THREE.Group();
		arm.name = name;

		const meshShoulderCap = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.064, 0.064), matAccent);
		arm.add(meshShoulderCap);

		const pivot = new THREE.Group();
		pivot.rotation.x = armsRaised ? ARM_RAISED : ARM_REST;
		armPivots.push(pivot);

		// Upper arm
		const meshUpperArm = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.130, 0.058), matBody);
		meshUpperArm.position.y = -0.074;
		pivot.add(meshUpperArm);

		// Elbow — short cylinder oriented along X (visible axle joint)
		const geoElbow = new THREE.CylinderGeometry(0.036, 0.036, 0.075, 8);
		const meshElbow = new THREE.Mesh(geoElbow, matAccent);
		meshElbow.rotation.z = Math.PI / 2;
		meshElbow.position.y = -0.148;
		pivot.add(meshElbow);

		// Forearm
		const meshForearm = new THREE.Mesh(new THREE.BoxGeometry(0.050, 0.110, 0.050), matBody);
		meshForearm.position.y = -0.220;
		pivot.add(meshForearm);

		// Wrist — round disc joint
		const geoWrist = new THREE.CylinderGeometry(0.030, 0.030, 0.060, 8);
		const meshWrist = new THREE.Mesh(geoWrist, matAccent);
		meshWrist.rotation.z = Math.PI / 2;
		meshWrist.position.y = -0.285;
		pivot.add(meshWrist);

		// Scoop claw — vertical stem + forward-pointing tip (Wall·E scooper)
		const geoClawStem = new THREE.BoxGeometry(0.016, 0.044, 0.016);
		const geoClawTip  = new THREE.BoxGeometry(0.016, 0.014, 0.038);
		for (const px of [-0.020, 0.020]) {
			const stem = new THREE.Mesh(geoClawStem, matAccent);
			stem.position.set(px, -0.318, 0);
			pivot.add(stem);

			const tip = new THREE.Mesh(geoClawTip, matAccent);
			tip.position.set(px, -0.342, 0.019);
			pivot.add(tip);
		}

		arm.add(pivot);
		arm.position.set(side * 0.225, 0.382, 0.010);
		return arm;
	};

	group.add(buildArm( 1, 'armR'));
	group.add(buildArm(-1, 'armL'));

	// ─── Carry slot ──────────────────────────────────────────────────────────────
	// An invisible third pivot on the same `armPivots` list, so a held crate
	// inherits the arm smoothing for free — no per-frame work in World.
	const carryPivot = new THREE.Group();
	carryPivot.name = 'carryPivot';
	carryPivot.rotation.x = armsRaised ? ARM_RAISED : ARM_REST;
	carryPivot.position.set(0, 0.382, 0.010);   // shoulder height, centred
	armPivots.push(carryPivot);

	const carrySlot = new THREE.Group();
	carrySlot.name = 'carry';
	carrySlot.position.set(0, -0.34, 0.02);     // between the claw tips
	carryPivot.add(carrySlot);
	group.add(carryPivot);

	group.scale.setScalar(scale);

	// ─── Pose state ──────────────────────────────────────────────────────────────
	// Base transform, kept separate from transient shake so the two never fight.
	let baseX = 0;
	let baseZ = 0;
	let yaw   = 0;
	let panicRemaining = 0;

	const headGroup = group.getObjectByName('head')!;
	const wheels    = group.getObjectByName('wheels')!;
	const eyeRestColor = new THREE.Color(eyeColor);
	const eyePanicColor = new THREE.Color(0xff2a2a);

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
			// `distance` is in world units but the wheel radius is model-local,
			// so undo the group scale before converting to radians.
			const radians = distance / (wRadius * scale);
			for (const wheel of wheels.children) wheel.rotation.x += radians;
		},

		pickUp() { targetAngle = ARM_RAISED; },
		lower()  { targetAngle = ARM_REST; },

		panic() {
			panicRemaining = PANIC_DURATION;
			return PANIC_DURATION;
		},

		resetPose() {
			panicRemaining = 0;
			headGroup.rotation.z = 0;
			matEye.emissive.copy(eyeRestColor);
			matEye.emissiveIntensity = 0.95;
			targetAngle = ARM_REST;
			for (const pivot of armPivots) pivot.rotation.x = ARM_REST;
			applyTransform();
		},

		update(deltaSeconds: number) {
			// Exponential smoothing — framerate-independent ease-out.
			// Asymptotic on purpose: this is ambient motion and is never awaited.
			const t = 1 - Math.exp(-ARM_SMOOTH * deltaSeconds);
			for (const pivot of armPivots) {
				pivot.rotation.x += (targetAngle - pivot.rotation.x) * t;
			}

			if (panicRemaining <= 0) return;

			panicRemaining = Math.max(0, panicRemaining - deltaSeconds);
			const progress = panicRemaining / PANIC_DURATION;   // 1 → 0
			const phase = (1 - progress) * PANIC_DURATION * PANIC_HZ * Math.PI * 2;
			const amplitude = PANIC_SHAKE * progress;

			group.position.x = baseX + Math.sin(phase) * amplitude;
			group.position.z = baseZ + Math.cos(phase * 0.7) * amplitude * 0.6;
			headGroup.rotation.z = Math.sin(phase * 0.5) * 0.25 * progress;
			matEye.emissive.copy(eyeRestColor).lerp(eyePanicColor, progress);
			matEye.emissiveIntensity = 0.95 + Math.abs(Math.sin(phase * 0.5)) * progress;

			if (panicRemaining === 0) {
				headGroup.rotation.z = 0;
				matEye.emissive.copy(eyeRestColor);
				matEye.emissiveIntensity = 0.95;
				applyTransform();
			}
		},

		dispose() { disposeObject(group); },
	};
}
