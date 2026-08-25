import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		// Everything under test here — the game engine, the script parser, the
		// markdown renderer — is deliberately free of Svelte, Three.js and the
		// DOM, so it all runs in plain Node.
		environment: 'node',
		include: ['src/lib/**/*.test.ts']
	}
});
