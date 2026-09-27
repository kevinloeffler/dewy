<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		variant?: 'primary' | 'ghost';
		disabled?: boolean;
		type?: 'button' | 'submit' | 'reset';
		onclick?: (e: MouseEvent) => void;
		icon?: Snippet;
		children?: Snippet;
	}

	let { variant = 'primary', disabled = false, type = 'button', onclick, icon, children }: Props = $props();
</script>

<button class="btn btn-{variant}" {type} {disabled} {onclick}>
	{#if icon}
		<span class="btn-icon">{@render icon()}</span>
	{/if}
	{#if children}
		{@render children()}
	{/if}
</button>

<style>
	/* A fixed square, matching the `.btn` line height, so an icon's own size
	   never decides how tall the button is. */
	.btn-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 1rem;
		height: 1rem;
	}
</style>
