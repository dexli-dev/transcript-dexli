<script lang="ts">
	import Wordmark from '$lib/components/Wordmark.svelte';
	import SiteFooter from '$lib/components/SiteFooter.svelte';
	import ChatMessage from '$lib/components/ChatMessage.svelte';
	import DropZone from '$lib/components/DropZone.svelte';
	import { parseJsonl } from '$lib/transcript/parse';
	import { scanSecrets, type SecretHit } from '$lib/transcript/secrets';
	import { SAMPLE_JSONL } from '$lib/transcript/sample';
	import type { ParseResult, Role } from '$lib/transcript/types';

	const SEO = {
		title: 'transcript — read LLM .jsonl logs as a conversation · dexli.dev',
		description:
			'Drop a JSONL transcript — a Claude Code session log, an OpenAI fine-tune file, or generic chat lines — and read it as a clean conversation. Parsed entirely in your browser; nothing uploads. Flags API keys and other secrets before you share a screenshot.',
		url: 'https://transcript.dexli.dev/',
		ogImage: 'https://transcript.dexli.dev/og-card.png'
	};
	const JSON_LD = {
		'@context': 'https://schema.org',
		'@type': 'WebApplication',
		name: 'transcript.dexli.dev',
		description: SEO.description,
		url: SEO.url,
		applicationCategory: 'DeveloperApplication',
		operatingSystem: 'Any',
		offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }
	};

	const WINDOW = 300;

	let result = $state<ParseResult | null>(null);
	let hits = $state<SecretHit[]>([]);
	let filename = $state('');
	let busy = $state(false);
	let convIdx = $state(0);
	let query = $state('');
	let roleOn = $state<Record<Role, boolean>>({
		user: true,
		assistant: true,
		system: true,
		tool: true,
		unknown: true
	});
	let foldsOpen = $state(false);
	let limit = $state(WINDOW);
	let secretsOpen = $state(false);

	async function load(raw: string, name?: string) {
		busy = true;
		filename = name ?? '';
		try {
			const r = await parseJsonl(raw);
			result = r;
			hits = scanSecrets(r.conversations);
			convIdx = 0;
			query = '';
			limit = WINDOW;
			foldsOpen = false;
			secretsOpen = false;
		} finally {
			busy = false;
		}
	}

	function reset() {
		result = null;
		hits = [];
		filename = '';
	}

	const conv = $derived(result?.conversations[convIdx]);

	const filtered = $derived.by(() => {
		if (!conv) return [];
		const q = query.trim().toLowerCase();
		return conv.messages.filter((m) => {
			if (!roleOn[m.role]) return false;
			if (q === '') return true;
			return m.blocks.some((b) => {
				const t =
					b.kind === 'tool_use'
						? b.name + ' ' + b.input
						: b.kind === 'other'
							? b.note + ' ' + b.raw
							: 'text' in b
								? b.text
								: '';
				return t.toLowerCase().includes(q);
			});
		});
	});

	const visible = $derived(filtered.slice(0, limit));

	const flaggedSet = $derived(new Set(hits.map((h) => `${h.convIndex}:${h.msgIndex}`)));

	const roleCounts = $derived.by(() => {
		const counts: Record<Role, number> = { user: 0, assistant: 0, system: 0, tool: 0, unknown: 0 };
		if (conv) for (const m of conv.messages) counts[m.role]++;
		return counts;
	});

	function spanLabel(span?: [string, string]): string {
		if (!span) return '';
		const a = new Date(span[0]);
		const b = new Date(span[1]);
		if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return '';
		const mins = Math.round((b.getTime() - a.getTime()) / 60000);
		const dur = mins >= 90 ? `${(mins / 60).toFixed(1)} h` : `${mins} min`;
		return `${a.toISOString().slice(0, 10)} · ${dur}`;
	}

	function jumpTo(h: SecretHit) {
		if (h.convIndex !== convIdx) {
			convIdx = h.convIndex;
			limit = Math.max(limit, h.msgIndex + 50);
		}
		if (h.msgIndex >= limit) limit = h.msgIndex + 50;
		requestAnimationFrame(() => {
			document.getElementById(`m-${h.convIndex}-${h.msgIndex}`)?.scrollIntoView({
				behavior: 'smooth',
				block: 'center'
			});
		});
	}

	const ROLES: Role[] = ['user', 'assistant', 'tool', 'system', 'unknown'];

	const DIALECT_LABEL: Record<string, string> = {
		'claude-code': 'Claude Code session',
		'openai-chat': 'OpenAI chat / fine-tune',
		'prompt-reply': 'prompt/reply pairs',
		'generic-chat': 'generic chat lines',
		unknown: 'unrecognized'
	};
</script>

<svelte:head>
	<title>{SEO.title}</title>
	<meta name="description" content={SEO.description} />
	<link rel="canonical" href={SEO.url} />
	<meta name="robots" content="index,follow" />

	<meta property="og:type" content="website" />
	<meta property="og:url" content={SEO.url} />
	<meta property="og:title" content={SEO.title} />
	<meta property="og:description" content={SEO.description} />
	<meta property="og:image" content={SEO.ogImage} />

	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={SEO.title} />
	<meta name="twitter:description" content={SEO.description} />
	<meta name="twitter:image" content={SEO.ogImage} />

	{@html `<script type="application/ld+json">${JSON.stringify(JSON_LD)}</script>`}
</svelte:head>

<div class="page">
	<header class="top wrap">
		<Wordmark />
		<span class="privacy" title="The file is read with the browser's FileReader and parsed in this tab. There is no upload endpoint.">
			⛨ local-only — nothing uploads
		</span>
	</header>

	<main class="wrap">
		{#if !result}
			<section class="hero">
				<h1>Read <span class="hl">.jsonl</span> transcripts like a conversation.</h1>
				<p class="tag">
					LLM session logs are unreadable raw — one JSON blob per line. Drop one here and read it
					as a chat: tool calls folded, thinking blocks tucked away, subagent chatter marked.
					Parsing happens <strong>in your browser</strong>; transcripts are sensitive and this page
					has no upload endpoint to leak them to.
				</p>
				<DropZone onload={load} onsample={() => load(SAMPLE_JSONL, 'sample session')} {busy} />
				<p class="dialects">
					understands: <span class="d">Claude Code session logs</span> ·
					<span class="d">OpenAI chat / fine-tune files</span> ·
					<span class="d">{'{prompt, reply}'} eval/bench logs</span> ·
					<span class="d">generic {'{role, content}'} lines</span>
				</p>
			</section>
		{:else}
			<section class="reader">
				<div class="bar">
					<div class="facts">
						<span class="chip strong">{DIALECT_LABEL[result.dialect]}</span>
						{#if filename}<span class="chip">{filename}</span>{/if}
						<span class="chip">{result.stats.messages} messages</span>
						{#if result.stats.toolCalls > 0}<span class="chip">{result.stats.toolCalls} tool call{result.stats.toolCalls === 1 ? '' : 's'}</span>{/if}
						{#if result.stats.sidechainMessages > 0}<span class="chip">{result.stats.sidechainMessages} sidechain</span>{/if}
						{#each result.stats.models as m (m)}<span class="chip dim">{m}</span>{/each}
						{#if spanLabel(result.stats.span)}<span class="chip dim">{spanLabel(result.stats.span)}</span>{/if}
						{#if result.errors.length > 0}
							<span class="chip warn" title={result.errors.slice(0, 5).map((e) => `line ${e.line}: ${e.message}`).join('\n')}>
								{result.errors.length} unparsed line{result.errors.length === 1 ? '' : 's'}
							</span>
						{/if}
					</div>
					<button type="button" class="ghost" onclick={reset}>read another file</button>
				</div>

				{#if hits.length > 0}
					<div class="secrets" role="alert">
						<button type="button" class="secrets-head" onclick={() => (secretsOpen = !secretsOpen)}>
							⚠ {hits.length} potential secret{hits.length === 1 ? '' : 's'} in this transcript —
							check before you screenshot or share. <span class="dim">{secretsOpen ? 'hide' : 'show'}</span>
						</button>
						{#if secretsOpen}
							<ul>
								{#each hits as h, i (i)}
									<li>
										<span class="kind">{h.label}</span>
										<code>{h.preview}</code>
										<button type="button" class="jump" onclick={() => jumpTo(h)}>line {h.line} ↓</button>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				{/if}

				{#if result.dialect === 'unknown'}
					<div class="nope">
						<p>
							Couldn't recognize a transcript shape in this file. It parses as JSONL (or mostly
							does), but the lines don't look like Claude Code sessions, OpenAI chat files, or
							generic {'{role, content}'} messages.
						</p>
						{#if result.errors.length > 0}
							<p class="dim">
								First parse error — line {result.errors[0].line}: {result.errors[0].message}
							</p>
						{/if}
					</div>
				{:else}
					<div class="controls">
						{#if result.conversations.length > 1}
							<select bind:value={convIdx} aria-label="Pick conversation">
								{#each result.conversations as c, i (i)}
									<option value={i}>{c.title ?? `conversation ${i + 1}`} ({c.messages.length})</option>
								{/each}
							</select>
						{/if}
						<input
							type="search"
							placeholder="search messages…"
							bind:value={query}
							aria-label="Search messages"
						/>
						<div class="filters" role="group" aria-label="Filter by role">
							{#each ROLES as r (r)}
								{#if roleCounts[r] > 0}
									<button
										type="button"
										class="filter"
										class:off={!roleOn[r]}
										aria-pressed={roleOn[r]}
										onclick={() => (roleOn[r] = !roleOn[r])}
									>
										{r} <span class="n">{roleCounts[r]}</span>
									</button>
								{/if}
							{/each}
						</div>
						<button type="button" class="ghost" onclick={() => (foldsOpen = !foldsOpen)}>
							{foldsOpen ? 'collapse' : 'expand'} tools & thinking
						</button>
					</div>

					<div class="count" aria-live="polite">
						{#if query.trim() !== '' || Object.values(roleOn).some((v) => !v)}
							{filtered.length} of {conv?.messages.length ?? 0} messages match
						{/if}
					</div>

					<div class="thread">
						{#each visible as m (m.i)}
							<ChatMessage
								msg={m}
								{foldsOpen}
								id={`m-${convIdx}-${m.i}`}
								flagged={flaggedSet.has(`${convIdx}:${m.i}`)}
							/>
						{/each}
					</div>

					{#if filtered.length > limit}
						<button type="button" class="more" onclick={() => (limit += WINDOW)}>
							show {Math.min(WINDOW, filtered.length - limit)} more ({filtered.length - limit} hidden)
						</button>
					{/if}
				{/if}
			</section>
		{/if}
	</main>

	<SiteFooter />
</div>

<style>
	.page {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}
	.wrap {
		width: 100%;
		max-width: var(--maxw);
		margin: 0 auto;
		padding: 0 24px;
	}
	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-top: 22px;
		padding-bottom: 10px;
	}
	.privacy {
		font-size: 11px;
		color: var(--accent-dim);
		border: 1px solid var(--border);
		border-radius: 99px;
		padding: 3px 10px;
		cursor: help;
	}
	main {
		flex: 1;
		padding-bottom: 48px;
	}

	/* hero */
	.hero {
		max-width: 760px;
		margin: 7vh auto 0;
	}
	h1 {
		font-size: clamp(30px, 5vw, 46px);
		margin-bottom: 14px;
	}
	.hl {
		color: var(--accent);
	}
	.tag {
		color: var(--muted);
		font-size: 14px;
		line-height: 1.7;
		margin: 0 0 26px;
	}
	.tag strong {
		color: var(--fg);
	}
	.dialects {
		margin-top: 18px;
		font-size: 12px;
		color: var(--text-faint);
		text-align: center;
	}
	.dialects .d {
		color: var(--muted);
	}

	/* reader */
	.reader {
		margin-top: 10px;
	}
	.bar {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		flex-wrap: wrap;
		margin-bottom: 12px;
	}
	.facts {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}
	.chip {
		border: 1px solid var(--border);
		border-radius: 99px;
		padding: 2px 10px;
		font-size: 11px;
		color: var(--muted);
		background: var(--surface);
	}
	.chip.strong {
		color: var(--accent);
		border-color: var(--accent-dim);
	}
	.chip.dim {
		color: var(--text-faint);
	}
	.chip.warn {
		color: #e8a07e;
		border-color: #b3552f;
		cursor: help;
	}

	.ghost {
		background: none;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		color: var(--muted);
		font-size: 12px;
		padding: 6px 12px;
		white-space: nowrap;
	}
	.ghost:hover {
		color: var(--fg);
		border-color: var(--accent-dim);
	}

	/* secrets banner */
	.secrets {
		border: 1px solid #b3552f;
		border-radius: var(--radius-sm);
		background: rgba(179, 85, 47, 0.08);
		margin-bottom: 14px;
	}
	.secrets-head {
		display: block;
		width: 100%;
		text-align: left;
		background: none;
		border: none;
		color: #e8a07e;
		font-family: var(--mono);
		font-size: 12px;
		padding: 9px 12px;
	}
	.secrets-head .dim {
		color: var(--text-faint);
		margin-left: 6px;
	}
	.secrets ul {
		list-style: none;
		margin: 0;
		padding: 0 12px 10px;
	}
	.secrets li {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 12px;
		padding: 3px 0;
		flex-wrap: wrap;
	}
	.secrets .kind {
		color: var(--muted);
		min-width: 180px;
	}
	.secrets code {
		color: #e8a07e;
	}
	.jump {
		background: none;
		border: none;
		color: var(--accent);
		font-family: var(--mono);
		font-size: 11px;
		padding: 0;
	}
	.jump:hover {
		text-decoration: underline;
	}

	.nope {
		border: 1px dashed var(--border);
		border-radius: var(--radius);
		padding: 18px;
		color: var(--muted);
		font-size: 13px;
	}

	/* controls */
	.controls {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
		margin-bottom: 4px;
	}
	input[type='search'],
	select {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		color: var(--fg);
		font-family: var(--mono);
		font-size: 12px;
		padding: 7px 10px;
	}
	input[type='search'] {
		flex: 1;
		min-width: 180px;
	}
	.filters {
		display: flex;
		gap: 4px;
		flex-wrap: wrap;
	}
	.filter {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 99px;
		color: var(--fg);
		font-size: 11px;
		padding: 4px 10px;
	}
	.filter .n {
		color: var(--text-faint);
		font-size: 10px;
	}
	.filter.off {
		color: var(--text-faint);
		background: none;
		text-decoration: line-through;
	}

	.count {
		font-size: 11px;
		color: var(--text-faint);
		min-height: 18px;
		margin-bottom: 6px;
	}

	.thread {
		display: flex;
		flex-direction: column;
	}

	.more {
		display: block;
		margin: 10px auto 0;
		background: var(--surface-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		color: var(--fg);
		font-size: 12px;
		padding: 9px 22px;
	}
	.more:hover {
		border-color: var(--accent-dim);
	}

	@media (max-width: 640px) {
		.wrap {
			padding: 0 14px;
		}
		.hero {
			margin-top: 3vh;
		}
	}
</style>
