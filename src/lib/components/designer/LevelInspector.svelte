<script lang="ts">
	import { untrack } from 'svelte';
	import { resize, setMeta, setOptions } from '$lib/game/editor/operations';
	import type { LevelDraft } from '$lib/game/editor/draft.svelte';
	import type { LanguageStage } from '$lib/game/level';
	import { decorationTiles } from '$lib/game/decorations';
	import { inBounds } from '$lib/game/grid';

	interface Props {
		draft: LevelDraft;
	}

	let { draft }: Props = $props();

	let level = $derived(draft.level);

	// Size is staged rather than applied on every keystroke: shrinking is
	// lossy, so it gets an explicit button and a count of what it would drop.
	let width = $state(untrack(() => draft.level.width));
	let height = $state(untrack(() => draft.level.height));

	// Re-sync when the level's own size changes — a resize, an undo, a redo.
	// Guarded against the level *reference* changing, which happens on every
	// brush stroke and would otherwise wipe a size the user was mid-way
	// through typing.
	let synced = { width: untrack(() => draft.level.width), height: untrack(() => draft.level.height) };

	$effect(() => {
		const level = draft.level;
		if (level.width === synced.width && level.height === synced.height) return;

		synced = { width: level.width, height: level.height };
		width = level.width;
		height = level.height;
	});

	let sizeChanged = $derived(width !== level.width || height !== level.height);

	let wouldDrop = $derived.by(() => {
		if (!sizeChanged) return 0;
		const bounds = { ...level, width, height };
		const tiles = Object.keys(level.tiles).filter((key) => {
			const [x, y] = key.split(',').map(Number);
			return !inBounds(bounds, { x, y });
		}).length;
		const items = level.items.filter((item) => !inBounds(bounds, item.position)).length;
		// A piece goes whole: half a shelf hanging off the grid is not a level.
		const decorations = level.decorations.filter(
			(decoration) => !decorationTiles(decoration).every((coord) => inBounds(bounds, coord))
		).length;
		return tiles + items + decorations;
	});

	let energyOn = $derived(level.options.energy !== null);
	let memoryOn = $derived(level.options.memory !== null);

	function applySize() {
		draft.edit((current) => resize(current, width, height));
	}
</script>

<div class="inspector">
	<label class="field">
		Name
		<input
			value={level.name}
			onchange={(event) =>
				draft.edit((current) => setMeta(current, { name: event.currentTarget.value }))}
		/>
	</label>

	<label class="field">
		Beschreibung
		<textarea
			rows="2"
			value={level.description ?? ''}
			onchange={(event) =>
				draft.edit((current) =>
					setMeta(current, { description: event.currentTarget.value.trim() || null })
				)}
		></textarea>
	</label>

	<div class="field">
		Rastergrösse
		<div class="size">
			<input type="number" min="1" max="40" bind:value={width} aria-label="Breite" />
			<span class="times">×</span>
			<input type="number" min="1" max="40" bind:value={height} aria-label="Höhe" />
		</div>
		{#if sizeChanged}
			<button class="btn btn-ghost small" type="button" onclick={applySize}>
				Auf {width} × {height} ändern
			</button>
			{#if wouldDrop > 0}
				<p class="warn">
					Verwirft {wouldDrop} {wouldDrop === 1 ? 'Objekt' : 'Objekte'} ausserhalb des neuen Rasters.
				</p>
			{/if}
		{/if}
	</div>

	<hr />

	<label class="field check">
		<input
			type="checkbox"
			checked={energyOn}
			onchange={(event) =>
				draft.edit((current) =>
					setOptions(current, { energy: event.currentTarget.checked ? 15 : null })
				)}
		/>
		Energielimit
	</label>

	{#if energyOn}
		<label class="field indent">
			Maximale Anzahl Befehle
			<input
				type="number"
				min="1"
				value={level.options.energy}
				onchange={(event) =>
					draft.edit((current) =>
						setOptions(current, { energy: Number(event.currentTarget.value) || 1 })
					)}
			/>
		</label>
	{/if}

	<label class="field check">
		<input
			type="checkbox"
			checked={memoryOn}
			onchange={(event) =>
				draft.edit((current) =>
					setOptions(current, { memory: event.currentTarget.checked ? 12 : null })
				)}
		/>
		Speicherlimit
	</label>

	{#if memoryOn}
		<label class="field indent">
			Maximale Anzahl Anweisungen
			<input
				type="number"
				min="1"
				value={level.options.memory}
				onchange={(event) =>
					draft.edit((current) =>
						setOptions(current, { memory: Number(event.currentTarget.value) || 1 })
					)}
			/>
		</label>
	{/if}

	<label class="field check">
		<input
			type="checkbox"
			checked={level.options.showInventory}
			onchange={(event) =>
				draft.edit((current) =>
					setOptions(current, { showInventory: event.currentTarget.checked })
				)}
		/>
		Inventar anzeigen
	</label>

	<label class="field">
		<span class="field-label">
			Sprachstufe
			<!-- A new tab, so the overview never costs an unsaved level. -->
			<a
				class="info"
				href="/docs/language/stages"
				target="_blank"
				rel="noopener"
				title="Was gehört zu welcher Stufe?"
				aria-label="Übersicht der Sprachstufen"
			>
				<svg
					width="13"
					height="13"
					viewBox="0 0 16 16"
					fill="none"
					stroke="currentColor"
					stroke-width="1.6"
					stroke-linecap="round"
					aria-hidden="true"
				>
					<circle cx="8" cy="8" r="6.5" />
					<path d="M8 7.25V11" />
					<circle cx="8" cy="4.9" r="0.4" fill="currentColor" />
				</svg>
			</a>
		</span>
		<select
			value={level.options.languageStage}
			onchange={(event) =>
				draft.edit((current) =>
					setOptions(current, {
						languageStage: Number(event.currentTarget.value) as LanguageStage
					})
				)}
		>
			{#each [1, 2, 3, 4, 5] as stage (stage)}
				<option value={stage}>Stufe {stage}</option>
			{/each}
		</select>
	</label>
</div>

<style>
	.inspector {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 5px;
		font-size: 12px;
		color: var(--text-muted);
	}

	.field.check {
		flex-direction: row;
		align-items: center;
		gap: 8px;
	}

	.field.indent {
		padding-left: 22px;
	}

	.field :global(input:not([type='checkbox'])),
	.field :global(select),
	.field :global(textarea) {
		font: inherit;
		font-family: var(--font-ui);
		font-size: 13px;
		color: var(--text);
		background: var(--bg);
		border: 1px solid var(--panel-border);
		border-radius: calc(var(--radius) - 8px);
		padding: 6px 8px;
		width: 100%;
		resize: vertical;
	}

	.field-label {
		display: flex;
		align-items: center;
		gap: 5px;
	}

	.info {
		display: inline-flex;
		color: var(--text-faint);
	}

	.info:hover,
	.info:focus-visible {
		color: var(--accent);
	}

	.size {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.times {
		color: var(--text-faint);
	}

	.small {
		align-self: flex-start;
		padding: 5px 10px;
		font-size: 12px;
		margin-top: 6px;
	}

	.warn {
		margin: 6px 0 0;
		font-size: 12px;
		color: var(--danger);
	}

	hr {
		border: none;
		border-top: 1px solid var(--panel-border);
		margin: 2px 0;
		width: 100%;
	}
</style>
