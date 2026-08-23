import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	test: {
		// The game engine is deliberately free of Svelte, Three.js and the DOM,
		// so its tests run in plain Node.
		environment: 'node',
		include: ['src/lib/game/**/*.test.ts']
	}
});
