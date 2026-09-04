<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		open?: boolean;
		title: string;
		children: Snippet;
		/** Buttons for the footer. Left out entirely if the body carries its own form. */
		actions?: Snippet;
		/**
		 * Called whenever the dialog closes, Escape and the backdrop included.
		 * For callers whose `open` is derived from something richer than a
		 * boolean — "which stage am I adding to" — and so cannot be bound.
		 */
		onclose?: () => void;
	}

	let { open = $bindable(false), title, children, actions, onclose }: Props = $props();

	function close() {
		open = false;
		onclose?.();
	}

	let dialog = $state<HTMLDialogElement | undefined>();

	// `showModal()` is what gives the native focus trap, the Escape key and the
	// top-layer stacking — so `open` drives the method rather than the attribute.
	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		if (!open && dialog.open) dialog.close();
	});
</script>

<dialog bind:this={dialog} class="modal" onclose={close}>
	<div class="modal-head">
		<h2 class="modal-title">{title}</h2>
		<!-- Setting `open` routes through `dialog.close()`, so `onclose` fires once
		     whichever way the dialog was dismissed. -->
		<button class="modal-close" type="button" aria-label="Schliessen" onclick={() => (open = false)}>
			×
		</button>
	</div>

	<div class="modal-body">
		{@render children()}
	</div>

	{#if actions}
		<div class="modal-actions">
			{@render actions()}
		</div>
	{/if}
</dialog>

<style>
	.modal {
		width: min(480px, calc(100vw - 32px));
		padding: 0;
		border: 1px solid var(--panel-border);
		border-radius: var(--radius);
		background: var(--panel);
		color: var(--text);
		box-shadow: var(--panel-shadow);
	}

	.modal::backdrop {
		background: rgba(0, 0, 0, 0.32);
	}

	.modal-head {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 18px 20px 0;
	}

	.modal-title {
		margin: 0;
		font-size: 1rem;
		flex: 1;
	}

	.modal-close {
		font: inherit;
		font-size: 1.25rem;
		line-height: 1;
		color: var(--text-muted);
		background: none;
		border: 0;
		cursor: pointer;
		padding: 2px 6px;
		border-radius: 6px;
	}

	.modal-close:hover {
		background: var(--chip-bg);
		color: var(--text);
	}

	.modal-body {
		padding: 14px 20px 20px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		padding: 0 20px 20px;
	}
</style>
