<script lang="ts">
	import { Button } from '$lib/components/index.js';

	interface Props {
		running: boolean;
		/** Commands run so far, i.e. energy spent. */
		steps: number;
		/** `LevelOptions.energy` — the battery, in commands. `null` = unlimited. */
		energy: number | null;
		/** `LevelOptions.memory` — the program cap, in statements. `null` = unlimited. */
		memory: number | null;
		/** Statements in the current program, or `null` while it does not parse. */
		memoryUsed: number | null;
		/** Over the memory cap — Run and Step are refused until it fits. */
		blocked: boolean;
		speed: number;
		onrun: () => void;
		onstep: () => void;
		onstop: () => void;
		onreset: () => void;
	}

	let {
		running,
		steps,
		energy,
		memory,
		memoryUsed,
		blocked,
		speed = $bindable(),
		onrun,
		onstep,
		onstop,
		onreset,
	}: Props = $props();

	const SPEEDS = [0.5, 1, 2, 4];
</script>

<!--
	Icons are inlined rather than loaded from `$lib/assets/icons/*.svg` so they can
	take `currentColor` — the files there hardcode `stroke="black"`, which neither
	follows the theme nor turns red when the memory gauge goes over.
-->
{#snippet speedIcon()}
	<svg
		width="18"
		height="14.4"
		viewBox="0 0 20 16"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		<path d="M10 10.0004L13.6 6.40043" />
		<path
			d="M2.206 14.5004C1.416 13.1322 1.00006 11.5802 1 10.0003C0.99994 8.42047 1.41576 6.86842 2.20566 5.5002C2.99556 4.13197 4.1317 2.99578 5.4999 2.20583C6.8681 1.41588 8.42013 1 10 1C11.5799 1 13.1319 1.41588 14.5001 2.20583C15.8683 2.99578 17.0044 4.13197 17.7943 5.5002C18.5842 6.86842 19.0001 8.42047 19 10.0003C18.9999 11.5802 18.584 13.1322 17.794 14.5004"
		/>
	</svg>
{/snippet}

{#snippet batteryIcon()}
	<svg
		width="12"
		height="17.1"
		viewBox="0 0 14 20"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		<path d="M8 1.5H6" stroke-width="3" />
		<path d="M10 15.5L4 15.5" />
		<path d="M10 12.5L4 12.5" />
		<path d="M10 9.5L4 9.5" />
		<path
			d="M0.999999 4.5L1 16.5C1 17.6046 1.89543 18.5 3 18.5L11 18.5C12.1046 18.5 13 17.6046 13 16.5L13 4.5C13 3.39543 12.1046 2.5 11 2.5L3 2.5C1.89543 2.5 0.999999 3.39543 0.999999 4.5Z"
		/>
	</svg>
{/snippet}

{#snippet memoryIcon()}
	<svg
		width="18"
		height="18"
		viewBox="0 0 20 20"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		<path d="M10 17.2V19" />
		<path d="M10 1V2.8" />
		<path d="M14.5 17.2V19" />
		<path d="M14.5 1V2.8" />
		<path d="M1 10H2.8" />
		<path d="M1 14.5H2.8" />
		<path d="M1 5.5H2.8" />
		<path d="M17.2 10H19" />
		<path d="M17.2 14.5H19" />
		<path d="M17.2 5.5H19" />
		<path d="M5.5 17.2V19" />
		<path d="M5.5 1V2.8" />
		<path
			d="M15.4 2.8H4.59999C3.60588 2.8 2.79999 3.60589 2.79999 4.6V15.4C2.79999 16.3941 3.60588 17.2 4.59999 17.2H15.4C16.3941 17.2 17.2 16.3941 17.2 15.4V4.6C17.2 3.60589 16.3941 2.8 15.4 2.8Z"
		/>
		<path
			d="M12.7 6.4H7.30002C6.80297 6.4 6.40002 6.80295 6.40002 7.3V12.7C6.40002 13.1971 6.80297 13.6 7.30002 13.6H12.7C13.1971 13.6 13.6 13.1971 13.6 12.7V7.3C13.6 6.80295 13.1971 6.4 12.7 6.4Z"
		/>
	</svg>
{/snippet}

<div class="controls">
	<div class="controls-wrapper">
		{#if running}
			<Button onclick={onstop}>
				{#snippet icon()}
					<svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
						<rect x="0.5" y="0.5" width="11" height="11" rx="2" fill="currentColor" />
					</svg>
				{/snippet}
				Stopp
			</Button>
		{:else}
			<Button onclick={onrun} disabled={blocked}>
				{#snippet icon()}
					<svg width="11" height="11.9" viewBox="0 0 12 13" fill="none" aria-hidden="true">
						<path
								d="M6.58919e-08 1.44478C-7.815e-05 1.19064 0.0694786 0.940979 0.201647 0.721007C0.333816 0.501035 0.523917 0.318539 0.752755 0.191946C0.981593 0.0653532 1.24107 -0.000854397 1.50498 8.32463e-06C1.76888 0.000871046 2.02789 0.0687736 2.25583 0.19686L11.2529 5.25064C11.4799 5.37751 11.6684 5.55954 11.7995 5.77855C11.9307 5.99756 11.9998 6.24586 12 6.49866C12.0002 6.75145 11.9316 6.99987 11.8008 7.21909C11.6701 7.43832 11.482 7.62067 11.2551 7.74792L2.25583 12.8031C2.02789 12.9312 1.76888 12.9991 1.50498 13C1.24107 13.0009 0.981593 12.9346 0.752755 12.8081C0.523917 12.6815 0.333816 12.499 0.201647 12.279C0.0694786 12.059 -7.815e-05 11.8094 6.58919e-08 11.5552V1.44478Z"
								fill="currentColor"
						/>
					</svg>
				{/snippet}
				Start
			</Button>
		{/if}

		<Button variant="ghost" onclick={onstep} disabled={blocked}>
			{#snippet icon()}
				<svg
						width="12.5"
						height="11.3"
						viewBox="0 0 14 12.6667"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
				>
					<path d="M13 1V11.6667" />
					<path
							d="M3.01933 1.19001C2.81701 1.06862 2.58609 1.00308 2.35016 1.00011C2.11422 0.997129 1.88172 1.05681 1.6764 1.17307C1.47107 1.28932 1.30028 1.45798 1.18144 1.66182C1.06261 1.86567 0.999998 2.09739 1 2.33335V10.3333C0.999998 10.5693 1.06261 10.801 1.18144 11.0049C1.30028 11.2087 1.47107 11.3774 1.6764 11.4936C1.88172 11.6099 2.11422 11.6696 2.35016 11.6666C2.58609 11.6636 2.81701 11.5981 3.01933 11.4767L9.684 7.47801C9.88185 7.3598 10.0457 7.19233 10.1595 6.99193C10.2733 6.79153 10.3333 6.56505 10.3335 6.33458C10.3337 6.10411 10.2741 5.87752 10.1607 5.67692C10.0472 5.47633 9.88364 5.30857 9.686 5.19001L3.01933 1.19001Z"
					/>
				</svg>
			{/snippet}
			
		</Button>

		<Button variant="ghost" onclick={onreset}>
			{#snippet icon()}
				<svg
						width="14"
						height="14"
						viewBox="0 0 16 16"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
						aria-hidden="true"
				>
					<path
							d="M2 8C2 9.18669 2.35189 10.3467 3.01118 11.3334C3.67047 12.3201 4.60754 13.0892 5.7039 13.5433C6.80026 13.9974 8.00666 14.1162 9.17054 13.8847C10.3344 13.6532 11.4035 13.0818 12.2426 12.2426C13.0818 11.4035 13.6532 10.3344 13.8847 9.17054C14.1162 8.00666 13.9974 6.80026 13.5433 5.7039C13.0892 4.60754 12.3201 3.67047 11.3334 3.01118C10.3467 2.35189 9.18669 2 8 2C6.32263 2.00631 4.71265 2.66082 3.50667 3.82667L2 5.33333"
					/>
					<path d="M2 2V5.33333H5.33333" />
				</svg>
			{/snippet}
		</Button>

		<!-- A new tab, so looking something up never costs the code in the editor. -->
		<a class="btn btn-ghost" href="/docs/language" target="_blank" rel="noopener">Hilfe</a>
	</div>

	<div class="readout">
		<!--
			The select sits invisible on top of the label rather than being restyled:
			a select is as wide as its widest option, so a styled one would reserve
			room for `0.5x` and leave a gap in front of the icon at every other speed.
		-->
		<label class="gauge speed">
			<span class="sr-only">Geschwindigkeit</span>
			<span aria-hidden="true">{speed}x</span>
			<select bind:value={speed}>
				{#each SPEEDS as option (option)}
					<option value={option}>{option}x</option>
				{/each}
			</select>
			{@render speedIcon()}
		</label>

		<span class="gauge" title="Batterie — ein Befehl kostet eins">
			{steps}/{energy ?? '∞'}
			{@render batteryIcon()}
		</span>

		<span
			class="gauge"
			class:is-over={blocked}
			title="Speicher — Anweisungen, die der Roboter fasst"
		>
			{memoryUsed ?? '—'}/{memory ?? '∞'}
			{@render memoryIcon()}
		</span>
	</div>
</div>

<style>
	.controls {
		display: flex;
		align-items: center;
		gap: 4px;
		flex-wrap: wrap;
		justify-content: space-between;
		width: 100%;
	}

	/*
		The design's pills are rounder than the app-wide `.btn`. Overriding here
		rather than in `static/styles.css` keeps the topbar, admin and course
		buttons on the current style until they are redesigned too.
	*/
	.controls :global(.btn) {
		gap: 9px;
		padding: 12px 13px;
		border-radius: 8px;
		font-size: 0.8125rem;
		font-weight: 500;
	}

	.controls-wrapper {
		/*height: 100%;*/
	}

	.readout {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 18px;
		padding: 11px 13px;
		border: 1px solid var(--btn-ghost-border);
		border-radius: 8px;
		/*height: 100%;*/
	}

	.gauge {
		display: flex;
		align-items: center;
		gap: 7px;
		white-space: nowrap;
		font-family: var(--font-code);
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--text);
		font-variant-numeric: tabular-nums;
	}

	.gauge.is-over {
		color: var(--danger);
	}

	.speed {
		position: relative;
		cursor: pointer;
	}

	.speed select {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		opacity: 0;
		cursor: pointer;
	}

	.speed:focus-within {
		outline: 2px solid var(--accent);
		outline-offset: 3px;
		border-radius: 3px;
	}
</style>
