<script lang="ts">
	import CodeXml from '@lucide/svelte/icons/code-xml';
	import Gauge from '@lucide/svelte/icons/gauge';
	import Play from '@lucide/svelte/icons/play';
	import { Panel, RobotPortrait, Topbar } from '$lib/components/index.js';
</script>

<svelte:head>
	<title>Dewy · Programmieren lernen mit einem Roboter</title>
	<meta
		name="description"
		content="Dewy ist ein Lernspiel: Schülerinnen und Schüler steuern einen Roboter mit JavaScript durch eine 3D-Welt."
	/>
</svelte:head>

<Topbar size="large">
	{#snippet right()}
		<a class="btn btn-ghost" href="/login">Anmelden</a>
	{/snippet}
</Topbar>

<main class="page">
	<section class="hero">
		<div class="hero-robot">
			<RobotPortrait />
		</div>

		<div class="hero-text">
			<h1 class="title">Programmieren lernen mit Dewy</h1>
			<p class="lede">
				Dewy ist ein kleiner Lagerroboter, der nur tut, was du ihm sagst. Schreib JavaScript, um ihn
				durch eine 3D-Welt zu steuern, Kisten zu tragen und Rätsel zu lösen — Level für Level.
			</p>
			<a class="btn btn-primary btn-cta" href="/login">Anmelden</a>
			<p class="hint">Dein Konto bekommst du von deiner Lehrperson.</p>
		</div>
	</section>

	<ul class="points">
		<li>
			<Panel class="point">
				<span class="point-icon" aria-hidden="true"><CodeXml size={20} /></span>
				<h2 class="point-title">Code schreiben</h2>
				<p class="point-text">Echte JavaScript-Befehle statt Blöcke — Schritt für Schritt eingeführt.</p>
			</Panel>
		</li>
		<li>
			<Panel class="point">
				<span class="point-icon" aria-hidden="true"><Play size={20} /></span>
				<h2 class="point-title">Zusehen, was passiert</h2>
				<p class="point-text">Dewy führt deinen Code aus — du siehst sofort, was jeder Befehl bewirkt.</p>
			</Panel>
		</li>
		<li>
			<Panel class="point">
				<span class="point-icon" aria-hidden="true"><Gauge size={20} /></span>
				<h2 class="point-title">Im eigenen Tempo</h2>
				<p class="point-text">Deine Lehrperson stellt die Kurse zusammen, dein Fortschritt wird gespeichert.</p>
			</Panel>
		</li>
	</ul>
</main>

<style>
	.page {
		max-width: 960px;
		margin: 0 auto;
		padding: 24px 24px 64px;
		display: flex;
		flex-direction: column;
		gap: 40px;
	}

	.hero {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
		align-items: center;
		gap: 32px;
	}

	.hero-robot {
		aspect-ratio: 1;
		width: 100%;
		max-width: 420px;
		justify-self: center;
		border-radius: 50%;
		background: radial-gradient(circle at 50% 60%, var(--accent-soft), transparent 70%);
	}

	.title {
		font-family: var(--font-display);
		font-weight: var(--font-display-wt);
		font-size: clamp(2rem, 4.5vw, 2.75rem);
		line-height: 1.1;
		letter-spacing: -0.5px;
		margin: 0 0 16px;
	}

	.lede {
		margin: 0 0 28px;
		font-size: 1.0625rem;
		line-height: 1.6;
		color: var(--text-muted);
	}

	.btn-cta {
		padding: 14px 32px;
		font-size: 1rem;
		line-height: 1.25rem;
	}

	.hint {
		margin: 12px 0 0;
		font-size: 0.8125rem;
		color: var(--text-faint);
	}

	.points {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 16px;
	}

	.points > li {
		display: flex;
	}

	/* Stretch every card to the row's tallest, so the three read as a set, and
	   push the text to the bottom: whatever height a card gains goes between
	   its icon and its text. */
	.points :global(.point) {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
	}

	.point-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		margin-bottom: 20px;
		border-radius: calc(var(--radius) - 4px);
		background: var(--accent-soft);
		color: var(--chip-text);
	}

	.point-title {
		font-family: var(--font-display);
		font-weight: var(--font-display-wt);
		font-size: 1rem;
		margin: auto 0 6px;
	}

	.point-text {
		margin: 0;
		font-size: 0.875rem;
		line-height: 1.5;
		color: var(--text-muted);
	}

	@media (max-width: 720px) {
		.hero {
			grid-template-columns: 1fr;
			text-align: center;
			gap: 8px;
		}

		.hero-robot {
			max-width: 280px;
		}

		.points {
			grid-template-columns: 1fr;
		}
	}
</style>
