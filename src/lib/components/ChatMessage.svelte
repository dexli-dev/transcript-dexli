<script lang="ts">
	// One transcript message. All content renders through text nodes — never
	// {@html} — so a hostile transcript can't script the page (CSP backstops
	// this, but the first line of defense is simply not rendering HTML).
	import type { Msg } from '$lib/transcript/types';

	interface Props {
		msg: Msg;
		/** force-open state for tool/thinking folds (expand-all control) */
		foldsOpen?: boolean;
		/** DOM id so the secret banner can jump here */
		id?: string;
		/** highlight when a secret hit points at this message */
		flagged?: boolean;
	}
	let { msg, foldsOpen = false, id, flagged = false }: Props = $props();

	const ROLE_LABEL: Record<string, string> = {
		user: 'user',
		assistant: 'assistant',
		system: 'system',
		tool: 'tool result',
		unknown: '?'
	};

	function clock(ts?: string): string {
		if (!ts) return '';
		const d = new Date(ts);
		if (Number.isNaN(d.getTime())) return ts;
		return d.toISOString().slice(11, 19) + ' UTC';
	}

	function trim(s: string, n: number): string {
		return s.length > n ? s.slice(0, n) + ` … [${s.length - n} more chars — expand to read in place]` : s;
	}
</script>

<article
	{id}
	class="msg role-{msg.role}"
	class:sidechain={msg.sidechain}
	class:flagged
>
	<header class="meta">
		<span class="role">{ROLE_LABEL[msg.role]}</span>
		{#if msg.sidechain}<span class="chip side">sidechain</span>{/if}
		{#if msg.model}<span class="chip model">{msg.model}</span>{/if}
		{#if msg.note}<span class="chip">{msg.note}</span>{/if}
		{#if flagged}<span class="chip flag">⚠ secret flagged</span>{/if}
		<span class="spacer"></span>
		{#if msg.ts}<time datetime={msg.ts}>{clock(msg.ts)}</time>{/if}
		<span class="line">L{msg.line}</span>
	</header>

	{#each msg.blocks as block, bi (bi)}
		{#if block.kind === 'text'}
			<div class="text">{block.text}</div>
		{:else if block.kind === 'thinking'}
			<details class="fold thinking" open={foldsOpen}>
				<summary>thinking <span class="hint">{block.text.length} chars</span></summary>
				<div class="text dim">{block.text}</div>
			</details>
		{:else if block.kind === 'tool_use'}
			<details class="fold tool" open={foldsOpen}>
				<summary>⚙ {block.name} <span class="hint">tool call</span></summary>
				<pre class="io">{block.input}</pre>
			</details>
		{:else if block.kind === 'tool_result'}
			<details class="fold result" class:error={block.isError} open={foldsOpen}>
				<summary>
					{block.isError ? '✗ tool result (error)' : '→ tool result'}
					<span class="hint">{block.text.length} chars</span>
				</summary>
				<pre class="io">{trim(block.text, 20000)}</pre>
			</details>
		{:else if block.kind === 'image'}
			<div class="text dim">🖼 {block.note}</div>
		{:else}
			<details class="fold other" open={foldsOpen}>
				<summary>{block.note}</summary>
				<pre class="io">{block.raw}</pre>
			</details>
		{/if}
	{/each}
</article>

<style>
	.msg {
		border: 1px solid var(--border-soft);
		border-left: 3px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface);
		padding: 10px 14px 12px;
		margin: 0 0 10px;
		overflow-wrap: anywhere;
	}
	.msg.role-user {
		border-left-color: var(--accent);
		background: var(--surface-2);
	}
	.msg.role-assistant {
		border-left-color: #5b8af5;
	}
	.msg.role-system {
		border-left-color: var(--text-faint);
		opacity: 0.85;
	}
	.msg.role-tool {
		border-left-color: #3f4754;
	}
	.msg.sidechain {
		border-style: dashed;
		margin-left: 26px;
	}
	.msg.flagged {
		border-color: #b3552f;
		box-shadow: 0 0 0 1px rgba(214, 106, 61, 0.35);
	}

	.meta {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 11px;
		color: var(--muted);
		margin-bottom: 6px;
	}
	.role {
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
	}
	.role-user .role {
		color: var(--accent);
	}
	.role-assistant .role {
		color: #8badf7;
	}
	.chip {
		border: 1px solid var(--border);
		border-radius: 99px;
		padding: 0 8px;
		font-size: 10px;
		line-height: 1.7;
		color: var(--muted);
	}
	.chip.side {
		border-style: dashed;
	}
	.chip.flag {
		color: #e8a07e;
		border-color: #b3552f;
	}
	.spacer {
		flex: 1;
	}
	time,
	.line {
		color: var(--text-faint);
		font-size: 10px;
	}

	.text {
		white-space: pre-wrap;
		font-size: 13px;
	}
	.text.dim {
		color: var(--muted);
	}

	.fold {
		margin: 6px 0;
		border: 1px solid var(--border-soft);
		border-radius: var(--radius-sm);
		background: var(--surface-2);
	}
	.fold summary {
		cursor: pointer;
		padding: 5px 10px;
		font-size: 12px;
		color: var(--muted);
		user-select: none;
	}
	.fold summary:hover {
		color: var(--fg);
	}
	.fold .hint {
		color: var(--text-faint);
		font-size: 10px;
		margin-left: 6px;
	}
	.fold.thinking summary {
		font-style: italic;
	}
	.fold.result.error summary {
		color: #e8a07e;
	}
	.fold .text,
	.fold .io {
		padding: 8px 10px 10px;
		border-top: 1px solid var(--border-soft);
		margin: 0;
	}
	.io {
		font-size: 12px;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		max-height: 420px;
		overflow-y: auto;
		color: var(--fg);
	}

	@media (max-width: 640px) {
		.msg.sidechain {
			margin-left: 10px;
		}
	}
</style>
