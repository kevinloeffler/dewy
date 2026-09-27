<script lang="ts">
	import {
		Badge, Button, Callout, Checkbox, CodeEditor, CodeMirrorEditor, Console,
		CredentialsSheet, Field, GemCounter, Kbd, Modal, Panel, Progress,
		StatusDot, Topbar,
	} from '$lib/components/index.js';
	import type { LogEntry } from '$lib/components/index.js';

	// Live state for the form and overlay demos below.
	let demoName = $state('Marie Muster');
	let demoPicked = $state(true);
	let demoModal = $state(false);

	// ── sample data ──────────────────────────────────────────

	const SAMPLE_CODE = `// Mission 1.3 · Loops & sequences
// Collect the gem, then reach the star.

robot.forward();
robot.forward();
robot.turnRight();

for (let i = 0; i < 2; i++) {
  robot.forward();
}

robot.pickup();
robot.turnLeft();

for (let i = 0; i < 3; i++) {
  robot.forward();
}

robot.turnRight();
robot.forward();`;

	const LOGS: LogEntry[] = [
		{ kind: 'info', text: '› Ready. Press Run or Step to begin.' },
		{ kind: 'cmd',  text: '→ forward() → (2, 1)' },
		{ kind: 'cmd',  text: '→ forward() → (2, 2)' },
		{ kind: 'cmd',  text: '↻ turnRight → facing S' },
		{ kind: 'cmd',  text: '→ forward() → (3, 2)' },
		{ kind: 'cmd',  text: '→ forward() → (4, 2)' },
		{ kind: 'ok',   text: '✓ pickup() — gem collected!' },
		{ kind: 'warn', text: '⚠ forward() — blocked!' },
		{ kind: 'err',  text: '✗ forward() — out of bounds.' },
	];

	// ── icon snippets (shared) ────────────────────────────────

	let activeLine    = $state<number | null>(4);

	// CodeMirrorEditor demo state
	let cmActiveLine  = $state<number | null>(4);
	let cmReadonly    = $state(false);
	let cmCode        = $state(SAMPLE_CODE);
</script>

<svelte:head>
	<title>Component Library · Dewy</title>
</svelte:head>

<div class="page">

	<!-- ── Page header ────────────────────────────────────────── -->
	<div class="page-header">
		<div class="page-header-inner">
			<div class="page-logo">D</div>
			<div>
				<h1 class="page-title">Component Library</h1>
				<p class="page-subtitle">Dewy · Soft Sage design system</p>
			</div>
		</div>
	</div>

	<main class="main">

		<!-- ════════════════════════════════════════════════════ -->
		<!-- FOUNDATION                                           -->
		<!-- ════════════════════════════════════════════════════ -->

		<div class="chapter-head">
			<span class="chapter-eyebrow">01</span>
			<h2 class="chapter-title">Foundation</h2>
		</div>

		<!-- Color palette -->
		<section class="section">
			<h3 class="section-title">Color tokens</h3>
			<div class="palette-grid">
				{#each [
					{ label: 'bg',           hex: '#f5f1e8', dark: false },
					{ label: 'panel',        hex: '#ffffff', dark: false },
					{ label: 'text',         hex: '#2d3a2e', dark: true  },
					{ label: 'text-muted',   hex: '#6c7a6e', dark: true  },
					{ label: 'text-faint',   hex: '#a0aaa1', dark: false },
					{ label: 'accent',       hex: '#6b9e7a', dark: true  },
					{ label: 'accent-soft',  hex: '#cfe3c8', dark: false },
					{ label: 'danger',       hex: '#d97757', dark: true  },
					{ label: 'success',      hex: '#6b9e7a', dark: true  },
					{ label: 'chip-bg',      hex: '#eef3e8', dark: false },
					{ label: 'chapter-bg',   hex: '#fff7e6', dark: false },
					{ label: 'chapter-text', hex: '#a4732a', dark: true  },
					{ label: 'editor-bg',    hex: '#fdfbf6', dark: false },
					{ label: 'editor-line',  hex: '#d97757', dark: true  },
					{ label: 'tok-keyword',  hex: '#a4732a', dark: true  },
					{ label: 'tok-string',   hex: '#6b9e7a', dark: true  },
				] as token}
					<div class="swatch panel">
						<div class="swatch-color" style="background:{token.hex}">
							{#if token.dark}
								<span class="swatch-hex swatch-hex--light">{token.hex}</span>
							{:else}
								<span class="swatch-hex swatch-hex--dark">{token.hex}</span>
							{/if}
						</div>
						<div class="swatch-label">--{token.label}</div>
					</div>
				{/each}
			</div>
		</section>

		<!-- Typography -->
		<section class="section">
			<h3 class="section-title">Typography</h3>
			<Panel>
				<div class="type-grid">
					<div class="type-col">
						<span class="spec">Nunito · display</span>
						<h1 style="font-size: 2.25rem; line-height: 1.1">Dewlab</h1>
						<h2 style="font-size: 1.5rem; margin-top: 10px">Mission 1.3</h2>
						<h3 style="font-size: 1.125rem; margin-top: 8px">Pickup Run</h3>
						<h4 style="font-size: 0.9375rem; margin-top: 6px">Chapter 1 · Loops</h4>
					</div>
					<div class="type-col">
						<span class="spec">Nunito · body</span>
						<p style="font-size: 0.9375rem; margin-top: 8px">Collect the gem, then reach the star.</p>
						<p style="font-size: 0.8125rem; color: var(--text-muted); margin-top: 6px">
							Try changing <code>i &lt; 2</code> to <code>i &lt; 3</code> to see what happens.
						</p>
						<p style="font-size: 0.75rem; color: var(--text-faint); margin-top: 6px; text-transform: uppercase; letter-spacing: 0.6px">
							Step 3 of 15
						</p>
					</div>
					<div class="type-col">
						<span class="spec">JetBrains Mono · code</span>
						<p style="font-family: var(--font-code); font-size: 0.8125rem; margin-top: 8px">robot.forward();</p>
						<p style="font-family: var(--font-code); font-size: 0.8125rem; margin-top: 4px">robot.turnRight();</p>
						<p style="font-family: var(--font-code); font-size: 0.75rem; color: var(--text-muted); margin-top: 6px">line 4 · step 3/15</p>
						<div style="display:flex; gap:4px; align-items:center; margin-top: 8px">
							<Kbd>⌘</Kbd><Kbd>↵</Kbd>
							<span style="font-size:0.75rem; color:var(--text-faint); margin-left:4px">run</span>
						</div>
					</div>
				</div>
			</Panel>
		</section>

		<!-- ════════════════════════════════════════════════════ -->
		<!-- COMPONENTS                                           -->
		<!-- ════════════════════════════════════════════════════ -->

		<div class="chapter-head">
			<span class="chapter-eyebrow">02</span>
			<h2 class="chapter-title">Components</h2>
		</div>

		<!-- Button -->
		<section class="section">
			<h3 class="section-title">Button</h3>
			<div class="row-demo">
				<Panel>
					<div class="demo-label">Primary</div>
					<div class="demo-row">
						<Button onclick={() => {}}>
							{#snippet icon()}
								<svg width="12" height="12" viewBox="0 0 12 12"><polygon points="2,1 2,11 11,6" fill="currentColor"/></svg>
							{/snippet}
							Run
						</Button>
						<Button disabled>
							{#snippet icon()}
								<svg width="12" height="12" viewBox="0 0 12 12"><polygon points="2,1 2,11 11,6" fill="currentColor"/></svg>
							{/snippet}
							Running…
						</Button>
					</div>
				</Panel>
				<Panel>
					<div class="demo-label">Ghost</div>
					<div class="demo-row">
						<Button variant="ghost">
							{#snippet icon()}
								<svg width="12" height="12" viewBox="0 0 12 12"><polygon points="2,2 2,10 7,6" fill="currentColor"/><rect x="8" y="2" width="2" height="8" fill="currentColor"/></svg>
							{/snippet}
							Step
						</Button>
						<Button variant="ghost">
							{#snippet icon()}
								<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6a4 4 0 1 0 1.2-2.85"/><polyline points="1.5,1.5 2.5,4 5,3"/></svg>
							{/snippet}
							Reset
						</Button>
						<Button variant="ghost" disabled>Disabled</Button>
					</div>
				</Panel>
				<Panel>
					<div class="demo-label">Text only</div>
					<div class="demo-row">
						<Button>Submit</Button>
						<Button variant="ghost">Cancel</Button>
					</div>
				</Panel>
			</div>
		</section>

		<!-- Badge -->
		<section class="section">
			<h3 class="section-title">Badge &amp; Chip</h3>
			<Panel>
				<div class="demo-row demo-row--spaced">
					<div class="demo-group">
						<div class="demo-label">Chapter badge</div>
						<div class="demo-row">
							<Badge variant="chapter">CH 1 · LOOPS</Badge>
							<Badge variant="chapter">CH 2 · VARIABLES</Badge>
							<Badge variant="chapter">CH 3 · IF / ELSE</Badge>
						</div>
					</div>
					<div class="demo-group">
						<div class="demo-label">Code chip</div>
						<div class="demo-row">
							<Badge>facing N</Badge>
							<Badge>(2, 3)</Badge>
							<Badge>7 × 6 grid</Badge>
							<Badge>dir: E</Badge>
						</div>
					</div>
				</div>
			</Panel>
		</section>

		<!-- Field / Checkbox / Callout -->
		<section class="section">
			<h3 class="section-title">Form fields</h3>
			<Panel>
				<div class="demo-row demo-row--spaced">
					<div class="demo-group grow">
						<div class="demo-label">Field</div>
						<Field label="Name" name="demo-name" bind:value={demoName} hint="Shown to students." />
						<Field
							label="Username"
							name="demo-username"
							value="mmuster"
							error="That username is already taken."
						/>
					</div>
					<div class="demo-group">
						<div class="demo-label">Checkbox</div>
						<div class="demo-row">
							<Checkbox bind:checked={demoPicked} label="Selected" />
							<Checkbox checked={false} label="Unselected" />
							<Checkbox checked indeterminate label="Some selected" />
							<Checkbox checked disabled label="Disabled" />
						</div>
					</div>
				</div>
			</Panel>
		</section>

		<!-- Callout -->
		<section class="section">
			<h3 class="section-title">Callout</h3>
			<div class="stack">
				<Callout>Anonymous visitors keep their progress in this browser only.</Callout>
				<Callout variant="warn">
					<strong>This is the only time these passwords are shown.</strong> They are stored hashed.
				</Callout>
				<Callout variant="danger">That class still has students — archive it instead.</Callout>
			</div>
		</section>

		<!-- Table -->
		<section class="section">
			<h3 class="section-title">Data table</h3>
			<Panel padding="sm">
				<div class="table-wrap">
					<table class="table">
						<thead>
							<tr>
								<th class="tight"><Checkbox checked={false} label="Select all" /></th>
								<th>Name</th>
								<th>Signs in with</th>
								<th>Role</th>
								<th class="numeric">Done</th>
							</tr>
						</thead>
						<tbody>
							<tr>
								<td class="tight"><Checkbox checked label="Select Marie" /></td>
								<td>Marie Muster</td>
								<td class="mono">mmuster</td>
								<td><span class="chip">student</span></td>
								<td class="numeric">12</td>
							</tr>
							<tr>
								<td class="tight"><Checkbox checked={false} label="Select Tom" /></td>
								<td>Tom Meier</td>
								<td class="mono">tmeier</td>
								<td><span class="chip">student</span></td>
								<td class="numeric">7</td>
							</tr>
							<tr class="is-archived">
								<td class="tight"><Checkbox checked={false} label="Select Aylin" /></td>
								<td>Aylin Yilmaz <span class="chip">Archived</span></td>
								<td class="mono">ayilmaz</td>
								<td><span class="chip">student</span></td>
								<td class="numeric">3</td>
							</tr>
						</tbody>
					</table>
				</div>
			</Panel>
		</section>

		<!-- Modal -->
		<section class="section">
			<h3 class="section-title">Modal</h3>
			<Panel>
				<div class="demo-row">
					<Button variant="ghost" onclick={() => (demoModal = true)}>Open modal</Button>
					<span class="demo-label">Native &lt;dialog&gt; — Escape and the focus trap come free.</span>
				</div>
			</Panel>
		</section>

		<!-- CredentialsSheet -->
		<section class="section">
			<h3 class="section-title">
				Credentials sheet <span class="section-badge">printable</span>
			</h3>
			<CredentialsSheet
				heading="New accounts · 7b"
				credentials={[
					{ name: 'Marie Muster', username: 'mmuster', password: 'fiddlekitten53' },
					{ name: 'Tom Meier', username: 'tmeier', password: 'pretzelharbor78' },
					{ name: 'Aylin Yilmaz', username: 'ayilmaz', password: 'sparrowcrane76' }
				]}
			/>
		</section>

		<!-- Progress -->
		<section class="section">
			<h3 class="section-title">Progress</h3>
			<Panel>
				<div class="progress-demos">
					<Progress value={0.6} label="Chapter 1" sublabel="3 / 5 missions" />
					<Progress value={0.33} label="Step progress" sublabel="5 / 15" />
					<Progress value={1}   label="Completed" sublabel="5 / 5" />
					<Progress value={0}   label="Not started" sublabel="0 / 5" />
				</div>
			</Panel>
		</section>

		<!-- GemCounter + StatusDot + Kbd -->
		<section class="section">
			<h3 class="section-title">HUD atoms</h3>
			<div class="row-demo">
				<Panel>
					<div class="demo-label">Gem counter</div>
					<div class="demo-col">
						<GemCounter collected={0} total={3} />
						<GemCounter collected={1} total={3} />
						<GemCounter collected={2} total={3} />
						<GemCounter collected={3} total={3} />
					</div>
				</Panel>
				<Panel>
					<div class="demo-label">Status dot</div>
					<div class="demo-col">
						<StatusDot label="Idle" />
						<StatusDot active label="Running" />
					</div>
				</Panel>
				<Panel>
					<div class="demo-label">Keyboard hints</div>
					<div class="demo-col">
						<div class="demo-row">
							<Kbd>⌘</Kbd><Kbd>↵</Kbd>
							<span class="hint-text">run</span>
						</div>
						<div class="demo-row">
							<Kbd>Space</Kbd>
							<span class="hint-text">step</span>
						</div>
						<div class="demo-row">
							<Kbd>Esc</Kbd>
							<span class="hint-text">reset</span>
						</div>
					</div>
				</Panel>
			</div>
		</section>

		<!-- Code editor -->
		<section class="section">
			<h3 class="section-title">Code editor</h3>
			<p class="section-desc">
				Active line: <code>{activeLine ?? 'none'}</code> —
				click a line number to set it.
			</p>
			<div class="editor-demo">
				<CodeEditor
					code={SAMPLE_CODE}
					{activeLine}
					filename="mission_1_3.js"
					height={400}
				/>
				<div class="editor-demo-controls panel">
					<div class="demo-label">Set active line</div>
					<div class="demo-col" style="gap: 6px">
						{#each [null, 4, 5, 6, 9, 12, 13] as ln}
							<button
								class="line-btn"
								class:is-active={activeLine === ln}
								onclick={() => (activeLine = ln)}
							>
								{ln === null ? 'none' : `line ${ln}`}
							</button>
						{/each}
					</div>
					<hr class="divider" style="margin: 12px 0" />
					<div class="demo-label">Token colors</div>
					<div class="token-legend">
						<span class="tok-keyword">keyword</span>
						<span class="tok-string">string</span>
						<span class="tok-number">number</span>
						<span class="tok-fn">function</span>
						<span class="tok-ident">identifier</span>
						<span class="tok-comment">comment</span>
					</div>
				</div>
			</div>
		</section>

		<!-- CodeMirror editor -->
		<section class="section">
			<h3 class="section-title">CodeMirror editor <span class="section-badge">editable</span></h3>
			<p class="section-desc">
				Full CodeMirror 6 editor with Sage theme, JS syntax highlighting, robot API autocomplete,
				and executing-line decoration. Try typing <code>robot.</code> to trigger completions.
			</p>
			<div class="cm-demo">
				<CodeMirrorEditor
					code={SAMPLE_CODE}
					activeLine={cmActiveLine}
					readonly={cmReadonly}
					height={420}
					onchange={(v) => (cmCode = v)}
				/>
				<div class="cm-demo-sidebar">
					<Panel padding="sm">
						<div class="demo-label" style="margin-bottom: 10px">Executing line</div>
						<div class="demo-col" style="gap: 5px">
							{#each [null, 4, 5, 6, 9, 12, 13, 16] as ln}
								<button
									class="line-btn"
									class:is-active={cmActiveLine === ln}
									onclick={() => (cmActiveLine = ln)}
								>
									{ln === null ? 'none' : `line ${ln}`}
								</button>
							{/each}
						</div>

						<hr class="divider" style="margin: 12px 0" />

						<div class="demo-label" style="margin-bottom: 10px">State</div>
						<label class="toggle-row">
							<input type="checkbox" bind:checked={cmReadonly} />
							<span>Readonly</span>
							<StatusDot active={cmReadonly} />
						</label>

						<hr class="divider" style="margin: 12px 0" />

						<div class="demo-label" style="margin-bottom: 6px">Robot API</div>
						<div class="demo-col" style="gap: 3px; font-family: var(--font-code); font-size: 0.6875rem; color: var(--text-muted)">
							<span>robot.forward()</span>
							<span>robot.backward()</span>
							<span>robot.turnLeft()</span>
							<span>robot.turnRight()</span>
							<span>robot.pickup()</span>
							<span>robot.drop()</span>
							<span>robot.look()</span>
							<span>robot.getX()</span>
							<span>robot.getY()</span>
							<span>robot.getDirection()</span>
						</div>
					</Panel>
				</div>
			</div>
		</section>

		<!-- Console -->
		<section class="section">
			<h3 class="section-title">Console</h3>
			<div class="console-demo">
				<Console logs={LOGS} height={220} />
				<Panel>
					<div class="demo-label">Message kinds</div>
					<div class="demo-col" style="gap: 4px; font-family: var(--font-code); font-size: 0.75rem">
						<span class="console-line-info">info — system messages</span>
						<span class="console-line-cmd">cmd — executed commands</span>
						<span class="console-line-ok">ok — success feedback</span>
						<span class="console-line-warn">warn — warnings</span>
						<span class="console-line-err">err — errors</span>
					</div>
				</Panel>
			</div>
		</section>

		<!-- ════════════════════════════════════════════════════ -->
		<!-- PATTERNS                                             -->
		<!-- ════════════════════════════════════════════════════ -->

		<div class="chapter-head">
			<span class="chapter-eyebrow">03</span>
			<h2 class="chapter-title">Patterns</h2>
		</div>

		<!-- Topbar -->
		<section class="section">
			<h3 class="section-title">Topbar</h3>
			<div class="topbar-demo">
				<Topbar>
					{#snippet left()}
						<Badge variant="chapter">CH 1 · LOOPS</Badge>
						<span style="color:var(--text-muted); font-size:0.8125rem">Mission 1.3 — Pickup Run</span>
					{/snippet}
					{#snippet right()}
						<span style="font-size:0.6875rem; text-transform:uppercase; letter-spacing:0.6px; color:var(--text-muted)">Goal</span>
						<GemCounter collected={1} total={2} />
						<span style="font-size:0.8125rem; font-weight:600">★ Reach the star</span>
					{/snippet}
				</Topbar>
			</div>
		</section>

		<!-- Game layout preview -->
		<section class="section">
			<h3 class="section-title">Game screen layout</h3>
			<p class="section-desc">Editor + console on the left · world viewport on the right · run controls between them.</p>
			<div class="game-preview">
				<Topbar>
					{#snippet left()}
						<Badge variant="chapter">CH 1 · LOOPS</Badge>
						<span style="color:var(--text-muted); font-size:0.75rem">Mission 1.3</span>
					{/snippet}
					{#snippet right()}
						<GemCounter collected={1} total={1} />
						<StatusDot active label="Running" />
					{/snippet}
				</Topbar>

				<div class="game-body">
					<!-- Left column: editor + controls + console -->
					<div class="game-left">
						<Panel padding="none" class="game-editor-panel">
							<CodeEditor code={SAMPLE_CODE} activeLine={9} filename="mission_1_3.js" fontSize={12} height="100%" />
						</Panel>
						<div class="game-controls">
							<Button>
								{#snippet icon()}<svg width="11" height="11" viewBox="0 0 12 12"><polygon points="2,1 2,11 11,6" fill="currentColor"/></svg>{/snippet}
								Run
							</Button>
							<Button variant="ghost">
								{#snippet icon()}<svg width="11" height="11" viewBox="0 0 12 12"><polygon points="2,2 2,10 7,6" fill="currentColor"/><rect x="8" y="2" width="2" height="8" fill="currentColor"/></svg>{/snippet}
								Step
							</Button>
							<Button variant="ghost">
								{#snippet icon()}<svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6a4 4 0 1 0 1.2-2.85"/><polyline points="1.5,1.5 2.5,4 5,3"/></svg>{/snippet}
								Reset
							</Button>
							<span style="margin-left:auto; font-family:var(--font-code); font-size:0.6875rem; color:var(--text-muted)">
								line 9 · step 5/15
							</span>
						</div>
						<Console logs={LOGS} height={100} />
					</div>

					<!-- Right column: world viewport placeholder -->
					<div class="game-world">
					<Panel padding="md">
						<div class="world-header">
							<div>
								<div style="font-size:0.6875rem; text-transform:uppercase; color:var(--text-muted); letter-spacing:0.8px; font-weight:700">Workshop</div>
								<div style="font-size:0.9375rem; font-weight:700; margin-top:2px">Conveyor Floor · Sector 3</div>
							</div>
							<div style="display:flex; gap:6px">
								<Badge>facing E</Badge>
								<Badge>(2, 3)</Badge>
							</div>
						</div>
						<div class="world-viewport">
							<div class="world-placeholder">
								<svg width="48" height="48" viewBox="0 0 48 48" fill="none">
									<polygon points="24,4 44,16 44,32 24,44 4,32 4,16" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="1.5"/>
									<polygon points="24,12 36,20 36,28 24,36 12,28 12,20" fill="var(--panel)" stroke="var(--accent)" stroke-width="1"/>
									<circle cx="24" cy="24" r="5" fill="var(--accent)" opacity="0.7"/>
								</svg>
								<span>Isometric world renders here</span>
							</div>
						</div>
						<div class="world-progress">
							<Progress value={0.6} label="Chapter 1" sublabel="3 / 5" />
						</div>
					</Panel>
					</div>
				</div>
			</div>
		</section>

	</main>
</div>

<Modal bind:open={demoModal} title="Share “Loops and Turns”">
	<p style="margin: 0; font-size: 0.8125rem; color: var(--text-muted); line-height: 1.55">
		A shared teacher sees this course as a <strong>live link</strong> — your later edits reach
		them — and can assign it to their classes, but cannot change it.
	</p>
	{#snippet actions()}
		<Button variant="ghost" onclick={() => (demoModal = false)}>Close</Button>
	{/snippet}
</Modal>

<style>
	.stack {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.grow {
		flex: 1;
		min-width: 240px;
	}

	.table-wrap {
		overflow-x: auto;
	}

	.mono {
		font-family: var(--font-code);
		font-size: 0.8125rem;
	}

	/* ── Page shell ───────────────────────────────────────── */
	.page {
		min-height: 100vh;
		background: var(--bg);
		color: var(--text);
		font-family: var(--font-ui);
	}

	.page-header {
		background: var(--panel);
		border-bottom: 1px solid var(--panel-border);
		padding: 20px 40px;
	}

	.page-header-inner {
		max-width: 1160px;
		margin: 0 auto;
		display: flex;
		align-items: center;
		gap: 16px;
	}

	.page-logo {
		width: 40px;
		height: 40px;
		border-radius: 10px;
		background: var(--accent);
		display: flex;
		align-items: center;
		justify-content: center;
		color: #fff;
		font-size: 1.25rem;
		font-weight: 800;
		flex-shrink: 0;
	}

	.page-title {
		font-size: 1.25rem;
		margin: 0 0 2px;
	}

	.page-subtitle {
		font-size: 0.8125rem;
		color: var(--text-muted);
		margin: 0;
	}

	/* ── Main layout ──────────────────────────────────────── */
	.main {
		max-width: 1160px;
		margin: 0 auto;
		padding: 48px 40px 80px;
		display: flex;
		flex-direction: column;
		gap: 40px;
	}

	/* ── Chapter headings ─────────────────────────────────── */
	.chapter-head {
		display: flex;
		align-items: baseline;
		gap: 12px;
		padding-top: 16px;
		border-top: 1px solid var(--panel-border);
	}

	.chapter-eyebrow {
		font-family: var(--font-code);
		font-size: 0.75rem;
		color: var(--text-faint);
		letter-spacing: 0.6px;
	}

	.chapter-title {
		font-size: 1.375rem;
		font-weight: 800;
		letter-spacing: -0.3px;
		margin: 0;
	}

	/* ── Section ──────────────────────────────────────────── */
	.section {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.section-title {
		font-size: 0.9375rem;
		font-weight: 700;
		margin: 0;
		color: var(--text);
	}

	.section-desc {
		font-size: 0.8125rem;
		color: var(--text-muted);
		margin: -6px 0 0;
	}

	/* ── Color palette ────────────────────────────────────── */
	.palette-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
		gap: 8px;
	}

	.swatch {
		overflow: hidden;
		padding: 0 !important;
	}

	.swatch-color {
		height: 52px;
		position: relative;
		display: flex;
		align-items: flex-end;
		padding: 6px 8px;
	}

	.swatch-hex {
		font-family: var(--font-code);
		font-size: 0.625rem;
		letter-spacing: 0.3px;
	}

	.swatch-hex--light { color: rgba(255,255,255,0.8); }
	.swatch-hex--dark  { color: rgba(0,0,0,0.45); }

	.swatch-label {
		padding: 6px 8px 8px;
		font-family: var(--font-code);
		font-size: 0.6875rem;
		color: var(--text-muted);
	}

	/* ── Typography demo ──────────────────────────────────── */
	.type-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 32px;
	}

	.type-col {
		display: flex;
		flex-direction: column;
	}

	.spec {
		display: inline-block;
		font-family: var(--font-code);
		font-size: 0.6875rem;
		color: var(--text-faint);
		letter-spacing: 0.4px;
		margin-bottom: 10px;
		padding-bottom: 8px;
		border-bottom: 1px solid var(--panel-border);
	}

	/* ── Demo helpers ─────────────────────────────────────── */
	.row-demo {
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
		align-items: flex-start;
	}

	.row-demo :global(.panel) {
		flex: 1;
		min-width: 200px;
		padding: 18px 20px;
	}

	.demo-label {
		font-size: 0.6875rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.6px;
		color: var(--text-muted);
		margin-bottom: 12px;
	}

	.demo-row {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}

	.demo-row--spaced {
		gap: 32px;
	}

	.demo-group {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.demo-col {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.hint-text {
		font-size: 0.75rem;
		color: var(--text-faint);
		font-family: var(--font-code);
	}

	/* ── Progress demos ───────────────────────────────────── */
	.progress-demos {
		display: flex;
		flex-direction: column;
		gap: 20px;
		max-width: 520px;
	}

	/* ── Editor demo ──────────────────────────────────────── */
	.editor-demo {
		display: grid;
		grid-template-columns: 1fr 180px;
		gap: 12px;
		align-items: start;
	}

	.editor-demo-controls {
		padding: 16px;
	}

	.line-btn {
		appearance: none;
		border: 1px solid var(--panel-border);
		background: var(--btn-ghost-bg);
		color: var(--text-muted);
		font-family: var(--font-code);
		font-size: 0.75rem;
		padding: 4px 10px;
		border-radius: 5px;
		cursor: pointer;
		text-align: left;
		transition: background 100ms, color 100ms;
	}

	.line-btn:hover {
		background: var(--chip-bg);
		color: var(--text);
	}

	.line-btn.is-active {
		background: var(--accent);
		color: #fff;
		border-color: var(--accent);
		font-weight: 700;
	}

	.token-legend {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-family: var(--font-code);
		font-size: 0.75rem;
		margin-top: 10px;
	}

	/* ── Console demo ─────────────────────────────────────── */
	.console-demo {
		display: grid;
		grid-template-columns: 1fr 220px;
		gap: 12px;
		align-items: start;
	}

	.console-demo :global(.panel) {
		padding: 16px;
		height: 100%;
	}

	/* ── Topbar demo ──────────────────────────────────────── */
	.topbar-demo :global(.topbar) {
		border-radius: var(--radius);
		border: 1px solid var(--panel-border);
	}

	/* ── Game preview ─────────────────────────────────────── */
	.game-preview {
		background: var(--bg);
		border: 1px solid var(--panel-border);
		border-radius: var(--radius);
		overflow: hidden;
		box-shadow: var(--panel-shadow);
	}

	.game-preview :global(.topbar) {
		border-radius: 0;
		border-bottom: 1px solid var(--panel-border);
		border-top: none;
		border-left: none;
		border-right: none;
	}

	.game-body {
		display: grid;
		grid-template-columns: 400px 1fr;
		gap: 14px;
		padding: 14px;
		height: 500px;
	}

	.game-left {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-height: 0;
	}

	.game-left :global(.game-editor-panel) {
		flex: 1;
		min-height: 0;
		border-radius: var(--radius);
		overflow: hidden;
	}

	.game-controls {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-shrink: 0;
	}

	.game-world {
		display: flex;
		flex-direction: column;
		gap: 12px;
		min-height: 0;
		height: 100%;
	}

	.world-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
	}

	.world-viewport {
		flex: 1;
		border-radius: calc(var(--radius) - 4px);
		background: var(--bg);
		border: 1px solid var(--panel-border);
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 0;
	}

	.world-placeholder {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		color: var(--text-faint);
		font-size: 0.8125rem;
	}

	.world-progress {
		flex-shrink: 0;
	}

	/* ── Section badge ────────────────────────────────────── */
	.section-badge {
		display: inline-flex;
		align-items: center;
		background: var(--accent-soft);
		color: var(--accent);
		font-size: 0.6875rem;
		font-weight: 700;
		padding: 2px 7px;
		border-radius: 999px;
		letter-spacing: 0.3px;
		margin-left: 8px;
		vertical-align: middle;
		font-family: var(--font-ui);
	}

	/* ── CodeMirror demo ──────────────────────────────────── */
	.cm-demo {
		display: grid;
		grid-template-columns: 1fr 200px;
		gap: 12px;
		align-items: start;
	}

	.cm-demo-sidebar :global(.panel) {
		padding: 14px;
	}

	.toggle-row {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.8125rem;
		color: var(--text-muted);
		cursor: pointer;
		user-select: none;
	}

	.toggle-row input[type="checkbox"] {
		accent-color: var(--accent);
		width: 14px;
		height: 14px;
		cursor: pointer;
	}
</style>
