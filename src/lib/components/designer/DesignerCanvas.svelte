<script lang="ts">
	import { onMount } from 'svelte';
	import { World } from '$lib/game/world';
	import { createWorldState } from '$lib/game/worldState.svelte';
	import { createLevelState } from '$lib/game/level-state';
	import { applyBrush } from '$lib/game/editor/operations';
	import type { Brush } from '$lib/game/editor/brush';
	import type { LevelDraft } from '$lib/game/editor/draft.svelte';
	import { sameCoord } from '$lib/game/grid';
	import type { Coord } from '$lib/game/level';

	interface Props {
		draft: LevelDraft;
		brush: Brush;
	}

	let { draft, brush }: Props = $props();

	let canvas: HTMLCanvasElement;

	// `$state.raw`: a rune proxy around a Three.js renderer would be a
	// disaster, and the reference only ever changes once anyway.
	let world = $state.raw<World | undefined>(undefined);

	const view = createWorldState({ zoom: 7 });

	/** Non-null while the pointer is down, so a drag paints a stroke. */
	let stroke: 'paint' | 'erase' | null = null;
	/** The last tile the stroke touched — one edit per tile crossed, not per move. */
	let lastPainted: Coord | null = null;

	const ERASER: Brush = { kind: 'erase' };

	onMount(() => {
		const instance = new World(canvas, view);
		world = instance;
		return () => instance.destroy();
	});

	// Rebuild the scene whenever the draft changes. `draft.level` is raw state,
	// so this hands Three.js the real object with no snapshot in between.
	$effect(() => {
		const level = draft.level;
		world?.loadLevel(level, createLevelState(level));
	});

	function paint(event: PointerEvent, mode: 'paint' | 'erase') {
		const coord = world?.pickTile(event.clientX, event.clientY) ?? null;
		if (!coord || (lastPainted && sameCoord(lastPainted, coord))) return;

		lastPainted = coord;
		draft.edit((level) => applyBrush(level, mode === 'erase' ? ERASER : brush, coord));
	}

	function onpointerdown(event: PointerEvent) {
		if (event.button !== 0 && event.button !== 2) return;

		stroke = event.button === 2 ? 'erase' : 'paint';
		lastPainted = null;
		canvas.setPointerCapture(event.pointerId);
		paint(event, stroke);
	}

	function onpointermove(event: PointerEvent) {
		world?.setHighlight(world.pickTile(event.clientX, event.clientY));
		if (stroke) paint(event, stroke);
	}

	function endStroke(event: PointerEvent) {
		stroke = null;
		lastPainted = null;
		if (canvas.hasPointerCapture(event.pointerId)) {
			canvas.releasePointerCapture(event.pointerId);
		}
	}
</script>

<!-- Right-click is the eraser, so the browser menu has to stay out of the way. -->
<canvas
	bind:this={canvas}
	{onpointerdown}
	{onpointermove}
	onpointerup={endStroke}
	onpointercancel={endStroke}
	onpointerleave={() => world?.setHighlight(null)}
	oncontextmenu={(event) => event.preventDefault()}
></canvas>

<style>
	canvas {
		display: block;
		width: 100%;
		height: 100%;
		border-radius: var(--radius);
		background: var(--panel);
		touch-action: none;
		cursor: crosshair;
	}
</style>
