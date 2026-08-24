<script lang="ts">
	import { CRATE_COLORS, type CrateColor } from '$lib/game/crate-color';
	import { COLORS } from '$lib/game/models/tiles';
	import { doorIds, nextDoorId } from '$lib/game/editor/operations';
	import {
		BRUSH_GROUPS,
		BRUSH_LABELS,
		brushOptionKeys,
		type BrushId,
		type BrushOptions
	} from '$lib/game/editor/brush';
	import type { Direction, Level } from '$lib/game/level';

	interface Props {
		level: Level;
		selected: BrushId;
		options: BrushOptions;
	}

	let { level, selected = $bindable(), options = $bindable() }: Props = $props();

	const DIRECTIONS: Direction[] = ['north', 'east', 'south', 'west'];
	const COLOR_NAMES = Object.keys(CRATE_COLORS) as CrateColor[];

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

	let doors = $derived(doorIds(level));
	let optionKeys = $derived(brushOptionKeys(selected));
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
						onclick={() => (selected = id)}
					>
						<span
							class="swatch"
							class:empty={id === 'erase'}
							style="background: {swatch(id)}"
						></span>
						{BRUSH_LABELS[id]}
					</button>
				{/each}
			</div>
		</div>
	{/each}

	{#if optionKeys.length > 0}
		<div class="group options">
			<h3 class="group-title">{BRUSH_LABELS[selected]} options</h3>

			{#each optionKeys as key (key)}
				{#if key === 'direction' || key === 'facing'}
					<label class="option">
						{key === 'facing' ? 'Facing' : 'Direction'}
						<select bind:value={options[key]}>
							{#each DIRECTIONS as direction (direction)}
								<option value={direction}>{direction}</option>
							{/each}
						</select>
					</label>
				{:else if key === 'crateColor'}
					<label class="option">
						Colour
						<select bind:value={options.crateColor}>
							{#each COLOR_NAMES as color (color)}
								<option value={color}>{color}</option>
							{/each}
						</select>
					</label>
				{:else if key === 'bayColor'}
					<label class="option">
						Accepts
						<select bind:value={options.bayColor}>
							<option value={null}>any colour</option>
							{#each COLOR_NAMES as color (color)}
								<option value={color}>{color}</option>
							{/each}
						</select>
					</label>
				{:else if key === 'doorId' || key === 'targetId'}
					<label class="option">
						{key === 'doorId' && selected === 'keycard' ? 'Opens door' : 'Links to'}
						<span class="id-field">
							<input list="designer-door-ids" bind:value={options[key]} autocomplete="off" />
							{#if selected === 'door'}
								<button
									class="btn btn-ghost tiny"
									type="button"
									onclick={() => (options.doorId = nextDoorId(level))}
								>
									New
								</button>
							{/if}
						</span>
					</label>
					{#if doors.length === 0 && selected !== 'door'}
						<p class="hint">No door tiles yet — paint a door first.</p>
					{/if}
				{:else if key === 'initiallyOpen' || key === 'initiallyOn'}
					<label class="option check">
						<input type="checkbox" bind:checked={options[key]} />
						{key === 'initiallyOpen' ? 'Starts open' : 'Starts on'}
					</label>
				{/if}
			{/each}

			<datalist id="designer-door-ids">
				{#each doors as id (id)}
					<option value={id}></option>
				{/each}
			</datalist>
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

	.options {
		padding-top: 14px;
		border-top: 1px solid var(--panel-border);
	}

	.option {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-bottom: 10px;
		font-size: 12px;
		color: var(--text-muted);
	}

	.option.check {
		flex-direction: row;
		align-items: center;
		gap: 8px;
	}

	.option :global(select),
	.option :global(input[type='text']),
	.option :global(input:not([type])) {
		font: inherit;
		font-family: var(--font-ui);
		font-size: 13px;
		color: var(--text);
		background: var(--bg);
		border: 1px solid var(--panel-border);
		border-radius: calc(var(--radius) - 8px);
		padding: 5px 7px;
		width: 100%;
	}

	.id-field {
		display: flex;
		gap: 6px;
	}

	.tiny {
		padding: 4px 8px;
		font-size: 12px;
		white-space: nowrap;
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
