<script lang="ts">
	import { onMount } from 'svelte';
	import { World } from '$lib/game/world';
	import { createWorldState } from '$lib/game/worldState.svelte';
	import { createLevelState } from '$lib/game/level-state';
	import { applyBrush, moveSelection } from '$lib/game/editor/operations';
	import type { Brush } from '$lib/game/editor/brush';
	import { selectAt, type Selection } from '$lib/game/editor/selection';
	import type { LevelDraft } from '$lib/game/editor/draft.svelte';
	import { sameCoord } from '$lib/game/grid';
	import type { Coord } from '$lib/game/level';

	interface Props {
		draft: LevelDraft;
		brush: Brush;
		/** What the select tool has picked, drawn as an outline over the tiles. */
		selection: Selection | null;
		/** A click with the select tool active. `null` clears the selection. */
		onselect: (coord: Coord | null) => void;
		/**
		 * A paint or erase stroke has finished. The palette re-arms the ids it
		 * authors here rather than per tile, so a dragged belt run stays one belt.
		 */
		onstroke: () => void;
		/** A quarter turn, asked for with the middle mouse button. */
		onrotate: () => void;
		/**
		 * A drag of the select tool has carried the grabbed tile to `coord`.
		 * The page re-seeds its selection there, so the outline travels with it.
		 */
		onmove: (coord: Coord) => void;
		/** False for a level borrowed through a share: selecting still works, dragging does not. */
		editable: boolean;
	}

	let { draft, brush, selection, onselect, onstroke, onrotate, onmove, editable }: Props = $props();

	let canvas: HTMLCanvasElement;

	// `$state.raw`: a rune proxy around a Three.js renderer would be a
	// disaster, and the reference only ever changes once anyway.
	let world = $state.raw<World | undefined>(undefined);

	const view = createWorldState({ zoom: 7 });

	/**
	 * The tile under the pointer. Drives both the hover outline and the ghost
	 * preview, and is kept as state rather than pushed straight at the world so
	 * both survive the scene being rebuilt after every edit.
	 */
	let hovered = $state.raw<Coord | null>(null);

	/** Non-null while the pointer is down, so a drag paints a stroke. */
	let stroke: 'paint' | 'erase' | null = null;
	/** The last tile the stroke touched — one edit per tile crossed, not per move. */
	let lastPainted: Coord | null = null;

	const ERASER: Brush = { kind: 'erase' };

	/**
	 * A select-tool press on something that can move. Armed on pointerdown but
	 * inert until the pointer reaches another ground tile, so a plain click
	 * still only selects. `offset` is the last one the thing actually fitted at.
	 */
	let drag: {
		pointerId: number;
		/** The tile the click picked — shifted by `offset`, the page's new seed. */
		grabbed: Coord;
		/** The ground tile under the press, which the offset is measured from. */
		start: Coord;
		selection: Selection;
		offset: { dx: number; dy: number };
	} | null = null;
	/** Mirrors "a drag has started moving", for the cursor. */
	let dragging = $state(false);

	let grabbable = $derived(
		editable && brush.kind === 'select' && hovered !== null && selectAt(draft.level, hovered) !== null,
	);

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

	// The editor overlay outlives `loadLevel`, so the selection is pushed
	// separately — and stays put across a rebuild of the scene.
	$effect(() => {
		world?.setSelection(selection?.coords ?? [], selection?.linked ?? []);
	});

	// The ghost does not: it is measured against the level, so `loadLevel`
	// drops it. Reading `draft.level` here puts it straight back, which is what
	// keeps a click from leaving a hole until the pointer next moves. Declared
	// after the effect above so it runs after the rebuild, not before it.
	$effect(() => {
		draft.level;
		world?.setHighlight(hovered);
		world?.setGhost(brush, hovered);
	});

	/** Only a real change, so a pointer wandering inside one tile is free. */
	function hover(coord: Coord | null) {
		const same = coord === null
			? hovered === null
			: hovered !== null && sameCoord(coord, hovered);
		if (!same) hovered = coord;
	}

	function paint(event: PointerEvent, mode: 'paint' | 'erase') {
		const coord = world?.pickTile(event.clientX, event.clientY) ?? null;
		if (!coord || (lastPainted && sameCoord(lastPainted, coord))) return;

		lastPainted = coord;
		draft.edit((level) => applyBrush(level, mode === 'erase' ? ERASER : brush, coord));
	}

	function onpointerdown(event: PointerEvent) {
		// Middle button turns whatever is in hand. Preventing the default stops
		// Chrome opening its autoscroll cursor over the canvas.
		if (event.button === 1) {
			event.preventDefault();
			onrotate();
			return;
		}

		if (event.button !== 0 && event.button !== 2) return;

		// Selecting is a click, and the start of a drag if it landed on
		// something — which only moves once the pointer leaves the tile.
		if (brush.kind === 'select' && event.button === 0) {
			const coord = world?.pickTile(event.clientX, event.clientY) ?? null;
			onselect(coord);
			if (!editable || !coord) return;

			const picked = selectAt(draft.level, coord);
			const start = world?.pickGround(event.clientX, event.clientY) ?? null;
			if (!picked || !start) return;

			drag = { pointerId: event.pointerId, grabbed: coord, start, selection: picked, offset: { dx: 0, dy: 0 } };
			canvas.setPointerCapture(event.pointerId);
			return;
		}

		stroke = event.button === 2 ? 'erase' : 'paint';
		lastPainted = null;
		canvas.setPointerCapture(event.pointerId);
		paint(event, stroke);
	}

	function onpointermove(event: PointerEvent) {
		hover(world?.pickTile(event.clientX, event.clientY) ?? null);
		if (stroke) paint(event, stroke);
		if (drag && drag.pointerId === event.pointerId) moveDrag(event, drag);
	}

	/**
	 * Every frame is computed from the level the drag began on, so the offset
	 * is exact and nothing crossed on the way is disturbed. Where the thing
	 * does not fit, it simply stays at the last spot it did.
	 */
	function moveDrag(event: PointerEvent, active: NonNullable<typeof drag>) {
		const at = world?.pickGround(event.clientX, event.clientY) ?? null;
		if (!at) return;

		const dx = at.x - active.start.x;
		const dy = at.y - active.start.y;
		if (dx === active.offset.dx && dy === active.offset.dy) return;

		const origin = draft.begin();
		dragging = true;

		const next = moveSelection(origin, active.selection, dx, dy);
		if (!next) return;

		active.offset = { dx, dy };
		draft.preview(next);
		onmove({ x: active.grabbed.x + dx, y: active.grabbed.y + dy });
	}

	/**
	 * Put a drag down. `keep` makes it one history entry; otherwise the level
	 * and the selection go back to where the drag found them.
	 */
	function endDrag(keep: boolean) {
		if (!drag) return;
		const { grabbed, pointerId } = drag;
		drag = null;
		dragging = false;

		if (keep) {
			draft.commit();
		} else if (draft.busy) {
			draft.cancel();
			onmove(grabbed);
		}
		if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
	}

	/** Escape mid-drag: the page calls this rather than deselecting. */
	export function cancelDrag() {
		endDrag(false);
	}

	function endStroke(event: PointerEvent) {
		if (drag) {
			endDrag(event.type === 'pointerup');
			return;
		}
		// A pointerup with no stroke behind it is a select click, which paints
		// nothing and so has nothing to re-arm.
		const painted = stroke !== null;
		stroke = null;
		lastPainted = null;
		if (canvas.hasPointerCapture(event.pointerId)) {
			canvas.releasePointerCapture(event.pointerId);
		}
		if (painted) onstroke();
	}
</script>

<!-- Right-click is the eraser, so the browser menu has to stay out of the way. -->
<canvas
	bind:this={canvas}
	class:picking={brush.kind === 'select'}
	class:grab={grabbable}
	class:grabbing={dragging}
	{onpointerdown}
	{onpointermove}
	onpointerup={endStroke}
	onpointercancel={endStroke}
	onpointerleave={() => hover(null)}
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

	canvas.picking {
		cursor: pointer;
	}

	canvas.grab {
		cursor: grab;
	}

	canvas.grabbing {
		cursor: grabbing;
	}
</style>
