<script lang="ts">
	import { Button } from '$lib/components/index.js';

	interface Props {
		running: boolean;
		activeLine: number | null;
		/** Commands run so far, i.e. energy spent. */
		steps: number;
		/** `LevelOptions.energy` — the battery, in commands. `null` = unlimited. */
		energy: number | null;
		/** `LevelOptions.memory` — the program cap, in statements. `null` = unlimited. */
		memory: number | null;
		/** Statements in the current program, or `null` while it does not parse. */
		memoryUsed: number | null;
		/** Over the memory cap — Run and Step are refused until it fits. */
		blocked: boolean;
		speed: number;
		onrun: () => void;
		onstep: () => void;
		onstop: () => void;
		onreset: () => void;
	}

	let {
		running,
		activeLine,
		steps,
		energy,
		memory,
		memoryUsed,
		blocked,
		speed = $bindable(),
		onrun,
		onstep,
		onstop,
		onreset,
	}: Props = $props();

	const SPEEDS = [0.5, 1, 2, 4];
</script>

<div class="controls">
	{#if running}
		<Button onclick={onstop}>
			{#snippet icon()}
				<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
					<rect x="2" y="2" width="8" height="8" rx="1" fill="currentColor" />
				</svg>
			{/snippet}
			Stop
		</Button>
	{:else}
		<Button onclick={onrun} disabled={blocked}>
			{#snippet icon()}
				<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
					<polygon points="2,1 2,11 11,6" fill="currentColor" />
				</svg>
			{/snippet}
			Run
		</Button>
	{/if}

	<Button variant="ghost" onclick={onstep} disabled={blocked}>
		{#snippet icon()}
			<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
				<polygon points="2,2 2,10 7,6" fill="currentColor" />
				<rect x="8" y="2" width="2" height="8" fill="currentColor" />
			</svg>
		{/snippet}
		Step
	</Button>

	<Button variant="ghost" onclick={onreset}>
		{#snippet icon()}
			<svg
				width="12"
				height="12"
				viewBox="0 0 12 12"
				fill="none"
				stroke="currentColor"
				stroke-width="1.6"
				stroke-linecap="round"
				stroke-linejoin="round"
				aria-hidden="true"
			>
				<path d="M2 6a4 4 0 1 0 1.2-2.85" />
				<polyline points="1.5,1.5 2.5,4 5,3" />
			</svg>
		{/snippet}
		Reset
	</Button>

	<div class="readout">
		<label class="speed">
			<span class="sr-only">Animation speed</span>
			<select bind:value={speed}>
				{#each SPEEDS as option (option)}
					<option value={option}>{option}×</option>
				{/each}
			</select>
		</label>

		<span class="counter">
			<span>line {activeLine ?? '—'}</span>
			{#if energy !== null}
				<span class="gauge" title="Energy — one command costs one">⚡ {steps}/{energy}</span>
			{/if}
			{#if memory !== null}
				<span class="gauge" class:is-over={blocked} title="Memory — statements the robot can hold">
					▤ {memoryUsed ?? '—'}/{memory}
				</span>
			{/if}
		</span>
	</div>
</div>

<style>
	.controls {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}

	.readout {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.counter {
		display: flex;
		align-items: center;
		gap: 8px;
		font-family: var(--font-code);
		font-size: 0.75rem;
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}

	.gauge {
		white-space: nowrap;
	}

	.gauge.is-over {
		color: var(--danger);
		font-weight: 700;
	}

	.speed select {
		appearance: none;
		background: var(--chip-bg);
		color: var(--chip-text);
		border: none;
		border-radius: 6px;
		padding: 3px 8px;
		font-family: var(--font-code);
		font-size: 0.75rem;
		font-weight: 700;
		cursor: pointer;
	}
</style>
