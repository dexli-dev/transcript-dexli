<script lang="ts">
	// File intake: drag-drop, picker, or paste. Hands raw text up to the page;
	// no transcript byte leaves the browser (there is nothing here that could
	// even send one — no fetch, no form action).
	interface Props {
		onload: (raw: string, filename?: string) => void;
		onsample: () => void;
		busy?: boolean;
	}
	let { onload, onsample, busy = false }: Props = $props();

	import { firstFileText } from '$lib/intake';

	let dragging = $state(false);
	let pasting = $state(false);
	let pasteText = $state('');
	let fileInput: HTMLInputElement | undefined = $state();

	async function handleFiles(files: FileList | null) {
		const got = await firstFileText(files);
		if (!got) return;
		onload(got.raw, got.name);
	}

	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		handleFiles(e.dataTransfer?.files ?? null);
	}

	function submitPaste() {
		if (pasteText.trim() === '') return;
		onload(pasteText, 'pasted text');
		pasteText = '';
		pasting = false;
	}
</script>

<div
	class="zone"
	class:dragging
	role="button"
	tabindex="0"
	aria-label="Open a JSONL transcript file"
	ondragover={(e) => {
		e.preventDefault();
		dragging = true;
	}}
	ondragleave={() => (dragging = false)}
	ondrop={onDrop}
	onclick={() => fileInput?.click()}
	onkeydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			fileInput?.click();
		}
	}}
>
	<input
		bind:this={fileInput}
		type="file"
		accept=".jsonl,.json,.txt,application/jsonl,application/x-ndjson"
		hidden
		onchange={(e) => handleFiles(e.currentTarget.files)}
	/>
	<div class="art" aria-hidden="true">❝</div>
	{#if busy}
		<p class="lead">parsing…</p>
	{:else}
		<p class="lead">drop a <code>.jsonl</code> transcript here</p>
		<p class="sub">or click to pick a file</p>
	{/if}
</div>

<div class="alt">
	<button type="button" class="ghost" onclick={() => (pasting = !pasting)}>
		{pasting ? 'cancel paste' : 'paste JSONL instead'}
	</button>
	<button type="button" class="ghost" onclick={onsample}>load the sample</button>
</div>

{#if pasting}
	<div class="paste">
		<textarea
			bind:value={pasteText}
			rows="8"
			placeholder={'{"type":"user","message":{"role":"user","content":"…"}}\n{"type":"assistant", …}'}
		></textarea>
		<button type="button" class="primary" onclick={submitPaste} disabled={pasteText.trim() === ''}>
			read it
		</button>
	</div>
{/if}

<style>
	.zone {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		padding: 56px 24px;
		border: 2px dashed var(--border);
		border-radius: var(--radius);
		background: var(--surface);
		cursor: pointer;
		transition: border-color 120ms ease, background 120ms ease;
		text-align: center;
	}
	.zone:hover,
	.zone.dragging {
		border-color: var(--accent);
		background: var(--surface-2);
	}
	.art {
		font-size: 40px;
		color: var(--accent);
		line-height: 1;
		text-shadow: 0 0 30px var(--accent-glow);
	}
	.lead {
		margin: 8px 0 0;
		font-size: 16px;
		color: var(--fg);
	}
	.lead code {
		color: var(--accent);
	}
	.sub {
		margin: 0;
		font-size: 12px;
		color: var(--muted);
	}

	.alt {
		display: flex;
		gap: 10px;
		justify-content: center;
		margin-top: 12px;
	}
	.ghost {
		background: none;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		color: var(--muted);
		font-size: 12px;
		padding: 6px 12px;
	}
	.ghost:hover {
		color: var(--fg);
		border-color: var(--accent-dim);
	}

	.paste {
		margin-top: 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	textarea {
		width: 100%;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		color: var(--fg);
		font-family: var(--mono);
		font-size: 12px;
		padding: 10px;
		resize: vertical;
	}
	.primary {
		align-self: flex-end;
		background: var(--accent);
		color: #0a0b0d;
		border: none;
		border-radius: var(--radius-sm);
		font-weight: 700;
		font-size: 13px;
		padding: 8px 18px;
	}
	.primary:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
</style>
