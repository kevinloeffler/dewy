<script lang="ts" module>
	export interface SelectOption {
		value: string;
		label: string;
		/** Second line under the label — a username, a class, a level count. */
		hint?: string;
		disabled?: boolean;
	}

	/** Umlaut-insensitive, so "Muller" finds "Müller" and "Strasse" finds "Straße". */
	function fold(text: string): string {
		return text
			.toLowerCase()
			.replace(/ß/g, 'ss')
			.normalize('NFD')
			.replace(/\p{Diacritic}/gu, '');
	}
</script>

<script lang="ts" generics="V extends string | string[]">
	import { tick } from 'svelte';
	import Check from '@lucide/svelte/icons/check';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Search from '@lucide/svelte/icons/search';
	import X from '@lucide/svelte/icons/x';

	interface Props {
		options: SelectOption[];
		/** A `string` for the single variant, a `string[]` when `multiple`. */
		value?: V;
		/** Turns the checkmark list into a checkbox list and keeps the menu open. */
		multiple?: boolean;
		label?: string;
		/**
		 * Submits inside a plain `<form>`: one hidden input per selected value,
		 * so `formData.get(name)` / `.getAll(name)` works as with a native select.
		 */
		name?: string;
		placeholder?: string;
		searchPlaceholder?: string;
		emptyText?: string;
		hint?: string;
		error?: string;
		disabled?: boolean;
		searchable?: boolean;
		/** Offer the × that empties the selection. */
		clearable?: boolean;
		/** Selected labels shown in the trigger before it collapses to "+N". */
		maxChips?: number;
		onchange?: (value: V) => void;
	}

	let {
		options,
		value = $bindable(),
		multiple = false,
		label,
		name,
		placeholder = 'Auswählen …',
		searchPlaceholder = 'Suchen …',
		emptyText = 'Keine Treffer',
		hint,
		error,
		disabled = false,
		searchable = true,
		clearable = false,
		maxChips = 3,
		onchange
	}: Props = $props();

	let open = $state(false);
	let query = $state('');
	// Index into `matches`, not into `options` — the search reorders what is reachable.
	let active = $state(0);
	let dropUp = $state(false);

	let rootEl = $state<HTMLDivElement>();
	let triggerEl = $state<HTMLButtonElement>();
	let searchEl = $state<HTMLInputElement>();
	let listEl = $state<HTMLDivElement>();

	const uid = $props.id();
	const listId = `${uid}-list`;
	const labelId = `${uid}-label`;
	const errorId = `${uid}-error`;

	// One shape for both variants: everything below reads the array and only
	// `commit` knows whether the caller wanted a string back.
	const selected = $derived.by((): string[] => {
		if (value == null) return [];
		if (Array.isArray(value)) return value;
		return value === '' ? [] : [value];
	});
	const selectedOptions = $derived(options.filter((o) => selected.includes(o.value)));
	const matches = $derived.by(() => {
		const q = fold(query.trim());
		if (!q) return options;
		return options.filter((o) => fold(`${o.label} ${o.hint ?? ''}`).includes(q));
	});

	function commit(next: string[]) {
		value = (multiple ? next : (next[0] ?? '')) as V;
		onchange?.(value as V);
	}

	function toggle(option: SelectOption) {
		if (option.disabled) return;
		if (multiple) {
			commit(
				selected.includes(option.value)
					? selected.filter((v) => v !== option.value)
					: [...selected, option.value]
			);
			searchEl?.focus();
		} else {
			commit([option.value]);
			closeMenu();
		}
	}

	function clear(event: MouseEvent) {
		event.stopPropagation();
		commit([]);
	}

	async function openMenu() {
		if (disabled || open) return;
		query = '';
		// Flip upwards when the menu would hang off the viewport — dialogs and
		// table rows near the fold are where this component mostly lives.
		const rect = triggerEl?.getBoundingClientRect();
		dropUp = !!rect && window.innerHeight - rect.bottom < 280 && rect.top > 280;
		open = true;
		const start = matches.findIndex((o) => selected.includes(o.value));
		active = start === -1 ? 0 : start;
		await tick();
		(searchable ? searchEl : listEl)?.focus();
	}

	function closeMenu(refocus = true) {
		if (!open) return;
		open = false;
		query = '';
		if (refocus) triggerEl?.focus();
	}

	function move(delta: number) {
		if (matches.length === 0) return;
		let next = active;
		for (let i = 0; i < matches.length; i++) {
			next = (next + delta + matches.length) % matches.length;
			if (!matches[next].disabled) break;
		}
		active = next;
	}

	function onMenuKeydown(event: KeyboardEvent) {
		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				move(1);
				break;
			case 'ArrowUp':
				event.preventDefault();
				move(-1);
				break;
			case 'Home':
				event.preventDefault();
				active = 0;
				break;
			case 'End':
				event.preventDefault();
				active = matches.length - 1;
				break;
			case 'Enter':
				event.preventDefault();
				if (matches[active]) toggle(matches[active]);
				break;
			case 'Escape':
				event.preventDefault();
				closeMenu();
				break;
			case 'Tab':
				closeMenu(false);
				break;
			case 'Backspace':
				// Empty search box: peel off the last chip, the way a token field does.
				if (multiple && query === '' && selected.length > 0) commit(selected.slice(0, -1));
				break;
		}
	}

	function onTriggerKeydown(event: KeyboardEvent) {
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			openMenu();
		}
	}

	// Keep the highlighted row in view while arrowing through a long class list.
	$effect(() => {
		if (!open) return;
		active;
		listEl?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
	});

	$effect(() => {
		if (disabled && open) closeMenu(false);
	});
</script>

<svelte:document
	onpointerdown={(event) => {
		if (open && rootEl && !rootEl.contains(event.target as Node)) closeMenu(false);
	}}
/>

<div class="select" bind:this={rootEl}>
	{#if label}
		<span class="field-label" id={labelId}>{label}</span>
	{/if}

	<button
		bind:this={triggerEl}
		type="button"
		class="field select-trigger"
		class:is-open={open}
		class:has-error={!!error}
		{disabled}
		aria-haspopup="listbox"
		aria-expanded={open}
		aria-controls={open ? listId : undefined}
		aria-labelledby={label ? labelId : undefined}
		aria-describedby={error ? errorId : undefined}
		onclick={() => (open ? closeMenu(false) : openMenu())}
		onkeydown={onTriggerKeydown}
	>
		<span class="select-value">
			{#if selected.length === 0}
				<span class="select-placeholder">{placeholder}</span>
			{:else if multiple}
				{#each selectedOptions.slice(0, maxChips) as option (option.value)}
					<span class="select-chip">{option.label}</span>
				{/each}
				{#if selectedOptions.length > maxChips}
					<span class="select-chip select-chip-more">+{selectedOptions.length - maxChips}</span>
				{/if}
			{:else}
				{selectedOptions[0]?.label ?? selected[0]}
			{/if}
		</span>
		{#if clearable && selected.length > 0 && !disabled}
			<!-- svelte-ignore node_invalid_placement_ssr -->
			<span
				class="select-clear"
				role="button"
				tabindex="-1"
				aria-label="Auswahl löschen"
				onclick={clear}
				onkeydown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') clear(event as unknown as MouseEvent);
				}}
			>
				<X size={14} />
			</span>
		{/if}
		<ChevronDown class="select-caret" size={16} />
	</button>

	{#if open}
		<div class="select-menu" class:up={dropUp}>
			{#if searchable}
				<div class="select-search">
					<Search size={14} />
					<input
						bind:this={searchEl}
						class="select-search-input"
						type="text"
						autocomplete="off"
						spellcheck="false"
						placeholder={searchPlaceholder}
						role="combobox"
						aria-expanded="true"
						aria-controls={listId}
						aria-autocomplete="list"
						aria-activedescendant={matches[active] ? `${listId}-${active}` : undefined}
						bind:value={query}
						oninput={() => (active = 0)}
						onkeydown={onMenuKeydown}
					/>
				</div>
			{/if}

			<div
				bind:this={listEl}
				class="select-list"
				id={listId}
				role="listbox"
				aria-multiselectable={multiple}
				aria-labelledby={label ? labelId : undefined}
				tabindex={searchable ? -1 : 0}
				onkeydown={searchable ? undefined : onMenuKeydown}
			>
				{#each matches as option, index (option.value)}
					{@const isSelected = selected.includes(option.value)}
					<button
						type="button"
						class="select-option"
						id="{listId}-{index}"
						role="option"
						tabindex="-1"
						disabled={option.disabled}
						aria-selected={isSelected}
						data-active={index === active}
						onmousedown={(event) => event.preventDefault()}
						onclick={() => toggle(option)}
						onmousemove={() => (active = index)}
					>
						<span class="select-mark" class:box={multiple} class:on={isSelected}>
							{#if isSelected}<Check size={12} strokeWidth={3} />{/if}
						</span>
						<span class="select-option-text">
							<span class="select-option-label">{option.label}</span>
							{#if option.hint}
								<span class="select-option-hint">{option.hint}</span>
							{/if}
						</span>
					</button>
				{:else}
					<p class="select-empty">{emptyText}</p>
				{/each}
			</div>

			{#if multiple && selected.length > 0}
				<div class="select-foot">
					<span>{selected.length} ausgewählt</span>
					<button type="button" class="select-reset" onclick={() => commit([])}>
						Zurücksetzen
					</button>
				</div>
			{/if}
		</div>
	{/if}

	{#if name}
		<!-- A native single select posts an empty value when nothing is picked; a
		     native multiple posts nothing at all. Mirror both so server actions
		     that already read this field keep working unchanged. -->
		{#if selected.length === 0}
			{#if !multiple}<input type="hidden" {name} value="" />{/if}
		{:else}
			{#each selected as v (v)}
				<input type="hidden" {name} value={v} />
			{/each}
		{/if}
	{/if}

	{#if error}
		<p class="field-error" id={errorId}>{error}</p>
	{:else if hint}
		<p class="field-hint">{hint}</p>
	{/if}
</div>

<style>
	.select {
		position: relative;
	}

	.select-trigger {
		display: flex;
		align-items: center;
		gap: 6px;
		min-height: 38px;
		padding-right: 8px;
		text-align: left;
		cursor: pointer;
	}

	.select-trigger.has-error {
		border-color: var(--danger);
	}

	.select-trigger.is-open {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}

	.select-value {
		flex: 1;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 4px;
		min-width: 0;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.select-placeholder {
		color: var(--text-faint);
	}

	.select-chip {
		background: var(--chip-bg);
		color: var(--chip-text);
		font-size: 0.75rem;
		font-weight: 600;
		padding: 2px 7px;
		border-radius: 6px;
		max-width: 14ch;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.select-chip-more {
		color: var(--text-muted);
	}

	.select-clear,
	:global(.select-caret) {
		flex: none;
		color: var(--text-faint);
	}

	.select-clear {
		display: inline-flex;
		padding: 2px;
		border-radius: 5px;
		cursor: pointer;
	}

	.select-clear:hover {
		background: var(--chip-bg);
		color: var(--text);
	}

	.select-menu {
		position: absolute;
		z-index: 40;
		top: calc(100% + 4px);
		left: 0;
		right: 0;
		display: flex;
		flex-direction: column;
		min-width: 100%;
		background: var(--panel);
		border: 1px solid var(--panel-border);
		border-radius: calc(var(--radius) - 6px);
		box-shadow: var(--panel-shadow);
		overflow: hidden;
	}

	.select-menu.up {
		top: auto;
		bottom: calc(100% + 4px);
	}

	.select-search {
		display: flex;
		align-items: center;
		gap: 7px;
		padding: 8px 10px;
		border-bottom: 1px solid var(--panel-border);
		color: var(--text-faint);
	}

	.select-search-input {
		flex: 1;
		font: inherit;
		font-family: var(--font-ui);
		color: var(--text);
		background: none;
		border: 0;
		padding: 0;
		min-width: 0;
	}

	.select-search-input:focus {
		outline: none;
	}

	.select-list {
		max-height: 240px;
		overflow-y: auto;
		padding: 4px;
	}

	.select-list:focus-visible {
		outline: none;
	}

	.select-option {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		width: 100%;
		padding: 7px 8px;
		font: inherit;
		font-family: var(--font-ui);
		font-size: 0.875rem;
		color: var(--text);
		text-align: left;
		background: none;
		border: 0;
		border-radius: 7px;
		cursor: pointer;
	}

	.select-option[data-active='true'] {
		background: var(--chip-bg);
	}

	.select-option:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.select-mark {
		display: flex;
		align-items: center;
		justify-content: center;
		flex: none;
		width: 15px;
		height: 15px;
		margin-top: 2px;
		color: var(--accent);
	}

	/* The single variant marks its one choice with a bare tick; the multiple
	   variant needs a box, so an empty row still reads as "not chosen". */
	.select-mark.box {
		border: 1px solid var(--panel-border);
		border-radius: 4px;
	}

	.select-mark.box.on {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--btn-primary-text);
	}

	.select-option-text {
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
	}

	.select-option-label {
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.select-option[aria-selected='true'] .select-option-label {
		font-weight: 700;
	}

	.select-option-hint {
		font-size: 0.75rem;
		color: var(--text-faint);
	}

	.select-empty {
		margin: 0;
		padding: 14px 10px;
		font-size: 0.8125rem;
		color: var(--text-faint);
		text-align: center;
	}

	.select-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 7px 10px;
		border-top: 1px solid var(--panel-border);
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.select-reset {
		font: inherit;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--text-muted);
		background: none;
		border: 0;
		padding: 2px 4px;
		border-radius: 5px;
		cursor: pointer;
	}

	.select-reset:hover {
		background: var(--chip-bg);
		color: var(--text);
	}
</style>
