import { describe, expect, it } from 'vitest';
import { parseJsonl } from './parse';
import { SAMPLE_JSONL } from './sample';

const ccLine = (o: object) => JSON.stringify(o);

describe('dialect detection + claude-code parsing', () => {
	it('parses a claude-code session log', async () => {
		const raw = [
			ccLine({ type: 'summary', summary: 'Fix the login bug' }),
			ccLine({
				type: 'user',
				timestamp: '2026-06-01T10:00:00.000Z',
				message: { role: 'user', content: 'why does login 500?' }
			}),
			ccLine({
				type: 'assistant',
				timestamp: '2026-06-01T10:00:05.000Z',
				message: {
					role: 'assistant',
					model: 'claude-fable-5',
					content: [
						{ type: 'thinking', thinking: 'check the auth middleware' },
						{ type: 'text', text: 'Looking at the middleware now.' },
						{ type: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'auth.ts' } }
					]
				}
			}),
			ccLine({
				type: 'user',
				timestamp: '2026-06-01T10:00:06.000Z',
				message: {
					role: 'user',
					content: [{ type: 'tool_result', tool_use_id: 't1', content: 'export const auth = ...' }]
				}
			})
		].join('\n');

		const r = await parseJsonl(raw);
		expect(r.dialect).toBe('claude-code');
		expect(r.errors).toHaveLength(0);
		expect(r.conversations).toHaveLength(1);

		const msgs = r.conversations[0].messages;
		// summary renders as a system note
		expect(msgs[0].role).toBe('system');
		expect(msgs[0].blocks[0]).toMatchObject({ kind: 'text' });
		// human line
		expect(msgs[1].role).toBe('user');
		// assistant line carries thinking + text + tool_use, and the model
		expect(msgs[2].role).toBe('assistant');
		expect(msgs[2].model).toBe('claude-fable-5');
		expect(msgs[2].blocks.map((b) => b.kind)).toEqual(['thinking', 'text', 'tool_use']);
		// tool_result wrapper re-roles from user → tool
		expect(msgs[3].role).toBe('tool');
		expect(msgs[3].blocks[0]).toMatchObject({ kind: 'tool_result', toolUseId: 't1' });

		expect(r.stats.toolCalls).toBe(1);
		expect(r.stats.thinkingBlocks).toBe(1);
		expect(r.stats.models).toEqual(['claude-fable-5']);
		expect(r.stats.span).toEqual(['2026-06-01T10:00:00.000Z', '2026-06-01T10:00:06.000Z']);
	});

	it('marks sidechain messages and skips bookkeeping lines', async () => {
		const raw = [
			ccLine({ type: 'file-history-snapshot', snapshot: { x: 1 } }),
			ccLine({ type: 'progress', data: 'spinning' }),
			ccLine({
				type: 'assistant',
				isSidechain: true,
				message: { role: 'assistant', content: 'subagent reporting in' }
			})
		].join('\n');
		const r = await parseJsonl(raw);
		expect(r.dialect).toBe('claude-code');
		expect(r.conversations[0].messages).toHaveLength(1);
		expect(r.conversations[0].messages[0].sidechain).toBe(true);
		expect(r.stats.sidechainMessages).toBe(1);
	});

	it('parses the built-in sample', async () => {
		const r = await parseJsonl(SAMPLE_JSONL);
		expect(r.dialect).toBe('claude-code');
		expect(r.errors).toHaveLength(0);
		expect(r.stats.messages).toBeGreaterThanOrEqual(7);
		expect(r.stats.sidechainMessages).toBe(1);
	});
});

describe('openai-chat parsing', () => {
	it('treats each line as a conversation', async () => {
		const raw = [
			JSON.stringify({
				messages: [
					{ role: 'system', content: 'You are terse.' },
					{ role: 'user', content: 'hi' },
					{ role: 'assistant', content: 'hello' }
				]
			}),
			JSON.stringify({
				messages: [
					{ role: 'user', content: 'two plus two' },
					{ role: 'assistant', content: 'four' }
				]
			})
		].join('\n');
		const r = await parseJsonl(raw);
		expect(r.dialect).toBe('openai-chat');
		expect(r.conversations).toHaveLength(2);
		expect(r.conversations[0].messages.map((m) => m.role)).toEqual(['system', 'user', 'assistant']);
		expect(r.stats.messages).toBe(5);
	});
});

describe('prompt-reply parsing (eval/bench logs)', () => {
	it('parses a bench run: header line + probe lines + capability calls', async () => {
		const raw = [
			JSON.stringify({
				model: 'gemma4:12b-it-qat',
				started: '2026-06-10T20:35:21+02:00',
				finished: '2026-06-10T21:03:41+02:00',
				probes: 2,
				kernel_commit: 'a6e41cb'
			}),
			JSON.stringify({
				probe_id: 'hist-01',
				category: 'history',
				prompt: 'What are you named after?',
				reply: 'A jam brand.',
				ms: 22325,
				capability_calls: []
			}),
			JSON.stringify({
				probe_id: 'mis-04',
				category: 'mission',
				prompt: 'What is the mission?',
				reply: 'Order from complexity.',
				ms: 18001,
				capability_calls: [{ op: 'engram.search', resultSummary: '[{"layer":"L2","score":0.5}]' }]
			})
		].join('\n');

		const r = await parseJsonl(raw);
		expect(r.dialect).toBe('prompt-reply');
		expect(r.errors).toHaveLength(0);
		const msgs = r.conversations[0].messages;
		// header system note + 2 × (user + assistant)
		expect(msgs).toHaveLength(5);
		expect(msgs[0].role).toBe('system');
		expect(msgs[0].blocks[0]).toMatchObject({ kind: 'text' });
		expect((msgs[0].blocks[0] as { text: string }).text).toContain('gemma4:12b-it-qat');
		// probe → user with id·category note
		expect(msgs[1].role).toBe('user');
		expect(msgs[1].note).toBe('hist-01 · history');
		// reply → assistant with run model + latency note
		expect(msgs[2].role).toBe('assistant');
		expect(msgs[2].model).toBe('gemma4:12b-it-qat');
		expect(msgs[2].note).toBe('22325 ms');
		// capability call → tool_use + tool_result ahead of the reply text
		expect(msgs[4].blocks.map((b) => b.kind)).toEqual(['tool_use', 'tool_result', 'text']);
		expect(msgs[4].blocks[0]).toMatchObject({ kind: 'tool_use', name: 'engram.search' });
		// run span: header started → finished donated to the last message
		expect(r.stats.span).toEqual(['2026-06-10T20:35:21+02:00', '2026-06-10T21:03:41+02:00']);
		expect(r.stats.models).toEqual(['gemma4:12b-it-qat']);
		expect(r.stats.toolCalls).toBe(1);
	});

	it('accepts question/answer and input/output alias pairs', async () => {
		const qa = await parseJsonl(JSON.stringify({ question: '2+2?', answer: '4' }));
		expect(qa.dialect).toBe('prompt-reply');
		expect(qa.conversations[0].messages.map((m) => m.role)).toEqual(['user', 'assistant']);
		const io = await parseJsonl(JSON.stringify({ input: 'ping', output: 'pong' }));
		expect(io.dialect).toBe('prompt-reply');
		expect(io.conversations[0].messages).toHaveLength(2);
	});

	it('does not misdetect role-shaped lines as prompt-reply', async () => {
		const r = await parseJsonl(JSON.stringify({ role: 'user', content: 'plain chat line' }));
		expect(r.dialect).toBe('generic-chat');
	});
});

describe('generic-chat parsing', () => {
	it('accepts {role, content} lines', async () => {
		const raw = [
			JSON.stringify({ role: 'user', content: 'ping', timestamp: '2026-01-01T00:00:00Z' }),
			JSON.stringify({ role: 'assistant', content: 'pong' })
		].join('\n');
		const r = await parseJsonl(raw);
		expect(r.dialect).toBe('generic-chat');
		expect(r.conversations[0].messages).toHaveLength(2);
		expect(r.conversations[0].messages[0].ts).toBe('2026-01-01T00:00:00Z');
	});

	it('accepts speaker/text shaped lines', async () => {
		const raw = [
			JSON.stringify({ speaker: 'human', text: 'hello there' }),
			JSON.stringify({ speaker: 'bot', text: 'general kenobi' })
		].join('\n');
		const r = await parseJsonl(raw);
		expect(r.dialect).toBe('generic-chat');
		expect(r.conversations[0].messages.map((m) => m.role)).toEqual(['user', 'assistant']);
	});
});

describe('robustness', () => {
	it('collects per-line errors without aborting the file', async () => {
		const raw = [
			JSON.stringify({ role: 'user', content: 'good line' }),
			'{not json at all',
			'"just a string"',
			JSON.stringify({ role: 'assistant', content: 'still parsed' })
		].join('\n');
		const r = await parseJsonl(raw);
		expect(r.errors).toHaveLength(2);
		expect(r.errors[0].line).toBe(2);
		expect(r.errors[1].line).toBe(3);
		expect(r.conversations[0].messages).toHaveLength(2);
	});

	it('handles empty input and blank lines', async () => {
		expect((await parseJsonl('')).dialect).toBe('unknown');
		const r = await parseJsonl('\n\n  \n');
		expect(r.dialect).toBe('unknown');
		expect(r.conversations).toHaveLength(0);
		expect(r.errors).toHaveLength(0);
	});

	it('caps pathological block sizes', async () => {
		const huge = 'x'.repeat(300_000);
		const r = await parseJsonl(JSON.stringify({ role: 'user', content: huge }));
		const block = r.conversations[0].messages[0].blocks[0];
		expect(block.kind).toBe('text');
		if (block.kind === 'text') {
			expect(block.text.length).toBeLessThan(210_000);
			expect(block.text).toContain('[truncated');
		}
	});

	it('yields between chunks and reports progress on large files', async () => {
		const raw = Array.from({ length: 5000 }, (_, i) =>
			JSON.stringify({ role: i % 2 ? 'assistant' : 'user', content: `msg ${i}` })
		).join('\n');
		const ticks: number[] = [];
		const r = await parseJsonl(raw, { chunkSize: 1000, onProgress: (done) => ticks.push(done) });
		expect(r.stats.messages).toBe(5000);
		expect(ticks.length).toBeGreaterThanOrEqual(5);
	});
});
