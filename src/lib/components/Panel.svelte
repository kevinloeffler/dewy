<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		padding?: 'none' | 'sm' | 'md' | 'lg';
		class?: string;
		children: Snippet;
	}

	const pad = { none: '0', sm: '12px', md: '20px', lg: '28px' };

	let { padding = 'md', class: cls = '', children }: Props = $props();
</script>

<div class="panel {cls}" style="padding: {pad[padding]}">
	{@render children()}
</div>
