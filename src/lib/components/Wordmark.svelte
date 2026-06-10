<script lang="ts">
	// Parametric site wordmark — transcript venture-5 variant. Inherits the
	// dexli.dev tiny-tools family Wordmark shape (per webhook / cron / regex /
	// diff / apex hub Wordmarks); differs only in name/glyph defaults.
	//
	// Family glyph graph at sealing time (2026-06-10) — the transcript glyph
	// MUST be distinct from every locked glyph:
	//
	//   webhook.dexli.dev → '⌁' (zigzag bolt — trigger/event)
	//   cron.dexli.dev    → '◷' (clock quadrant — schedule/time)
	//   regex.dexli.dev   → '∋' (contains-as-member — matches/membership)
	//   diff.dexli.dev    → 'Δ' (capital delta — change)
	//   dexli.dev (apex)  → '❖' (diamond — multifaceted index)
	//
	// transcript.dexli.dev → '❝' (heavy quotation ornament — dialogue/
	// conversation, the thing this tool renders). Distinct from all five.
	//
	// Do NOT edit the Wordmark BODY (markup / CSS / Props shape) per the
	// family scaffold rule that locks the brand component's structural
	// surface. Only the glyph prop default is tool-tunable.

	interface Props {
		name?: string;
		domain?: string;
		/** Sixth-distinct family-level glyph in the logo tile. */
		glyph?: string;
		/** Where the wordmark links to. Root of the site by default. */
		href?: string;
	}
	let { name = 'transcript', domain = '.dexli.dev', glyph = '❝', href = '/' }: Props = $props();
</script>

<a class="brand" {href}>
	<span class="logo" aria-hidden="true">{glyph}</span>
	<span class="text">{name}<span class="tld">{domain}</span></span>
</a>

<style>
	.brand {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		color: var(--text);
		font-weight: 700;
		font-size: 15px;
		letter-spacing: -0.01em;
	}
	.brand:hover {
		text-decoration: none;
	}
	.logo {
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border-radius: 8px;
		background: var(--accent);
		color: #0a0b0d;
		font-size: 18px;
		box-shadow: 0 0 24px -6px var(--accent-glow);
	}
	.tld {
		color: var(--text-faint);
	}
</style>
