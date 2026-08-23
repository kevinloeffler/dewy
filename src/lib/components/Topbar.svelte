<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		left?: Snippet;
		center?: Snippet;
		right?: Snippet;
	}

	let { left, center, right }: Props = $props();
</script>

<header class="topbar">
	{#if left}
		<div class="topbar-left">
			{@render left()}
		</div>
	{/if}

	{#if center}
		<div class="topbar-center">
			{@render center()}
		</div>
	{/if}

	{#if right}
		<div class="topbar-right">
			{@render right()}
		</div>
	{/if}
</header>

<style>
	.topbar-left {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.topbar-center {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.topbar-right {
		display: flex;
		align-items: center;
		gap: 14px;
		margin-left: auto;
	}
</style>
