<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import Plus from '@lucide/svelte/icons/plus';
	import X from '@lucide/svelte/icons/x';
	import { MAX_VARIANTS } from '$lib/game/level';

	/** How a variant fared in the last run: solved, or not. */
	export type VariantOutcome = 'pass' | 'fail';

	interface Props {
		count: number;
		/** The variant on screen. */
		active: number;
		/** One per variant; `null` where there is nothing to show (yet). */
		results?: (VariantOutcome | null)[];
		/** The results belong to code that has since changed: shown, but faded. */
		stale?: boolean;
		onselect: (index: number) => void;
		/** The designer's "+": add a variant. Left out, there is none. */
		onadd?: () => void;
		/** The designer's "×", shown on the chip under the pointer. Left out, there is none. */
		ondelete?: (index: number) => void;
	}

	let { count, active, results = [], stale = false, onselect, onadd, ondelete }: Props = $props();

	const indices = $derived(Array.from({ length: count }, (_, index) => index));

	function label(index: number): string {
		const result = results[index] ?? null;
		const outcome = result === 'pass' ? ', gelöst' : result === 'fail' ? ', nicht gelöst' : '';
		return `Variante ${index + 1}${outcome}`;
	}
</script>

<!--
	A world's variants as numbered chips in its top-right corner — the player
	shows how the last run went on each, the designer adds and removes them.
	A level with a single variant shows nothing in the player: there is nothing
	to choose between.
-->
{#if count > 1 || onadd}
	<div class="variants" role="group" aria-label="Varianten">
		{#if onadd}
			<button
				class="chip add"
				type="button"
				title={count >= MAX_VARIANTS ? `Höchstens ${MAX_VARIANTS} Varianten` : 'Variante hinzufügen'}
				aria-label="Variante hinzufügen"
				disabled={count >= MAX_VARIANTS}
				onclick={onadd}
			>
				<Plus size={16} strokeWidth={2.5} />
			</button>
		{/if}

		{#each indices as index (index)}
			{@const result = results[index] ?? null}
			<div class="slot">
				<button
					class="chip"
					class:is-active={index === active}
					type="button"
					aria-pressed={index === active}
					aria-label={label(index)}
					title={label(index)}
					onclick={() => onselect(index)}
				>
					{index + 1}
					{#if result}
						<span
							class="mark"
							class:is-pass={result === 'pass'}
							class:is-fail={result === 'fail'}
							class:is-stale={stale}
							aria-hidden="true"
						>
							{#if result === 'pass'}
								<Check size={10} strokeWidth={3.5} />
							{:else}
								<X size={10} strokeWidth={3.5} />
							{/if}
						</span>
					{/if}
				</button>

				{#if ondelete && count > 1}
					<button
						class="delete"
						type="button"
						title="Variante {index + 1} löschen"
						aria-label="Variante {index + 1} löschen"
						onclick={() => ondelete(index)}
					>
						<X size={10} strokeWidth={3} />
					</button>
				{/if}
			</div>
		{/each}
	</div>
{/if}

<style>
	/*
		A column down the right edge of the world, wrapping into a second one
		leftwards if the world is too short for nine. Clear of the designer's
		options sheet, which floats top-left.
	*/
	.variants {
		position: absolute;
		top: 12px;
		right: 12px;
		z-index: 1;
		max-height: calc(100% - 24px);
		display: flex;
		flex-direction: column;
		flex-wrap: wrap-reverse;
		align-content: flex-start;
		gap: 6px;
	}

	.slot {
		position: relative;
	}

	.chip {
		position: relative;
		width: 30px;
		height: 30px;
		display: grid;
		place-items: center;
		padding: 0;
		border: 1px solid var(--panel-border);
		border-radius: 8px;
		background: var(--panel);
		box-shadow: var(--panel-shadow);
		color: var(--text-muted);
		font-family: var(--font-ui);
		font-size: 0.8125rem;
		font-weight: 800;
		cursor: pointer;
		transition: background 120ms ease, color 120ms ease;
	}

	.chip:hover {
		color: var(--text);
	}

	.chip.is-active {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--btn-primary-text);
	}

	.chip.add {
		color: var(--accent);
	}

	.chip.add:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.chip:focus-visible,
	.delete:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	/* The last run's outcome, pinned to the chip's corner. */
	.mark {
		position: absolute;
		right: -5px;
		bottom: -5px;
		width: 15px;
		height: 15px;
		display: grid;
		place-items: center;
		border: 2px solid var(--panel);
		border-radius: 50%;
		color: #fff;
	}

	.mark.is-pass {
		background: var(--success);
	}

	.mark.is-fail {
		background: var(--danger);
	}

	.mark.is-stale {
		background: var(--text-faint);
	}

	/* Only on the chip being pointed at (or tabbed to), so a stray click on a
	   chip can never land on it. */
	.delete {
		visibility: hidden;
		position: absolute;
		top: -6px;
		left: -6px;
		width: 16px;
		height: 16px;
		display: grid;
		place-items: center;
		padding: 0;
		border: 2px solid var(--panel);
		border-radius: 50%;
		background: var(--danger);
		color: #fff;
		cursor: pointer;
	}

	.slot:hover .delete,
	.slot:focus-within .delete {
		visibility: visible;
	}
</style>
