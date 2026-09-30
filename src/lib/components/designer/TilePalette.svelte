<script lang="ts">
	import { CRATE_COLORS, type CrateColor } from '$lib/game/crate-color';
	import { COLORS } from '$lib/game/models/tiles';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ArrowBigRightDash from '@lucide/svelte/icons/arrow-big-right-dash';
	import Bot from '@lucide/svelte/icons/bot';
	import Cctv from '@lucide/svelte/icons/cctv';
	import BrickWall from '@lucide/svelte/icons/brick-wall';
	import ChevronsRight from '@lucide/svelte/icons/chevrons-right';
	import Cuboid from '@lucide/svelte/icons/cuboid';
	import Cylinder from '@lucide/svelte/icons/cylinder';
	import DoorClosed from '@lucide/svelte/icons/door-closed';
	import Eraser from '@lucide/svelte/icons/eraser';
	import Fence from '@lucide/svelte/icons/fence';
	import Flag from '@lucide/svelte/icons/flag';
	import Footprints from '@lucide/svelte/icons/footprints';
	import Inbox from '@lucide/svelte/icons/inbox';
	import KeyRound from '@lucide/svelte/icons/key-round';
	import Layers from '@lucide/svelte/icons/layers';
	import LibraryBig from '@lucide/svelte/icons/library-big';
	import MousePointer2 from '@lucide/svelte/icons/mouse-pointer-2';
	import Package from '@lucide/svelte/icons/package';
	import PanelBottomOpen from '@lucide/svelte/icons/panel-bottom-open';
	import SquareDashed from '@lucide/svelte/icons/square-dashed';
	import ToggleLeft from '@lucide/svelte/icons/toggle-left';
	import Toolbox from '@lucide/svelte/icons/toolbox';
	import TrafficCone from '@lucide/svelte/icons/traffic-cone';
	import { armIds } from '$lib/game/editor/operations';
	import {
		BRUSH_GROUPS,
		BRUSH_LABELS,
		TOOL_IDS,
		type BrushId,
		type BrushOptions
	} from '$lib/game/editor/brush';
	import type { Level } from '$lib/game/level';

	interface Props {
		level: Level;
		selected: BrushId;
		/** The brush settings live in `OptionsSheet`; the palette only re-arms ids. */
		options: BrushOptions;
	}

	let { level, selected = $bindable(), options = $bindable() }: Props = $props();

	const hex = (value: number) => `#${value.toString(16).padStart(6, '0')}`;

	const ICONS: Record<BrushId, typeof Package> = {
		pit: SquareDashed,
		wall: BrickWall,
		robot_gap: PanelBottomOpen,
		goal: Flag,
		conveyor: ChevronsRight,
		cargo_conveyor: ArrowBigRightDash,
		door: DoorClosed,
		pressure_plate: Footprints,
		switch: ToggleLeft,
		drop_off: Inbox,
		crate_grey: Package,
		crate_colour: Package,
		keycard: KeyRound,
		motion_sensor: Cctv,
		pallet: Layers,
		shelf: LibraryBig,
		pillar: Cuboid,
		guard_rail: Fence,
		barrel: Cylinder,
		cone: TrafficCone,
		tool_cart: Toolbox,
		robot: Bot,
		select: MousePointer2,
		erase: Eraser
	};

	// Two brushes wear the colour they are currently set to, and the goal the
	// green it has in the level; the rest take the text colour, so no light
	// tile colour is lost against the panel.
	const tint = (id: BrushId) => {
		if (id === 'goal') return hex(COLORS.goal);
		if (id === 'crate_colour') return hex(CRATE_COLORS[options.crateColor]);
		if (id === 'drop_off' && options.bayColor) return hex(CRATE_COLORS[options.bayColor]);
		return undefined;
	};

	/** Groups the author has folded away, by title. */
	let collapsed = $state<Record<string, boolean>>(
		Object.fromEntries(BRUSH_GROUPS.map((group) => [group.title, group.collapsed ?? false]))
	);

	/**
	 * Picking a brush re-arms the id it would author, so the next door painted
	 * is a new door rather than another tile of the last one.
	 */
	function pick(id: BrushId) {
		selected = id;
		options = armIds(level, id, options);
	}
</script>

{#snippet brushButton(id: BrushId)}
	{@const Icon = ICONS[id]}
	<button class="brush" class:active={selected === id} type="button" onclick={() => pick(id)}>
		<Icon size={16} class="brush-icon" color={tint(id)} />
		{BRUSH_LABELS[id]}
	</button>
{/snippet}

<div class="palette">
	<!-- Pinned above the groups, so the tools stay in reach however far down
	     the list has been scrolled. -->
	<div class="pinned">
		<div class="tools">
			{#each TOOL_IDS as id (id)}
				{@render brushButton(id)}
			{/each}
		</div>
	</div>

	{#each BRUSH_GROUPS as group (group.title)}
		{@const open = !collapsed[group.title]}
		<div class="group">
			<button
				class="group-toggle"
				type="button"
				aria-expanded={open}
				onclick={() => (collapsed[group.title] = open)}
			>
				<span class="group-title">{group.title}</span>
				<ChevronDown size={14} class="chevron {open ? '' : 'folded'}" />
			</button>
			{#if open}
				<div class="brushes">
					{#each group.ids as id (id)}
						{@render brushButton(id)}
					{/each}
				</div>
			{/if}
		</div>
	{/each}

	<p class="hint footnote">
		Klick/drag zum platzieren<br>
		Rechtsklick zum Radieren<br>
		<kbd>R</kbd> zum Drehen
	</p>
</div>

<style>
	.palette {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}

	.pinned {
		position: sticky;
		/* Flush with the scrolling column's top edge, over the panel padding. */
		top: 2px;
		z-index: 1;
		display: flex;
		flex-direction: column;
		margin: -12px -12px 0;
		padding: 12px 12px 0;
		border-bottom: 1px solid var(--panel-border);
		border-radius: var(--radius) var(--radius) 0 0;
		background: var(--panel);
	}

	.tools {
		display: flex;
		flex-direction: column;
		padding-bottom: 4px;
	}

	.group-toggle {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		margin: 0 0 8px;
		padding: 0;
		border: none;
		background: none;
		color: var(--text-faint);
		cursor: pointer;
	}

	.group-toggle:hover {
		color: var(--text);
	}

	.group-toggle :global(.chevron) {
		transition: transform 0.15s ease;
	}

	.group-toggle :global(.chevron.folded) {
		transform: rotate(-90deg);
	}

	.group-toggle .group-title {
		margin: 0;
	}

	.group-title {
		margin: 0 0 8px;
		font-family: var(--font-display);
		font-weight: var(--font-display-wt);
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-faint);
	}

	.brushes {
		display: flex;
		flex-direction: column;
	}

	.brush {
		display: flex;
		align-items: center;
		gap: 9px;
		width: 100%;
		padding: 6px 8px;
		border: 1px solid transparent;
		border-radius: calc(var(--radius) - 6px);
		background: none;
		font: inherit;
		font-family: var(--font-ui);
		font-size: 13px;
		color: var(--text);
		text-align: left;
		cursor: pointer;
	}

	.brush:hover {
		background: var(--chip-bg);
	}

	.brush.active {
		background: var(--chip-bg);
		border-color: var(--accent);
		color: var(--chip-text);
		font-weight: 600;
	}

	.brush :global(.brush-icon) {
		flex: none;
		color: var(--text-muted);
	}

	.brush.active :global(.brush-icon) {
		color: var(--accent);
	}

	.hint {
		margin: 0;
		font-size: 12px;
		color: var(--text-faint);
	}

	kbd {
		padding: 1px 4px;
		border: 1px solid var(--panel-border);
		border-radius: 4px;
		background: var(--bg);
		font-family: var(--font-ui);
		font-size: 11px;
	}

	.footnote {
		padding-top: 14px;
		border-top: 1px solid var(--panel-border);
	}
</style>
