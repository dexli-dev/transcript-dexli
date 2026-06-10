import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

// `defineConfig` from `vitest/config` (not `vite`) is what gives the `test`
// key its types. Without that import the test config silently goes untyped
// and svelte-check / tsc won't catch misconfigurations.
export default defineConfig({
	plugins: [sveltekit()],
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}']
	}
});
