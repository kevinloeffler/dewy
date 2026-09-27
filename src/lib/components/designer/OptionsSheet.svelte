<script lang="ts">
	import OptionFields from './OptionFields.svelte';
	import { armIds, nextBeltId } from '$lib/game/editor/operations';
	import {
		brushOptionKeys,
		decorationOptions,
		defaultBrushOptions,
		itemOptions,
		tileOptions,
		type BrushId,
		type BrushOptions
	} from '$lib/game/editor/brush';
	import type { Selection } from '$lib/game/editor/selection';
	import type { Level } from '$lib/game/level';

	/**
	 * The settings of whatever the tool in hand is about — the thing selected,
	 * or the next thing the brush paints — floating over the level.
	 *
	 * It lives over the canvas rather than in the palette so that picking a
	 * brush with settings, or one without, never shifts the brush list under
	 * the pointer. A tool with no settings shows what it does instead.
	 */
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

	let { level, selected, options = $bindable(), selection, onedit, ondelete }: Props = $props();

	let optionKeys = $derived(brushOptionKeys(selected, options));

	/** What a tool does, for the tools that paint nothing and so have no options. */
	const TOOL_HINTS: Partial<Record<BrushId, string>> = {
		erase:
			'Klick ein Feld an, um es zu leeren.'
	};

	/**
	 * A changed setting re-arms the id the brush would author — switching a
	 * belt's drive on has to find it a free id. Except when the change *is* an
	 * id: that is the author saying "this one joins that belt", and is not to
	 * be second-guessed.
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
			case 'decoration':
				return {
					id: selection.decoration.kind,
					options: decorationOptions(selection.decoration, options)
				};
			case 'robot':
				return { id: 'robot' as const, options: { ...options, facing: selection.facing } };
		}
	});
</script>

{#if selected === 'select' && selection && selectedThing}
	<div class="sheet">
		<h3 class="sheet-title">Optionen</h3>

		<p class="selected-thing">
			{selection.label}
			{#if selection.linked.length > 0}
				<span class="count">steuert {selection.linked.length}</span>
			{:else if selection.coords.length > 1}
				<span class="count">{selection.coords.length} Felder</span>
			{/if}
		</p>

		<!-- The same controls the brushes use, writing to what is selected
		     instead of to the next thing painted. -->
		<OptionFields {level} id={selectedThing.id} options={selectedThing.options} onchange={onedit} />

		{#if selection.kind === 'robot'}
			<p class="hint">Jedes Level behält seinen Roboter — platziere ihn mit „Roboter-Start“ neu.</p>
		{:else}
			<button class="btn btn-ghost danger-btn" type="button" onclick={ondelete}>
				Löschen (⌫)
			</button>
		{/if}
	</div>
{:else if optionKeys.length > 0}
	<div class="sheet">
		<h3 class="sheet-title">Optionen</h3>

		<OptionFields {level} id={selected} {options} onchange={changeOption} />
	</div>
{:else if TOOL_HINTS[selected]}
	<div class="sheet">
		<h3 class="sheet-title">Optionen</h3>

		<p class="hint">{TOOL_HINTS[selected]}</p>
	</div>
{/if}

<style>
	.sheet {
		position: absolute;
		top: 12px;
		left: 12px;
		z-index: 1;
		width: 240px;
		max-height: calc(100% - 24px);
		overflow-y: auto;
		padding: 12px;
		border: 1px solid var(--panel-border);
		border-radius: calc(var(--radius) - 4px);
		background: var(--panel);
		box-shadow: var(--panel-shadow);
	}

	.sheet-title {
		margin: 0 0 8px;
		font-family: var(--font-display);
		font-weight: var(--font-display-wt);
		font-size: 11px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-faint);
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

	.hint {
		margin: 0;
		font-size: 12px;
		color: var(--text-faint);
	}
</style>
