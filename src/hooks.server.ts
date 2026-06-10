// Global server hook — adds non-CSP hardening headers to every response
// (the CSP header itself is emitted by SvelteKit per svelte.config.js
// kit.csp configuration).
//
// Three always-on hardening headers:
//   - X-Content-Type-Options: nosniff  (no MIME-sniffing surprises)
//   - Referrer-Policy:       no-referrer  (leak nothing about where readers came from)
//   - X-Frame-Options:       DENY  (no clickjacking embed)
//
// Cache-Control: no-store is intentionally OMITTED.
//
// The transcript app shell is a pure static surface: transcript content is
// read from a local file or pasted text and lives only in browser memory —
// it is never part of a request, a URL, or a response. There are no per-user
// secrets server-side and nothing user-specific to cache-poison. Default
// cache semantics serve the product (instant repeat loads, CDN-absorbable).
//
// If a future surface introduces server-held state (saved transcripts,
// share links, etc.), revisit per-route rather than reinstating a blanket
// no-store — and note that "saved transcripts" would be a privacy-model
// change requiring its own decision, not just a header.

import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	const headers = response.headers;

	if (!headers.has('X-Content-Type-Options')) {
		headers.set('X-Content-Type-Options', 'nosniff');
	}
	if (!headers.has('Referrer-Policy')) {
		headers.set('Referrer-Policy', 'no-referrer');
	}
	if (!headers.has('X-Frame-Options')) {
		headers.set('X-Frame-Options', 'DENY');
	}

	return response;
};
