<script lang="ts">
	interface Props {
		checked?: boolean;
		indeterminate?: boolean;
		name?: string;
		value?: string;
		disabled?: boolean;
		/** Screen-reader name for a checkbox in a table cell, which has no visible label. */
		label?: string;
		onchange?: (event: Event) => void;
	}

	let {
		checked = $bindable(false),
		indeterminate = false,
		name,
		value,
		disabled = false,
		label,
		onchange
	}: Props = $props();
</script>

<input
	class="checkbox"
	type="checkbox"
	bind:checked
	{indeterminate}
	{name}
	{value}
	{disabled}
	{onchange}
	aria-label={label}
/>

<style>
	.checkbox {
		accent-color: var(--accent);
		width: 15px;
		height: 15px;
		cursor: pointer;
		margin: 0;
		display: block;
	}

	.checkbox:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}

	.checkbox:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
</style>
