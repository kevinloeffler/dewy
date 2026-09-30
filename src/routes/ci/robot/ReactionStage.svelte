<script lang="ts">
	import { onMount } from 'svelte';
	import * as THREE from 'three';
	import { createRoboter, REACTION_DURATIONS } from '$lib/game/models/roboter';
	import { createCrate } from '$lib/game/models/crate';
	import { SENSOR_ON } from '$lib/game/models/motion-sensor';
	import type { Reaction } from '$lib/game/reactions';

	/**
	 * One reaction on a small stage of its own: a 3×3 patch of floor, plus
	 * whatever the reaction is *about* — the wall it hit, the crate that
	 * would not move, the hole, the watched zone — so the reviewer judges the
	 * animation in the situation the student will see it in.
	 */

	/** Seconds at rest between one loop ending and the next starting. */
	const PAUSE = 1.2;

	interface Props {
		reaction: Reaction;
		/** Playback rate, like World's speed slider. */
		speed: number;
		loop: boolean;
		/** Start with a crate in the claws — arm gestures are skipped then. */
		carrying: boolean;
		/** Bump to replay from the start. */
		replay: number;
	}

	let { reaction, speed, loop, carrying, replay }: Props = $props();

	let canvas: HTMLCanvasElement;
	let restart: (() => void) | undefined;

	$effect(() => {
		// Read to subscribe: any of these changing starts the reaction over.
		void replay;
		void carrying;
		restart?.();
	});

	onMount(() => {
		const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
		renderer.setClearColor(0xf5f1e8);

		// Lit like `World`, so colours match the game.
		const scene = new THREE.Scene();
		scene.add(new THREE.AmbientLight(0xffffff, 3));
		const key = new THREE.DirectionalLight(0xffffff, 1);
		key.position.set(1, 1, 1).normalize();
		scene.add(key);
		const top = new THREE.DirectionalLight(0xffffff, 1);
		top.position.set(0, 1, 0);
		scene.add(top);

		const owned: THREE.Object3D[] = [];
		const add = (object: THREE.Object3D) => {
			scene.add(object);
			owned.push(object);
			return object;
		};

		// ─── Floor ────────────────────────────────────────────────
		const floorMaterial = new THREE.MeshStandardMaterial({ color: 0xe4ddcf, roughness: 0.9 });
		const floorGeometry = new THREE.BoxGeometry(0.96, 0.08, 0.96);
		for (let x = -1; x <= 1; x++) {
			for (let z = -1; z <= 1; z++) {
				// The robot stands over the hole it is about to fall into.
				if (reaction === 'fall' && x === 0 && z === 0) continue;
				const tile = new THREE.Mesh(floorGeometry, floorMaterial);
				tile.position.set(x, -0.04, z);
				add(tile);
			}
		}

		// ─── Props ────────────────────────────────────────────────
		if (reaction === 'fall') {
			// The pit's void, where `TileFactory` puts it.
			const void_ = new THREE.Mesh(
				new THREE.BoxGeometry(1, 0.05, 1),
				new THREE.MeshStandardMaterial({ color: 0x1b1f24 }),
			);
			void_.position.y = -0.6;
			add(void_);
			// Walls of the shaft, so the drop reads as into a hole.
			const shaftMaterial = new THREE.MeshStandardMaterial({ color: 0x3a3f46, side: THREE.BackSide });
			const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.6, 0.96), shaftMaterial);
			shaft.position.y = -0.3;
			add(shaft);
		}
		if (reaction === 'collide') {
			const wall = new THREE.Mesh(
				new THREE.BoxGeometry(1, 1.2, 0.2),
				new THREE.MeshStandardMaterial({ color: 0xcfc6b4, roughness: 0.8 }),
			);
			wall.position.set(0, 0.6, 0.6);
			add(wall);
		}
		if (reaction === 'strain') {
			const crate = createCrate({ color: 'red' });
			crate.position.set(0, 0, 1);
			add(crate);
			const wall = new THREE.Mesh(
				new THREE.BoxGeometry(1, 1.2, 0.2),
				new THREE.MeshStandardMaterial({ color: 0xcfc6b4, roughness: 0.8 }),
			);
			wall.position.set(0, 0.6, 1.6);
			add(wall);
		}
		let zoneMaterial: THREE.MeshBasicMaterial | null = null;
		const alarmColor = new THREE.Color(0xffe0d8);
		if (reaction === 'caught') {
			zoneMaterial = new THREE.MeshBasicMaterial({
				color: SENSOR_ON.clone(), transparent: true, opacity: 0.35, depthWrite: false,
			});
			const zone = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 2.9), zoneMaterial);
			zone.rotation.x = -Math.PI / 2;
			zone.position.y = 0.005;
			add(zone);
		}

		// ─── Robot ────────────────────────────────────────────────
		const robot = createRoboter({ scale: 0.95, accentColor: 0xff9600 });
		scene.add(robot.group);
		// Facing +z, where the wall and the crate stand; the camera sits off
		// to the front-right, so the face still reads.
		robot.setYaw(0);

		const carried = add(createCrate({ color: 'blue' }));
		carried.visible = false;

		const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 40);
		camera.position.set(2.9, 2.6, 3.4);
		camera.lookAt(0, 0.3, 0.25);

		function resize() {
			renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
			renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
			camera.aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
			camera.updateProjectionMatrix();
		}
		resize();
		const observer = new ResizeObserver(resize);
		observer.observe(canvas);

		// `null` while the reaction plays; seconds until the next loop after.
		let until: number | null = null;
		let elapsed = 0;

		function start() {
			robot.resetPose();
			robot.setPosition(0, 0);
			if (carrying) {
				robot.carrySlot.attach(carried);
				carried.position.set(0, 0, 0);
				carried.visible = true;
				robot.pickUp(true);
			} else {
				carried.visible = false;
			}
			robot.react(reaction);
			elapsed = 0;
			until = null;
		}
		restart = start;
		start();

		const clock = new THREE.Clock();
		let frame = 0;
		function tick() {
			const dt = clock.getDelta() * speed;
			elapsed += dt;

			if (until === null && elapsed >= REACTION_DURATIONS[reaction]) {
				until = PAUSE;
			} else if (until !== null && loop) {
				until -= dt;
				if (until <= 0) start();
			}

			// The sensor's alarm, as World plays it alongside `caught`.
			if (zoneMaterial) {
				const alarming = until === null && Math.sin((elapsed / REACTION_DURATIONS.caught) * Math.PI * 8) > 0;
				zoneMaterial.color.copy(SENSOR_ON).lerp(alarmColor, alarming ? 1 : 0);
			}

			robot.update(dt);
			renderer.render(scene, camera);
			frame = requestAnimationFrame(tick);
		}
		tick();

		return () => {
			restart = undefined;
			cancelAnimationFrame(frame);
			observer.disconnect();
			robot.dispose();
			for (const object of owned) {
				object.traverse((child) => {
					const mesh = child as THREE.Mesh;
					mesh.geometry?.dispose();
					const material = mesh.material;
					if (Array.isArray(material)) material.forEach((m) => m.dispose());
					else material?.dispose();
				});
			}
			renderer.dispose();
		};
	});
</script>

<canvas bind:this={canvas}></canvas>

<style>
	canvas {
		display: block;
		width: 100%;
		aspect-ratio: 4 / 3;
		border-radius: 10px;
	}
</style>
