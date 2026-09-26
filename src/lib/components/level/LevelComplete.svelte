<script lang="ts">
	interface Props {
		open?: boolean;
		steps: number;
		/**
		 * Where "Weiter" goes. Left out for a standalone level, which has nowhere
		 * to go on to — the sheet then only offers to close.
		 */
		next?: {
			href: string;
			label: string;
			/**
			 * The next item is still locked because this completion has not been
			 * recorded yet. Following the link now would land on a locked item, so
			 * the button waits until the round trip settles.
			 */
			pending?: boolean;
		};
	}

	let { open = $bindable(false), steps, next }: Props = $props();

	let dialog = $state<HTMLDialogElement | undefined>();

	// `showModal()` for the focus trap, Escape and top-layer stacking — the same
	// reason `Modal` drives the method rather than the attribute.
	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		if (!open && dialog.open) dialog.close();
	});

	/** A click on the backdrop lands on the dialog itself, not its contents. */
	function onclick(event: MouseEvent) {
		if (event.target === dialog) open = false;
	}
</script>

<dialog
	bind:this={dialog}
	class="sheet"
	aria-labelledby="level-complete-title"
	onclose={() => (open = false)}
	{onclick}
>
	<div class="sheet-body">
		<span class="badge" aria-hidden="true">★</span>
		<h2 id="level-complete-title" class="title">Level geschafft!</h2>
		<p class="summary">
			Dewy hat es in <strong>{steps} {steps === 1 ? 'Schritt' : 'Schritten'}</strong> geschafft.
		</p>

		<div class="actions">
			<button class="btn btn-ghost" type="button" onclick={() => (open = false)}>
				Level nochmals ansehen
			</button>
			{#if next}
				{#if next.pending}
					<span class="btn btn-primary is-pending" aria-disabled="true">Speichern…</span>
				{:else}
					<!-- svelte-ignore a11y_autofocus -->
					<a class="btn btn-primary" href={next.href} autofocus>{next.label}</a>
				{/if}
			{/if}
		</div>
	</div>
</dialog>

<style>
	.sheet {
		width: min(420px, calc(100vw - 32px));
		padding: 0;
		border: 1px solid var(--panel-border);
		border-radius: var(--radius);
		background: var(--panel);
		color: var(--text);
		box-shadow: var(--panel-shadow);
	}

	.sheet[open] {
		animation: rise 260ms cubic-bezier(0.2, 0.9, 0.3, 1.2);
	}

	.sheet::backdrop {
		background: rgba(0, 0, 0, 0.32);
	}

	.sheet-body {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		padding: 32px 28px 24px;
		text-align: center;
	}

	.badge {
		display: grid;
		place-items: center;
		width: 64px;
		height: 64px;
		margin-bottom: 6px;
		border-radius: 50%;
		background: var(--accent-soft);
		color: var(--success);
		font-size: 2rem;
		line-height: 1;
	}

	.title {
		margin: 0;
		font-family: var(--font-display);
		font-weight: var(--font-display-wt);
		font-size: 1.75rem;
	}

	.summary {
		margin: 0;
		color: var(--text-muted);
	}

	.summary strong {
		color: var(--text);
	}

	.actions {
		display: flex;
		justify-content: center;
		gap: 10px;
		width: 100%;
		margin-top: 16px;
	}

	.actions .btn {
		flex: 1;
		justify-content: center;
	}

	.btn.is-pending {
		opacity: 0.6;
		cursor: progress;
	}

	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(12px) scale(0.96);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.sheet[open] {
			animation: none;
		}
	}
</style>
