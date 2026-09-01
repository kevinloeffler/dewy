<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	interface Props extends Omit<HTMLInputAttributes, 'class'> {
		label: string;
		hint?: string;
		error?: string;
		value?: string;
	}

	let { label, hint, error, value = $bindable(''), ...rest }: Props = $props();

	// Labels are wired by id so a click on the label focuses the input; falling
	// back to the name keeps callers from having to invent one.
	const id = $derived(rest.id ?? `field-${rest.name ?? label.toLowerCase().replace(/\W+/g, '-')}`);
</script>

<div class="field-wrap">
	<label class="field-label" for={id}>{label}</label>
	<input class="field" {id} bind:value {...rest} aria-invalid={error ? 'true' : undefined} />
	{#if error}
		<p class="field-error">{error}</p>
	{:else if hint}
		<p class="field-hint">{hint}</p>
	{/if}
</div>

<style>
	.field-wrap {
		display: block;
	}
</style>
