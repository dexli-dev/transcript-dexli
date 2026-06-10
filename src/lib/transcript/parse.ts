// JSONL transcript parser — pure functions, no DOM. Three dialects normalize
// into the shared types so the UI renders one shape.
//
// Dialect notes (from real-world files, not specs):
//
// claude-code — Claude Code session logs (~/.claude/projects/**/*.jsonl).
//   One JSON object per line. Lines of `type` 'user'|'assistant' carry a
//   `message` ({role, content}) where content is a string or an array of
//   blocks ({type:'text'|'thinking'|'tool_use'|'tool_result'|'image', ...}).
//   tool_result lines arrive as type:'user' wrappers — we re-role them to
//   'tool' so the reading flow distinguishes "the human typed this" from
//   "the harness returned this". Other line types: 'summary' (compaction
//   titles), 'system' (hook/harness notices), 'progress', 'file-history-
//   snapshot' etc. — rendered as system notes or skipped (pure bookkeeping).
//   `isSidechain: true` marks subagent traffic.
//
// openai-chat — fine-tune / batch format: each line is a complete
//   conversation: {"messages": [{role, content}, ...]}. A file is therefore
//   a LIST of conversations.
//
// prompt-reply — eval/bench logs: one {prompt, reply} pair per line (aliases
//   question/answer, input/output), optionally annotated with probe ids,
//   categories, latency and capability/tool calls. A header line carrying
//   run metadata ({model, started, finished, …}, no pair) renders as a
//   system note and donates its model/timestamps to the run.
//
// generic-chat — one {role|speaker|from, content|text|message} object per
//   line; single conversation. The escape hatch for everything else.

import type {
	Block,
	Conversation,
	Dialect,
	Msg,
	ParseError,
	ParseResult,
	Role,
	Stats
} from './types';

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const MAX_BLOCK_CHARS = 200_000; // hard cap per block so one pathological line can't wedge rendering

function cap(s: string): string {
	if (s.length <= MAX_BLOCK_CHARS) return s;
	return s.slice(0, MAX_BLOCK_CHARS) + `\n… [truncated ${s.length - MAX_BLOCK_CHARS} chars]`;
}

function asText(v: unknown): string {
	if (typeof v === 'string') return v;
	if (v == null) return '';
	try {
		return JSON.stringify(v, null, 2);
	} catch {
		return String(v);
	}
}

function normRole(r: unknown): Role {
	const s = String(r ?? '').toLowerCase();
	if (s === 'user' || s === 'human') return 'user';
	if (s === 'assistant' || s === 'ai' || s === 'model' || s === 'bot') return 'assistant';
	if (s === 'system' || s === 'developer') return 'system';
	if (s === 'tool' || s === 'function') return 'tool';
	return 'unknown';
}

type Json = Record<string, unknown>;

function isObj(v: unknown): v is Json {
	return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/* ------------------------------------------------------------------ */
/* content-block normalization (shared by claude-code + openai array)  */
/* ------------------------------------------------------------------ */

function normBlocks(content: unknown): Block[] {
	if (typeof content === 'string') {
		return content.trim() === '' ? [] : [{ kind: 'text', text: cap(content) }];
	}
	if (!Array.isArray(content)) {
		return content == null ? [] : [{ kind: 'other', note: 'unrecognized content', raw: cap(asText(content)) }];
	}
	const out: Block[] = [];
	for (const b of content) {
		if (typeof b === 'string') {
			if (b.trim() !== '') out.push({ kind: 'text', text: cap(b) });
			continue;
		}
		if (!isObj(b)) continue;
		const t = String(b.type ?? '');
		if (t === 'text' || t === 'input_text' || t === 'output_text') {
			const text = asText(b.text ?? b.content ?? '');
			if (text.trim() !== '') out.push({ kind: 'text', text: cap(text) });
		} else if (t === 'thinking' || t === 'redacted_thinking' || t === 'reasoning') {
			out.push({
				kind: 'thinking',
				text: cap(asText(b.thinking ?? b.text ?? b.summary ?? '[redacted]'))
			});
		} else if (t === 'tool_use' || t === 'tool_call' || t === 'function_call') {
			out.push({
				kind: 'tool_use',
				name: String(b.name ?? b.tool ?? 'tool'),
				input: cap(asText(b.input ?? b.arguments ?? {})),
				id: typeof b.id === 'string' ? b.id : undefined
			});
		} else if (t === 'tool_result' || t === 'function_result') {
			out.push({
				kind: 'tool_result',
				text: cap(asText(flattenResultContent(b.content ?? b.output ?? ''))),
				isError: b.is_error === true,
				toolUseId: typeof b.tool_use_id === 'string' ? b.tool_use_id : undefined
			});
		} else if (t === 'image' || t === 'input_image') {
			out.push({ kind: 'image', note: 'image attachment (not rendered)' });
		} else {
			out.push({ kind: 'other', note: t || 'unknown block', raw: cap(asText(b)) });
		}
	}
	return out;
}

/** tool_result.content may itself be an array of {type:'text'|'image'} blocks. */
function flattenResultContent(c: unknown): string {
	if (typeof c === 'string') return c;
	if (Array.isArray(c)) {
		return c
			.map((p) => {
				if (typeof p === 'string') return p;
				if (isObj(p) && p.type === 'text') return asText(p.text ?? '');
				if (isObj(p) && p.type === 'image') return '[image]';
				return asText(p);
			})
			.join('\n');
	}
	return asText(c);
}

/* ------------------------------------------------------------------ */
/* dialect detection                                                   */
/* ------------------------------------------------------------------ */

const CC_LINE_TYPES = new Set([
	'user',
	'assistant',
	'system',
	'summary',
	'progress',
	'file-history-snapshot',
	'queued-command',
	'x-compact-boundary'
]);

const PR_ALIASES: ReadonlyArray<readonly [string, string]> = [
	['prompt', 'reply'],
	['question', 'answer'],
	['input', 'output']
];

/** {prompt, reply}-shaped line (or an alias pair)? Returns the pair. */
function prPair(o: Json): readonly [string, string] | null {
	for (const [p, r] of PR_ALIASES) {
		if (typeof o[p] === 'string' && typeof o[r] === 'string') {
			return [o[p] as string, o[r] as string];
		}
	}
	return null;
}

export function detectDialect(objs: Json[]): Dialect {
	if (objs.length === 0) return 'unknown';
	let cc = 0;
	let oa = 0;
	let pr = 0;
	let gen = 0;
	for (const o of objs.slice(0, 50)) {
		const t = typeof o.type === 'string' ? o.type : '';
		if (CC_LINE_TYPES.has(t) && (isObj(o.message) || t !== 'user')) cc++;
		else if (Array.isArray(o.messages)) oa++;
		else if (prPair(o)) pr++;
		else if ('role' in o || 'speaker' in o || 'from' in o) gen++;
	}
	const max = Math.max(cc, oa, pr, gen);
	if (max === 0) return 'unknown';
	if (max === cc) return 'claude-code';
	if (max === oa) return 'openai-chat';
	if (max === pr) return 'prompt-reply';
	return 'generic-chat';
}

/* ------------------------------------------------------------------ */
/* per-dialect line handling                                           */
/* ------------------------------------------------------------------ */

function claudeCodeMsg(o: Json, line: number, i: number): Msg | null {
	const t = String(o.type ?? '');
	if (t === 'summary') {
		const s = asText(o.summary ?? '');
		if (!s) return null;
		return {
			i,
			line,
			role: 'system',
			blocks: [{ kind: 'text', text: cap(`[conversation summary] ${s}`) }]
		};
	}
	if (t === 'system') {
		const text = asText(o.content ?? o.text ?? '');
		if (!text.trim()) return null;
		return { i, line, role: 'system', blocks: [{ kind: 'text', text: cap(text) }], ts: tsOf(o) };
	}
	if (t !== 'user' && t !== 'assistant') return null; // progress / snapshots / queued commands — bookkeeping
	const m = isObj(o.message) ? o.message : {};
	const blocks = normBlocks(m.content);
	if (blocks.length === 0) return null;
	// tool_result wrappers arrive as type:'user' — re-role so the reader can
	// tell harness returns from actual human input.
	const onlyResults = blocks.every((b) => b.kind === 'tool_result' || b.kind === 'image');
	const hasResult = blocks.some((b) => b.kind === 'tool_result');
	const role: Role = t === 'user' && onlyResults && hasResult ? 'tool' : normRole(m.role ?? t);
	const model = typeof m.model === 'string' ? m.model : undefined;
	return {
		i,
		line,
		role,
		blocks,
		ts: tsOf(o),
		model,
		sidechain: o.isSidechain === true ? true : undefined
	};
}

function tsOf(o: Json): string | undefined {
	return typeof o.timestamp === 'string' ? o.timestamp : undefined;
}

function genericMsg(o: Json, line: number, i: number): Msg | null {
	const role = normRole(o.role ?? o.speaker ?? o.from);
	const blocks = normBlocks(o.content ?? o.text ?? o.message ?? o.value);
	if (blocks.length === 0) return null;
	const ts = typeof o.timestamp === 'string' ? o.timestamp : typeof o.ts === 'string' ? o.ts : undefined;
	return { i, line, role, blocks, ts };
}

/* ------------------------------------------------------------------ */
/* main entry                                                          */
/* ------------------------------------------------------------------ */

export interface ParseOptions {
	/** yield to the event loop every N lines so big files can't freeze the tab */
	chunkSize?: number;
	onProgress?: (done: number, total: number) => void;
}

/**
 * Parse raw JSONL text into a normalized ParseResult. Async so callers can
 * keep the tab responsive on multi-hundred-MB session logs: parsing yields
 * to the event loop between chunks.
 */
export async function parseJsonl(raw: string, opts: ParseOptions = {}): Promise<ParseResult> {
	const chunkSize = opts.chunkSize ?? 2000;
	const lines = raw.split('\n');
	const objs: { o: Json; line: number }[] = [];
	const errors: ParseError[] = [];

	for (let start = 0; start < lines.length; start += chunkSize) {
		const end = Math.min(start + chunkSize, lines.length);
		for (let k = start; k < end; k++) {
			const text = lines[k].trim();
			if (text === '') continue;
			try {
				const v = JSON.parse(text);
				if (isObj(v)) objs.push({ o: v, line: k + 1 });
				else errors.push({ line: k + 1, message: 'line is valid JSON but not an object' });
			} catch (e) {
				errors.push({ line: k + 1, message: e instanceof Error ? e.message : 'invalid JSON' });
			}
		}
		opts.onProgress?.(end, lines.length);
		if (end < lines.length) await new Promise((r) => setTimeout(r, 0));
	}

	const dialect = detectDialect(objs.map((x) => x.o));
	const conversations: Conversation[] = [];

	if (dialect === 'openai-chat') {
		for (const { o, line } of objs) {
			if (!Array.isArray(o.messages)) {
				errors.push({ line, message: 'expected {"messages": [...]} on this line' });
				continue;
			}
			const msgs: Msg[] = [];
			for (const m of o.messages) {
				if (!isObj(m)) continue;
				const msg = genericMsg(m, line, msgs.length);
				if (msg) msgs.push(msg);
			}
			if (msgs.length > 0) {
				conversations.push({ title: `conversation ${conversations.length + 1}`, messages: msgs });
			}
		}
	} else if (dialect === 'prompt-reply') {
		const msgs: Msg[] = [];
		let runModel: string | undefined;
		let finished: string | undefined;
		for (const { o, line } of objs) {
			const pair = prPair(o);
			if (!pair) {
				// metadata/header line — donate model + timestamps to the run,
				// surface the scalar facts as a system note
				if (typeof o.model === 'string') runModel = o.model;
				if (typeof o.finished === 'string') finished = o.finished;
				const facts = Object.entries(o)
					.filter(([, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
					.map(([k, v]) => `${k}: ${v}`)
					.join(' · ');
				if (facts) {
					msgs.push({
						i: msgs.length,
						line,
						role: 'system',
						blocks: [{ kind: 'text', text: cap(`[run header] ${facts}`) }],
						ts: typeof o.started === 'string' ? o.started : undefined
					});
				}
				continue;
			}
			const [prompt, reply] = pair;
			const label = [o.probe_id, o.id, o.category]
				.filter((v): v is string => typeof v === 'string')
				.join(' · ');
			msgs.push({
				i: msgs.length,
				line,
				role: 'user',
				blocks: [{ kind: 'text', text: cap(prompt) }],
				note: label || undefined
			});
			const blocks: Block[] = [];
			const calls = Array.isArray(o.capability_calls)
				? o.capability_calls
				: Array.isArray(o.tool_calls)
					? o.tool_calls
					: [];
			{
				for (const c of calls) {
					if (!isObj(c)) continue;
					blocks.push({
						kind: 'tool_use',
						name: String(c.op ?? c.name ?? c.tool ?? 'capability'),
						input: cap(asText(c.args ?? c.input ?? ''))
					});
					if (c.resultSummary != null || c.result != null) {
						blocks.push({ kind: 'tool_result', text: cap(asText(c.resultSummary ?? c.result)) });
					}
				}
			}
			blocks.push({ kind: 'text', text: cap(reply) });
			msgs.push({
				i: msgs.length,
				line,
				role: 'assistant',
				blocks,
				model: typeof o.model === 'string' ? o.model : runModel,
				note: typeof o.ms === 'number' ? `${o.ms} ms` : undefined
			});
		}
		// span closes at the run's finished timestamp when the header carried one
		if (finished && msgs.length > 0 && !msgs[msgs.length - 1].ts) {
			msgs[msgs.length - 1].ts = finished;
		}
		if (msgs.length > 0) conversations.push({ messages: msgs });
	} else if (dialect === 'claude-code' || dialect === 'generic-chat') {
		const msgs: Msg[] = [];
		for (const { o, line } of objs) {
			const msg =
				dialect === 'claude-code'
					? claudeCodeMsg(o, line, msgs.length)
					: genericMsg(o, line, msgs.length);
			if (msg) msgs.push(msg);
		}
		if (msgs.length > 0) conversations.push({ messages: msgs });
	}

	return {
		dialect,
		conversations,
		errors,
		stats: computeStats(conversations),
		totalLines: objs.length
	};
}

/* ------------------------------------------------------------------ */
/* stats                                                               */
/* ------------------------------------------------------------------ */

export function computeStats(conversations: Conversation[]): Stats {
	const byRole: Record<Role, number> = { user: 0, assistant: 0, system: 0, tool: 0, unknown: 0 };
	let toolCalls = 0;
	let thinkingBlocks = 0;
	let sidechainMessages = 0;
	const models = new Set<string>();
	let first: string | undefined;
	let last: string | undefined;
	let messages = 0;

	for (const c of conversations) {
		for (const m of c.messages) {
			messages++;
			byRole[m.role]++;
			if (m.sidechain) sidechainMessages++;
			if (m.model) models.add(m.model);
			if (m.ts) {
				if (!first || m.ts < first) first = m.ts;
				if (!last || m.ts > last) last = m.ts;
			}
			for (const b of m.blocks) {
				if (b.kind === 'tool_use') toolCalls++;
				if (b.kind === 'thinking') thinkingBlocks++;
			}
		}
	}

	return {
		messages,
		byRole,
		toolCalls,
		thinkingBlocks,
		sidechainMessages,
		models: [...models].sort(),
		span: first && last ? [first, last] : undefined
	};
}
