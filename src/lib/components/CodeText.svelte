<script lang="ts">
	interface Props {
		/** Plain text in which `backticked` spans are code — how rule labels mark it. */
		text: string;
	}

	let { text }: Props = $props();
</script>

{#each text.split('`') as part, index (index)}{#if index % 2 === 1}<code>{part}</code
		>{:else}{part}{/if}{/each}

<style>
	code {
		font-family: var(--font-code);
		font-size: 0.875em;
	}
</style>
