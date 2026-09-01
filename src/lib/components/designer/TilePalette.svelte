<script lang="ts">
	import { CRATE_COLORS, type CrateColor } from '$lib/game/crate-color';
	import { COLORS } from '$lib/game/models/tiles';
	import OptionFields from './OptionFields.svelte';
	import { armIds, nextBeltId } from '$lib/game/editor/operations';
	import {
		BRUSH_GROUPS,
		BRUSH_LABELS,
		brushOptionKeys,
		defaultBrushOptions,
		itemOptions,
		tileOptions,
		type BrushId,
		type BrushOptions
	} from '$lib/game/editor/brush';
	import type { Selection } from '$lib/game/editor/selection';
	import type { Level } from '$lib/game/level';

	interface Props {
		level: Level;
		selected: BrushId;
		options: BrushOptions;
		/** What the select tool has picked, if it is the active tool. */
		selection: Selection | null;
		/** One changed setting on the selection — applied to every tile it covers. */
		onedit: (patch: Partial<BrushOptions>) => void;
		ondelete: () => void;
	}

	let {
		level,
		selected = $bindable(),
		options = $bindable(),
		selection,
		onedit,
		ondelete
	}: Props = $props();

	const hex = (value: number) => `#${value.toString(16).padStart(6, '0')}`;

	// Mirrors the palette in `models/tiles.ts` so a brush looks like the tile
	// it paints. The robot and keycard are not tiles and carry their own.
	const SWATCHES: Record<BrushId, string> = {
		floor: hex(COLORS.floorLight),
		pit: hex(COLORS.void),
		wall: hex(COLORS.wall),
		robot_gap: hex(COLORS.wall),
		goal: hex(COLORS.goal),
		conveyor: hex(COLORS.conveyor),
		cargo_conveyor: hex(COLORS.cargo),
		door: hex(COLORS.door),
		pressure_plate: hex(COLORS.plate),
		switch: hex(COLORS.lever),
		drop_off: hex(COLORS.goal),
		crate_grey: hex(CRATE_COLORS.grey),
		crate_colour: hex(CRATE_COLORS.red),
		keycard: '#f0c419',
		robot: '#ff9600',
		select: 'transparent',
		erase: 'transparent'
	};

	// Two brushes wear the colour they are currently set to.
	const swatch = (id: BrushId) => {
		if (id === 'crate_colour') return hex(CRATE_COLORS[options.crateColor]);
		if (id === 'drop_off') {
			return options.bayColor ? hex(CRATE_COLORS[options.bayColor]) : hex(COLORS.goal);
		}
		return SWATCHES[id];
	};

	let optionKeys = $derived(brushOptionKeys(selected, options));

	/**
	 * Picking a brush re-arms the id it would author, so the next door painted
	 * is a new door rather than another tile of the last one.
	 */
	function pick(id: BrushId) {
		selected = id;
		options = armIds(level, id, options);
	}

	/**
	 * The same on a changed setting — switching a belt's drive on has to find
	 * it a free id. Except when the change *is* an id: that is the author
	 * saying "this one joins that belt", and is not to be second-guessed.
	 */
	function changeOption(patch: Partial<BrushOptions>) {
		const next = { ...options, ...patch };
		options =
			patch.beltId === undefined && patch.doorId === undefined
				? armIds(level, selected, next)
				: next;
	}

	/**
	 * The selected thing as the option fields want it: which settings to show,
	 * and the values it was authored with. The same controls the brushes use,
	 * so a switch offers its link whether you are about to paint one or are
	 * looking at one.
	 */
	let selectedThing = $derived.by(() => {
		if (!selection) return null;
		switch (selection.kind) {
			case 'tiles': {
				// A belt with no drive yet is offered a *free* belt id, so
				// switching one on cannot quietly enrol it in `belt-1`.
				const base = { ...defaultBrushOptions(), beltId: nextBeltId(level) };
				return { id: selection.tile.kind, options: tileOptions(selection.tile, base) };
			}
			case 'item':
				return { id: selection.item.kind, options: itemOptions(selection.item) };
			case 'robot':
				return { id: 'robot' as const, options: { ...options, facing: selection.facing } };
		}
	});
</script>

<div class="palette">
	{#each BRUSH_GROUPS as group (group.title)}
		<div class="group">
			<h3 class="group-title">{group.title}</h3>
			<div class="brushes">
				{#each group.ids as id (id)}
					<button
						class="brush"
						class:active={selected === id}
						type="button"
						onclick={() => pick(id)}
					>
						<span
							class="swatch"
							class:empty={id === 'erase'}
							class:marquee={id === 'select'}
							style="background: {swatch(id)}"
						></span>
						{BRUSH_LABELS[id]}
					</button>
				{/each}
			</div>
		</div>
	{/each}

	{#if selected === 'select'}
		<div class="group options">
			<h3 class="group-title">Selection</h3>

			{#if selection && selectedThing}
				<p class="selected-thing">
					{selection.label}
					{#if selection.linked.length > 0}
						<span class="count">drives {selection.linked.length}</span>
					{:else if selection.coords.length > 1}
						<span class="count">{selection.coords.length} tiles</span>
					{/if}
				</p>

				<!-- The same controls the brushes use, writing to what is selected
				     instead of to the next thing painted. -->
				<OptionFields {level} id={selectedThing.id} options={selectedThing.options} onchange={onedit} />

				{#if selection.kind === 'robot'}
					<p class="hint">Every level keeps its robot — move it with the Robot start brush.</p>
				{:else}
					<button class="btn btn-ghost danger-btn" type="button" onclick={ondelete}>
						Delete (⌫)
					</button>
				{/if}
			{:else}
				<p class="hint">
					Click a thing to select it. A belt, a door or a wall comes as one, and a switch
					brings along whatever it drives.
				</p>
			{/if}
		</div>
	{/if}

	{#if optionKeys.length > 0}
		<div class="group options">
			<h3 class="group-title">{BRUSH_LABELS[selected]} options</h3>

			<OptionFields {level} id={selected} {options} onchange={changeOption} />
		</div>
	{/if}

	<p class="hint footnote">Drag to paint · right-click to erase</p>
</div>

<style>
	.palette {
		display: flex;
		flex-direction: column;
		gap: 18px;
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
		gap: 2px;
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

	.swatch {
		width: 14px;
		height: 14px;
		flex: none;
		border-radius: 4px;
		box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.15);
	}

	.swatch.empty {
		box-shadow: inset 0 0 0 1px var(--danger);
	}

	.swatch.marquee {
		border: 1px dashed var(--accent);
		box-shadow: none;
	}

	.selected-thing {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
		margin: 0 0 10px;
		font-size: 13px;
		font-weight: 600;
		color: var(--text);
	}

	.count {
		font-size: 12px;
		font-weight: 400;
		color: var(--text-faint);
	}

	.danger-btn {
		width: 100%;
		color: var(--danger);
	}

	.options {
		padding-top: 14px;
		border-top: 1px solid var(--panel-border);
	}

	.hint {
		margin: 0;
		font-size: 12px;
		color: var(--text-faint);
	}

	.footnote {
		padding-top: 14px;
		border-top: 1px solid var(--panel-border);
	}
</style>
