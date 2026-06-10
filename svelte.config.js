import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter(),
		// transcript has no receiver surface and no state-changing requests at
		// all — every byte of transcript content is parsed client-side from a
		// local file / pasted text and never sent anywhere. SvelteKit's default
		// origin-based CSRF check stays on.
		//
		// Strict CSP — auto mode emits per-page nonces/hashes for SvelteKit's
		// hydration inline scripts, so `script-src 'self'` holds without
		// 'unsafe-inline' for scripts. Inline style attributes from Svelte
		// components still need 'unsafe-inline' for style only — non-
		// exploitable when no untrusted content is rendered as HTML (all
		// transcript content renders through text nodes, never {@html}).
		csp: {
			mode: 'auto',
			directives: {
				'default-src': ['self'],
				// `https://analytics.innersyntax.dev` allowed for the family's
				// Umami analytics snippet (per-tool website-id wired in
				// app.html once the site is registered). Same allowlist in
				// connect-src so the script's POST-back isn't CSP-blocked.
				'script-src': ['self', 'https://analytics.innersyntax.dev'],
				'style-src': ['self', 'unsafe-inline'],
				'img-src': ['self', 'data:'],
				'font-src': ['self', 'data:'],
				'connect-src': ['self', 'https://analytics.innersyntax.dev'],
				'object-src': ['none'],
				'frame-ancestors': ['none'],
				'base-uri': ['none'],
				'form-action': ['self']
			}
		}
	}
};

export default config;
