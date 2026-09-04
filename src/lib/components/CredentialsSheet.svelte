<script lang="ts">
	import Callout from './Callout.svelte';

	export type Credential = {
		name: string;
		password: string;
		username?: string;
		email?: string;
	};

	interface Props {
		credentials: Credential[];
		/** Names the batch on the printout, e.g. the class. */
		heading?: string;
	}

	let { credentials, heading }: Props = $props();

	const csv = $derived(
		[
			'Name,Benutzername,Passwort',
			...credentials.map((row) =>
				[row.name, row.username ?? row.email ?? '', row.password]
					// Quote every field: names contain commas often enough.
					.map((value) => `"${value.replaceAll('"', '""')}"`)
					.join(',')
			)
		].join('\n')
	);

	let copied = $state(false);

	async function copy() {
		await navigator.clipboard.writeText(csv);
		copied = true;
		setTimeout(() => (copied = false), 2000);
	}
</script>

<section class="sheet">
	<div class="sheet-head">
		<div>
			<h2 class="sheet-title">{heading ?? 'Anmeldedaten'}</h2>
			<p class="sheet-sub">
				{credentials.length}
				{credentials.length === 1 ? 'Konto' : 'Konten'}
			</p>
		</div>
		<div class="sheet-tools">
			<button class="btn btn-ghost" type="button" onclick={copy}>
				{copied ? 'Kopiert' : 'Als CSV kopieren'}
			</button>
			<button class="btn btn-primary" type="button" onclick={() => window.print()}>Drucken</button>
		</div>
	</div>

	<Callout variant="warn">
		<strong>Diese Passwörter werden nur dieses eine Mal angezeigt.</strong> Sie werden gehasht
		gespeichert, niemand — auch du nicht — kann sie später nochmals lesen. Druck oder kopier die
		Liste jetzt; geht sie verloren, setz stattdessen ein neues Passwort.
	</Callout>

	<div class="table-wrap">
		<table class="table">
			<thead>
				<tr>
					<th>Name</th>
					<th>Benutzername</th>
					<th>Passwort</th>
				</tr>
			</thead>
			<tbody>
				{#each credentials as row (row.name + row.password)}
					<tr>
						<td>{row.name}</td>
						<td class="mono">{row.username ?? row.email ?? '—'}</td>
						<td class="mono">{row.password}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</section>

<style>
	.sheet {
		border: 1px solid var(--panel-border);
		border-radius: var(--radius);
		background: var(--panel);
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.sheet-head {
		display: flex;
		align-items: flex-start;
		gap: 16px;
	}

	.sheet-title {
		margin: 0;
		font-size: 1rem;
	}

	.sheet-sub {
		margin: 2px 0 0;
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	.sheet-tools {
		display: flex;
		gap: 8px;
		margin-left: auto;
	}

	.table-wrap {
		overflow-x: auto;
	}

	.mono {
		font-family: var(--font-code);
		font-size: 0.8125rem;
	}

	/* On paper the sheet is the only thing that matters — the app chrome and
	   the buttons that produced it are noise a teacher would have to cut off. */
	@media print {
		.sheet {
			border: 0;
			padding: 0;
		}

		.sheet-tools {
			display: none;
		}

		:global(body *) {
			visibility: hidden;
		}

		.sheet,
		.sheet :global(*) {
			visibility: visible;
		}

		.sheet {
			position: absolute;
			inset: 0;
		}
	}
</style>
