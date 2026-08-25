<script lang="ts">
	import { onMount, untrack, type Snippet } from 'svelte';
	import { browser } from '$app/environment';
	import { World } from '$lib/game/world';
	import { createWorldState } from '$lib/game/worldState.svelte';
	import { GameEngine } from '$lib/game/engine';
	import { createRobotApi, type RobotApi } from '$lib/game/robot-api';
	import { measureMemory, runScript, type RunResult } from '$lib/game/script';
	import type { GoalCondition, LanguageStage, Level } from '$lib/game/level';
	import {
		Badge,
		CodeMirrorEditor,
		Console,
		GemCounter,
		Kbd,
		Progress,
		Topbar,
		type LogEntry,
	} from '$lib/components/index.js';
	import RunControls from './RunControls.svelte';

	interface Props {
		level: Level;
		/** Defaults to a key derived from the level id. */
		storageKey?: string;
		/** Fires on every transition into a completed run. */
		oncomplete?: (info: { code: string; steps: number }) => void;
		/** Rendered beside the level name — a course breadcrumb, say. */
		titleExtra?: Snippet;
		/** Rendered top-right — prev/next navigation. */
		actions?: Snippet;
	}

	let props: Props = $props();

	// Read once: the engine and the scene are built from these in `onMount`, so
	// swapping levels means a fresh navigation, not a reactive update.
	//
	// That makes this component's identity load-bearing. A route that keeps the
	// same component across a param change — `/courses/[id]/items/[itemId]`
	// stepping to the next item — MUST wrap it in `{#key}`, or the student will
	// navigate to a new item and keep playing the previous level.
	const level = untrack(() => props.level);
	const storageKey = untrack(() => props.storageKey) ?? `dewy:level:${level.id}:code`;

	let canvas: HTMLCanvasElement;
	let world: World | undefined;
	let engine: GameEngine | undefined;
	let robot: RobotApi | undefined;

	const view = createWorldState();

	// The engine owns `LevelState` and is deliberately not reactive — it is
	// read 60×/s by the renderer, where a rune proxy would only cost. The UI
	// mirrors the parts it shows into runes after every action instead.
	let code = $state(loadCode());
	let logs = $state<LogEntry[]>([]);
	let activeLine = $state<number | null>(null);
	let running = $state(false);
	let outcome = $state<RunResult | null>(null);
	let hud = $state({
		x: level.robot.position.x,
		y: level.robot.position.y,
		facing: level.robot.facing as string,
		carrying: null as string | null,
		inventory: [] as string[],
		satisfied: 0,
		steps: 0,
	});

	const goalCount = level.goals.length;

	// Memory is a property of the source, not of the run, so it is measured
	// straight from `code`. Programs are a few dozen statements at most, so
	// re-parsing on every keystroke costs nothing worth saving.
	const memoryUsed = $derived(measureMemory(code, level.options.languageStage));
	const overMemory = $derived(
		level.options.memory !== null && memoryUsed !== null && memoryUsed > level.options.memory
	);

	onMount(() => {
		const instance = new World(canvas, view);
		const game = new GameEngine(level, { energy: level.options.energy });

		world = instance;
		engine = game;
		robot = traced(createRobotApi(game, instance));

		// The engine has already settled its derived state, so snapping the
		// scene from it is enough — no need to animate `initialize()`.
		instance.loadLevel(level, game.state);
		sync();

		return () => instance.destroy();
	});

	$effect(() => {
		localStorage.setItem(storageKey, code);
	});

	// ========================================================
	// Running the student's program
	// ========================================================

	/**
	 * Run pacing. `Step` hands the interpreter exactly one statement at a
	 * time by parking it in `gate`; `Run` opens the gate and leaves it open.
	 */
	let controller: AbortController | null = null;
	let active: Promise<void> | null = null;
	let unlimited = false;
	let starting = false;
	let credits = 0;
	let waiting: (() => void) | null = null;

	function gate(): void | Promise<void> {
		if (unlimited) return;
		if (credits > 0) {
			credits--;
			return;
		}
		return new Promise<void>((resolve) => (waiting = resolve));
	}

	/** Lets a parked run continue. Returns false if it was not parked. */
	function release(): boolean {
		if (!waiting) return false;
		const resume = waiting;
		waiting = null;
		resume();
		return true;
	}

	function run() {
		unlimited = true;
		if (running) {
			release();
			return;
		}
		begin();
	}

	function step() {
		unlimited = false;
		if (running) {
			if (!release()) credits++;
			return;
		}
		credits = 1;
		begin();
	}

	/**
	 * Every run starts from the level as authored. Continuing from wherever
	 * the last run left the robot would make the same program do something
	 * different each time it is pressed, which is the opposite of the point.
	 */
	async function begin() {
		// One gate for Run, Step and Cmd+Enter alike: a program too big for the
		// robot's memory never starts. Typing it is fine — only running is not.
		if (overMemory) {
			log(
				'err',
				`✗ Out of memory — ${memoryUsed} statements, the robot holds ${level.options.memory}.`
			);
			return;
		}

		// `running` only goes up once `execute` is under way, and the reset
		// below yields before that — so a second click needs its own guard.
		if (!engine || !robot || running || starting) return;
		starting = true;

		try {
			const state = engine.state;
			if (state.steps > 0 || state.failed || state.completed) await reset();
		} finally {
			starting = false;
		}

		active = execute();
	}

	function stop() {
		controller?.abort();
		release();
	}

	async function reset() {
		if (active) {
			stop();
			await active;
		}
		if (!engine || !world) return;

		engine.reset();
		world.reset(engine.state);
		logs = [];
		activeLine = null;
		outcome = null;
		sync();
	}

	async function execute() {
		if (!robot) return;

		controller = new AbortController();
		running = true;
		outcome = null;
		log('info', '› Running…');

		const result = await runScript(code, {
			api: robot,
			stage: level.options.languageStage,
			signal: controller.signal,
			onLine: (line) => (activeLine = line),
			onStatement: gate,
		});

		running = false;
		unlimited = false;
		credits = 0;
		waiting = null;
		controller = null;
		active = null;

		sync();
		report(result);
		outcome = result;
	}

	/** Turns a finished run into console output and a resting line marker. */
	function report(result: RunResult) {
		switch (result.status) {
			case 'finished':
				log('info', '› Program finished.');
				break;
			case 'complete':
				log('ok', '★ Level complete!');
				// Fires on every completion, not once per mount: recording it is
				// idempotent, and a student who resets and solves it again should
				// not silently stop counting.
				props.oncomplete?.({ code, steps: engine?.state.steps ?? 0 });
				break;
			case 'cancelled':
				log('warn', '■ Stopped.');
				break;
			case 'crash':
				activeLine = result.line;
				log('err', `✗ Line ${result.line}: ${result.reason.message}`);
				break;
			case 'error':
				activeLine = result.line;
				log('err', `✗ Line ${result.line}: ${result.message}`);
				break;
		}
	}

	/**
	 * Wraps the robot API so every action narrates itself and refreshes the
	 * HUD. The interpreter stays unaware of any of it.
	 */
	function traced(api: RobotApi): RobotApi {
		const actions = ['moveForward', 'turnLeft', 'turnRight', 'pick', 'drop', 'open', 'toggle'] as const;

		const wrapped = { ...api };
		for (const name of actions) {
			wrapped[name] = async () => {
				log('cmd', `${name}()`);
				const before = deliveredCount();
				try {
					await api[name]();
				} finally {
					if (deliveredCount() > before) log('ok', '✓ Crate delivered.');
					sync();
				}
			};
		}
		return wrapped;
	}

	function deliveredCount(): number {
		return engine?.state.crates.filter((crate) => crate.delivered).length ?? 0;
	}

	function sync() {
		if (!engine) return;
		const state = engine.state;
		hud = {
			x: state.robot.position.x,
			y: state.robot.position.y,
			facing: state.robot.facing,
			carrying: state.robot.carrying,
			inventory: [...state.robot.inventory],
			satisfied: state.goals.filter((goal) => goal.satisfied).length,
			steps: state.steps,
		};
	}

	function log(kind: LogEntry['kind'], text: string) {
		logs = [...logs, { kind, text }];
	}

	function onkeydown(event: KeyboardEvent) {
		if (!(event.metaKey || event.ctrlKey) || event.key !== 'Enter') return;
		event.preventDefault();
		run();
	}

	// ========================================================
	// Static level copy
	// ========================================================

	function loadCode(): string {
		if (!browser) return starterCode(level);
		return localStorage.getItem(storageKey) ?? starterCode(level);
	}

	function starterCode(target: Level): string {
		const lines = [`// ${target.name}`];
		if (target.description) lines.push(`// ${target.description}`);
		lines.push('//', '// Write your program below, then press Run.', '');
		return lines.join('\n');
	}

	const STAGE_LABEL: Record<LanguageStage, string> = {
		1: 'Sequencing',
		2: 'Repeat',
		3: 'Conditions',
		4: 'While loops',
		5: 'Functions',
	};

	function goalLabel(goal: GoalCondition): string {
		switch (goal.kind) {
			case 'reach_goal':
				return 'Reach the target square';
			case 'deliver_all':
				return 'Deliver every crate';
			case 'deliver_specific':
				return `Deliver the ${goal.color} crate`;
		}
	}
</script>

<svelte:window {onkeydown} />

<div class="screen">
	<Topbar>
		{#snippet left()}
			<span class="topbar-logo">D</span>
			<span class="topbar-wordmark">Dewy</span>
			<span class="divider-v"></span>
			<Badge variant="chapter">
				Stage {level.options.languageStage} · {STAGE_LABEL[level.options.languageStage]}
			</Badge>
			<span class="mission">{level.name}</span>
			{@render props.titleExtra?.()}
		{/snippet}

		{#snippet right()}
			<span class="hud-label">Goals</span>
			<GemCounter collected={hud.satisfied} total={goalCount} />
			<span class="hud-goals">
				{#each level.goals as goal, index (index)}
					<span class="hud-goal" class:is-done={index < hud.satisfied}>{goalLabel(goal)}</span>
				{/each}
			</span>
			{@render props.actions?.()}
		{/snippet}
	</Topbar>

	<main class="stage">
		<section class="column">
			<div class="editor">
				<CodeMirrorEditor
					{code}
					{activeLine}
					readonly={running}
					stage={level.options.languageStage}
					height="100%"
					onchange={(next) => (code = next)}
				/>
			</div>

			<RunControls
				{running}
				{activeLine}
				steps={hud.steps}
				energy={level.options.energy}
				memory={level.options.memory}
				{memoryUsed}
				blocked={overMemory}
				bind:speed={view.speed}
				onrun={run}
				onstep={step}
				onstop={stop}
				onreset={reset}
			/>

			<Console {logs} height={132} />
		</section>

		<section class="world panel">
			<header class="world-header">
				<div>
					<p class="eyebrow">Workshop</p>
					<h1 class="world-title">{level.name}</h1>
				</div>
				<div class="world-chips">
					<span class="hud-label">facing</span>
					<span class="chip">{hud.facing}</span>
					<span class="hud-label">tile</span>
					<span class="chip">({hud.x}, {hud.y})</span>
					{#if level.options.showInventory}
						<span class="hud-label">carrying</span>
						<span class="chip">{hud.carrying ?? '—'}</span>
					{/if}
				</div>
			</header>

			<div class="viewport">
				<canvas bind:this={canvas}></canvas>

				{#if outcome?.status === 'complete'}
					<p class="banner is-win">★ Level complete!</p>
				{:else if outcome?.status === 'crash'}
					<p class="banner is-crash">{outcome.reason.message}</p>
				{:else if outcome?.status === 'error'}
					<p class="banner is-crash">Line {outcome.line}: {outcome.message}</p>
				{/if}
			</div>

			{#if level.description}
				<footer class="brief">
					<span class="hud-label">Brief ›</span>
					<span>{level.description}</span>
				</footer>
			{/if}
		</section>
	</main>

	<footer class="footer">
		<div class="footer-progress">
			<Progress
				value={goalCount === 0 ? 0 : hud.satisfied / goalCount}
				label="Goals"
				sublabel="{hud.satisfied} / {goalCount}"
			/>
		</div>
		<p class="hint">
			<Kbd>⌘</Kbd>
			<Kbd>↵</Kbd>
			<span>run</span>
		</p>
	</footer>
</div>

<style>
	.screen {
		display: flex;
		flex-direction: column;
		height: 100vh;
		overflow: hidden;
	}

	.mission {
		font-size: 0.8125rem;
		color: var(--text-muted);
	}

	.hud-label {
		font-size: 0.6875rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.6px;
	}

	.hud-goals {
		display: flex;
		flex-direction: column;
	}

	.hud-goal {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--text);
	}

	.hud-goal.is-done {
		color: var(--success);
		text-decoration: line-through;
		text-decoration-thickness: 1px;
	}

	/* ── Main split ─────────────────────────────────────────── */

	.stage {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: minmax(360px, 460px) 1fr;
		gap: 16px;
		padding: 16px;
	}

	.column {
		display: flex;
		flex-direction: column;
		gap: 12px;
		min-height: 0;
	}

	.editor {
		flex: 1;
		min-height: 0;
	}

	.world {
		display: flex;
		flex-direction: column;
		min-height: 0;
		padding: 18px;
	}

	.world-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 10px;
	}

	.eyebrow {
		font-size: 0.6875rem;
		font-weight: 700;
		letter-spacing: 0.8px;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	.world-title {
		font-size: 0.9375rem;
		margin-top: 2px;
	}

	.world-chips {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.viewport {
		position: relative;
		flex: 1;
		min-height: 0;
	}

	.viewport canvas {
		display: block;
		width: 100%;
		height: 100%;
	}

	.banner {
		position: absolute;
		top: 16px;
		left: 16px;
		max-width: calc(100% - 32px);
		padding: 8px 12px;
		border-radius: var(--radius);
		box-shadow: var(--panel-shadow);
		font-size: 0.8125rem;
		font-weight: 700;
		color: #fff;
	}

	.banner.is-win {
		background: var(--success);
	}

	.banner.is-crash {
		background: var(--danger);
	}

	.brief {
		display: flex;
		align-items: baseline;
		gap: 8px;
		margin-top: 10px;
		font-size: 0.8125rem;
		color: var(--text);
	}

	/* ── Footer ─────────────────────────────────────────────── */

	.footer {
		display: flex;
		align-items: center;
		gap: 20px;
		padding: 0 22px 14px;
	}

	.footer-progress {
		flex: 1;
	}

	.hint {
		display: flex;
		align-items: center;
		gap: 6px;
		font-family: var(--font-code);
		font-size: 0.6875rem;
		color: var(--text-faint);
	}

	@media (max-width: 900px) {
		.screen {
			height: auto;
			overflow: visible;
		}

		.stage {
			grid-template-columns: 1fr;
		}

		.editor {
			flex: none;
			height: 360px;
		}

		.viewport {
			height: 420px;
		}
	}
</style>
