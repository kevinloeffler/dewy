<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		variant?: 'chapter' | 'chip';
		children: Snippet;
	}

	let { variant = 'chip', children }: Props = $props();
</script>

<span class={variant === 'chapter' ? 'badge-chapter' : 'chip'}>
	{@render children()}
</span>
