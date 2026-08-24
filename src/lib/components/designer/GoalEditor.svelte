<script lang="ts">
	import { CRATE_COLORS, type CrateColor } from '$lib/game/crate-color';
	import { addGoal, dropOffBays, removeGoal } from '$lib/game/editor/operations';
	import type { LevelDraft } from '$lib/game/editor/draft.svelte';
	import type { GoalCondition } from '$lib/game/level';

	interface Props {
		draft: LevelDraft;
	}

	let { draft }: Props = $props();

	const COLOR_NAMES = Object.keys(CRATE_COLORS) as CrateColor[];

	let level = $derived(draft.level);
	let bays = $derived(dropOffBays(level));

	let color = $state<CrateColor>('red');
	let bayIndex = $state(0);

	// A bay can be deleted out from under the picker.
	$effect(() => {
		if (bayIndex >= bays.length) bayIndex = 0;
	});

	function describe(goal: GoalCondition): string {
		switch (goal.kind) {
			case 'reach_goal':
				return 'Reach the goal tile';
			case 'deliver_all':
				return 'Deliver every colour crate';
			case 'deliver_specific':
				return `Deliver a ${goal.color} crate to (${goal.dropOffPosition.x}, ${goal.dropOffPosition.y})`;
		}
	}

	function add(goal: GoalCondition) {
		draft.edit((current) => addGoal(current, goal));
	}

	function addSpecific() {
		const bay = bays[bayIndex];
		if (!bay) return;
		add({ kind: 'deliver_specific', color, dropOffPosition: bay.coord });
	}
</script>

<div class="goals">
	{#if level.goals.length === 0}
		<p class="hint">No goals yet — the level cannot be completed.</p>
	{:else}
		<ul>
			{#each level.goals as goal, index (index)}
				<li>
					<span>{describe(goal)}</span>
					<button
						class="remove"
						type="button"
						aria-label="Remove goal"
						onclick={() => draft.edit((current) => removeGoal(current, index))}
					>
						×
					</button>
				</li>
			{/each}
		</ul>
	{/if}

	<div class="add">
		<button class="btn btn-ghost small" type="button" onclick={() => add({ kind: 'reach_goal' })}>
			+ Reach goal
		</button>
		<button class="btn btn-ghost small" type="button" onclick={() => add({ kind: 'deliver_all' })}>
			+ Deliver all
		</button>
	</div>

	<div class="specific">
		<select bind:value={color}>
			{#each COLOR_NAMES as name (name)}
				<option value={name}>{name}</option>
			{/each}
		</select>
		<select bind:value={bayIndex} disabled={bays.length === 0}>
			{#each bays as bay, index (index)}
				<option value={index}>
					bay ({bay.coord.x}, {bay.coord.y}){bay.color ? ` · ${bay.color}` : ''}
				</option>
			{/each}
		</select>
		<button
			class="btn btn-ghost small"
			type="button"
			disabled={bays.length === 0}
			onclick={addSpecific}
		>
			+ Deliver
		</button>
	</div>

	{#if bays.length === 0}
		<p class="hint">Paint a drop-off bay to add a delivery goal.</p>
	{/if}
</div>

<style>
	.goals {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		font-size: 13px;
		color: var(--text);
		background: var(--chip-bg);
		border-radius: calc(var(--radius) - 8px);
		padding: 6px 8px;
	}

	.remove {
		border: none;
		background: none;
		color: var(--text-faint);
		font-size: 16px;
		line-height: 1;
		cursor: pointer;
		padding: 0 2px;
	}

	.remove:hover {
		color: var(--danger);
	}

	.add,
	.specific {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}

	.specific select {
		flex: 1;
		min-width: 0;
		font: inherit;
		font-family: var(--font-ui);
		font-size: 12px;
		color: var(--text);
		background: var(--bg);
		border: 1px solid var(--panel-border);
		border-radius: calc(var(--radius) - 8px);
		padding: 5px 6px;
	}

	.small {
		padding: 5px 10px;
		font-size: 12px;
		white-space: nowrap;
	}

	.hint {
		margin: 0;
		font-size: 12px;
		color: var(--text-faint);
	}
</style>
