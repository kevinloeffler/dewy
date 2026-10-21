<script lang="ts">
	import { CRATE_COLORS, CRATE_COLOR_NAMES } from '$lib/game/crate-color';
	import { addGoal, removeGoal, setBayGoal } from '$lib/game/editor/operations';
	import { bayGoals, type BayGoal } from '$lib/game/goals';
	import type { LevelDraft } from '$lib/game/editor/draft.svelte';
	import type { GoalCondition } from '$lib/game/level';

	interface Props {
		draft: LevelDraft;
	}

	let { draft }: Props = $props();


	let level = $derived(draft.level);
	let bays = $derived(bayGoals(level));
	/** Level-wide goals only; per-colour bay goals have their own rows below. */
	let stored = $derived(
		level.goals.flatMap((goal, index) => (goal.kind === 'deliver_bays' ? [] : [{ goal, index }])),
	);

	const hex = (value: number) => `#${value.toString(16).padStart(6, '0')}`;

	function describe(goal: GoalCondition): string {
		switch (goal.kind) {
			case 'reach_goal':
				return 'Erreiche das Zielfeld';
			case 'deliver_all':
				return 'Liefere jede farbige Kiste aus';
			case 'deliver_bays':
				return 'Abgabestellen beliefern';
		}
	}

	function add(goal: GoalCondition) {
		draft.edit((current) => addGoal(current, goal));
	}

	function step(bay: BayGoal, delta: number) {
		draft.edit((current) => setBayGoal(current, bay.color, bay.count + delta));
	}
</script>

<div class="goals">
	{#if stored.length > 0}
		<ul>
			{#each stored as { goal, index } (index)}
				<li>
					<span>{describe(goal)}</span>
					<button
						class="remove"
						type="button"
						aria-label="Ziel entfernen"
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
			+ Ziel erreichen
		</button>
		<button class="btn btn-ghost small" type="button" onclick={() => add({ kind: 'deliver_all' })}>
			+ Alle ausliefern
		</button>
	</div>

	{#if bays.length === 0}
		<p class="hint">Platziere eine Abgabestelle, um ein Lieferziel hinzuzufügen.</p>
	{:else}
		<div class="bays">
			<span class="label">Abgabestellen beliefern</span>
			<ul>
				{#each bays as bay (bay.color ?? 'plain')}
					{@const name = bay.color ? CRATE_COLOR_NAMES[bay.color] : 'Jede Farbe'}
					<li class:off={bay.count === 0}>
						<span class="bay">
							<span
								class="swatch"
								class:plain={bay.color === null}
								style:background={bay.color ? hex(CRATE_COLORS[bay.color]) : undefined}
							></span>
							{name}
						</span>
						<span class="stepper">
							<button
								type="button"
								aria-label="{name}: eine Abgabestelle weniger"
								disabled={bay.count === 0}
								onclick={() => step(bay, -1)}
							>
								−
							</button>
							<span class="count" aria-live="polite">{bay.count} / {bay.total}</span>
							<button
								type="button"
								aria-label="{name}: eine Abgabestelle mehr"
								disabled={bay.count === bay.total}
								onclick={() => step(bay, 1)}
							>
								+
							</button>
						</span>
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	{#if stored.length === 0 && bays.every((bay) => bay.count === 0)}
		<p class="hint">Noch keine Ziele — das Level lässt sich nicht abschliessen.</p>
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

	.add {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}

	.bays {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.label {
		font-size: 12px;
		color: var(--text-faint);
	}

	li.off .bay {
		color: var(--text-faint);
	}

	.bay {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.swatch {
		width: 10px;
		height: 10px;
		border-radius: 2px;
		flex-shrink: 0;
	}

	.swatch.plain {
		border: 1px solid var(--text-faint);
	}

	.stepper {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.stepper button {
		width: 22px;
		height: 22px;
		font: inherit;
		font-size: 14px;
		line-height: 1;
		color: var(--text);
		background: var(--bg);
		border: 1px solid var(--panel-border);
		border-radius: calc(var(--radius) - 8px);
		cursor: pointer;
		padding: 0;
	}

	.stepper button:disabled {
		color: var(--text-faint);
		cursor: default;
	}

	.count {
		min-width: 40px;
		text-align: center;
		font-variant-numeric: tabular-nums;
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
