<script lang="ts">
	import { onMount } from 'svelte';
	import * as THREE from 'three';
	import { createRoboter } from '$lib/game/models/roboter';

	/**
	 * Dewy on its own almost facing the reader on a transparent canvas, taking
	 * turns to wave and to do the celebration it does on reaching a goal — the
	 * same model and gestures the game draws, so the landing page never shows a
	 * robot the student will not meet. Lit like `World` so the colours match too.
	 *
	 * Holds still when the reader asks for reduced motion.
	 */

	/** Seconds of stillness between one gesture ending and the next starting. */
	const PAUSE = 2.8;

	interface Props {
		/** Accessible description of the picture. */
		label?: string;
	}

	let { label = 'Dewy, der Roboter' }: Props = $props();

	let canvas: HTMLCanvasElement;

	onMount(() => {
		const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
		renderer.setClearColor(0x000000, 0);

		const scene = new THREE.Scene();
		scene.add(new THREE.AmbientLight(0xffffff, 3));
		const key = new THREE.DirectionalLight(0xffffff, 1);
		key.position.set(1, 1, 1).normalize();
		scene.add(key);
		const top = new THREE.DirectionalLight(0xffffff, 1);
		top.position.set(0, 1, 0);
		scene.add(top);

		const robot = createRoboter();
		scene.add(robot.group);

		// Framed on the model's own bounds (see `createRoboter`): about a unit
		// across and 0.93 tall, with headroom for raised arms and the hop.
		const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
		camera.position.set(0, 1.55, 3.7);
		camera.lookAt(0, 0.5, 0);

		// A slight turn, so the face reads head-on but the body keeps some depth.
		// Positive, so the arm `wave()` uses is the one nearer the camera.
		robot.setYaw(Math.PI / 14);

		const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

		function resize() {
			renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
			renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
			camera.aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
			camera.updateProjectionMatrix();
		}
		resize();
		const observer = new ResizeObserver(resize);
		observer.observe(canvas);

		const gestures = [() => robot.wave(), () => robot.celebrate()];
		let next = 0;
		// First gesture soon after the page appears, not a full pause later.
		let until = 0.8;

		const clock = new THREE.Clock();
		let frame = 0;
		function tick() {
			const dt = clock.getDelta();
			until -= dt;
			if (until <= 0 && !reduced.matches) {
				until = gestures[next]() + PAUSE;
				next = (next + 1) % gestures.length;
			}
			robot.update(dt);
			renderer.render(scene, camera);
			frame = requestAnimationFrame(tick);
		}
		tick();

		return () => {
			cancelAnimationFrame(frame);
			observer.disconnect();
			robot.dispose();
			renderer.dispose();
		};
	});
</script>

<div class="robot" role="img" aria-label={label}>
	<canvas bind:this={canvas}></canvas>
</div>

<style>
	.robot,
	canvas {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
