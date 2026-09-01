<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		variant?: 'info' | 'warn' | 'danger';
		children: Snippet;
	}

	let { variant = 'info', children }: Props = $props();
</script>

<div class="callout callout-{variant}">
	{@render children()}
</div>
