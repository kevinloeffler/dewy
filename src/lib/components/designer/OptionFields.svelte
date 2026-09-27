<script lang="ts">
	import { CRATE_COLOR_NAMES, DELIVERY_COLORS, type CrateColor } from '$lib/game/crate-color';
	import { doorIds, targetIds } from '$lib/game/editor/operations';
	import {
		brushOptionKeys,
		type BrushId,
		type BrushOptions
	} from '$lib/game/editor/brush';
	import { linkLabel, type Direction, type Level } from '$lib/game/level';

	interface Props {
		level: Level;
		/** Whose settings to show — a brush id, or the kind of the selected thing. */
		id: BrushId;
		/** The values to show. For a selection, what the thing was authored with. */
		options: BrushOptions;
		/** One changed field. The caller decides whether that paints or edits. */
		onchange: (patch: Partial<BrushOptions>) => void;
	}

	let { level, id, options, onchange }: Props = $props();

	const DIRECTIONS: Direction[] = ['north', 'east', 'south', 'west'];

	const DIRECTION_NAMES: Record<Direction, string> = {
		north: 'Norden',
		east: 'Osten',
		south: 'Süden',
		west: 'Westen'
	};

	const BELT_EFFECTS = [
		{ value: 'none', label: 'Läuft immer' },
		{ value: 'power', label: 'Schalter stoppt / startet es' },
		{ value: 'reverse', label: 'Schalter dreht es um' }
	] as const;

	let keys = $derived(brushOptionKeys(id, options));

	// A keycard only ever opens doors; a switch or a plate may drive a belt or
	// a motion sensor too, so the two fields offer different lists.
	let doors = $derived(doorIds(level));
	let targets = $derived(targetIds(level));

	/**
	 * The ids a dropdown offers.
	 *
	 * The current value always appears, even when nothing in the level answers
	 * to it — a door painted with a brand new id, or a link left dangling by an
	 * erase, has to keep saying what it says rather than quietly reading as
	 * whatever happens to sit at the top of the list.
	 */
	function choices(known: string[], current: string): string[] {
		if (current === '' || known.includes(current)) return known;
		return [current, ...known];
	}

	type LinkKey = 'keycardDoorId' | 'switchTargetId' | 'plateTargetId';

	function isLink(key: keyof BrushOptions): key is LinkKey {
		return key === 'keycardDoorId' || key === 'switchTargetId' || key === 'plateTargetId';
	}

</script>

{#each keys as key (key)}
	{#if key === 'decorationFacing' || key === 'doorFacing'}
		<label class="option">
			Ausrichtung
			<select
				value={options[key]}
				onchange={(event) => onchange({ [key]: event.currentTarget.value as Direction })}
			>
				{#each DIRECTIONS as direction (direction)}
					<option value={direction}>{DIRECTION_NAMES[direction]}</option>
				{/each}
			</select>
		</label>
		{#if id === 'guard_rail'}
			<p class="hint">
				Ein Geländer verbindet sich von selbst mit den Geländern daneben — die Ausrichtung
				zählt nur, solange es allein steht.
			</p>
		{/if}
	{:else if key === 'direction' || key === 'facing'}
		<label class="option">
			{key === 'facing' ? 'Blickrichtung' : 'Richtung'}
			<select
				value={options[key]}
				onchange={(event) => onchange({ [key]: event.currentTarget.value as Direction })}
			>
				{#each DIRECTIONS as direction (direction)}
					<option value={direction}>{DIRECTION_NAMES[direction]}</option>
				{/each}
			</select>
		</label>
	{:else if key === 'crateColor'}
		<label class="option">
			Farbe
			<select
				value={options.crateColor}
				onchange={(event) => onchange({ crateColor: event.currentTarget.value as CrateColor })}
			>
				{#each DELIVERY_COLORS as color (color)}
					<option value={color}>{CRATE_COLOR_NAMES[color]}</option>
				{/each}
			</select>
		</label>
	{:else if key === 'bayColor'}
		<label class="option">
			Nimmt an
			<select
				value={options.bayColor ?? ''}
				onchange={(event) =>
					onchange({ bayColor: (event.currentTarget.value || null) as CrateColor | null })}
			>
				<option value="">jede Farbe</option>
				{#each DELIVERY_COLORS as color (color)}
					<option value={color}>{CRATE_COLOR_NAMES[color]}</option>
				{/each}
			</select>
		</label>
	{:else if key === 'doorName' || key === 'beltName'}
		<!-- Committed on change (blur or Enter), not per keystroke, so typing a
		     name is one undo step rather than one per letter. The id behind it
		     stays fixed, so renaming never breaks a link. -->
		<label class="option">
			Name
			<input
				type="text"
				value={options[key]}
				placeholder={key === 'doorName' ? options.doorId : options.beltId}
				onchange={(event) => onchange({ [key]: event.currentTarget.value.trim() })}
			/>
		</label>
		<p class="hint">
			{key === 'doorName'
				? 'So erscheint die Tür bei Keycards, Schaltern und Druckplatten.'
				: 'So erscheint das Band bei Schaltern und Druckplatten.'}
		</p>
	{:else if isLink(key)}
		{@const known = key === 'keycardDoorId' ? doors : targets}
		<label class="option">
			{key === 'keycardDoorId' ? 'Öffnet Tür' : 'Verknüpft mit'}
			<select value={options[key]} onchange={(event) => onchange({ [key]: event.currentTarget.value })}>
				<!-- Nothing is linked until the author links it, so a fresh
				     keycard, switch or plate says so rather than pointing at
				     whatever id happens to be first. -->
				<option value="">nicht verknüpft</option>
				{#each choices(known, options[key]) as choice (choice)}
					<option value={choice}>{linkLabel(level, choice)}</option>
				{/each}
			</select>
		</label>
		{#if key === 'keycardDoorId' && doors.length === 0}
			<p class="hint">Noch keine Türfelder — platziere zuerst eine Tür.</p>
		{:else if key !== 'keycardDoorId' && targets.length === 0}
			<p class="hint">Noch nichts zum Verknüpfen — platziere zuerst eine Tür oder ein steuerbares Band.</p>
		{/if}
	{:else if key === 'beltEffect'}
		<label class="option">
			Antrieb
			<select
				value={options.beltEffect}
				onchange={(event) =>
					onchange({ beltEffect: event.currentTarget.value as BrushOptions['beltEffect'] })}
			>
				{#each BELT_EFFECTS as effect (effect.value)}
					<option value={effect.value}>{effect.label}</option>
				{/each}
			</select>
		</label>
	{:else if key === 'beltInitiallyOn'}
		<label class="option check">
			<input
				type="checkbox"
				checked={options.beltInitiallyOn}
				onchange={(event) => onchange({ beltInitiallyOn: event.currentTarget.checked })}
			/>
			{options.beltEffect === 'reverse' ? 'Startet vorwärts' : 'Läuft von Anfang an'}
		</label>
	{:else if key === 'initiallyOpen' || key === 'initiallyOn'}
		<label class="option check">
			<input
				type="checkbox"
				checked={options[key]}
				onchange={(event) => onchange({ [key]: event.currentTarget.checked })}
			/>
			{key === 'initiallyOpen' ? 'Startet offen' : 'Startet eingeschaltet'}
		</label>
	{/if}
{/each}

<style>
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

	.option select,
	.option input[type='text'] {
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

	.hint {
		margin: 0 0 10px;
		font-size: 12px;
		color: var(--text-faint);
	}
</style>
