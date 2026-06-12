import { describe, expect, it } from 'vitest';
import { firstFileText } from './intake';

// Node 20+ provides the File constructor; FileList is browser-only, so the
// function accepts ArrayLike<File> — exactly what e.dataTransfer.files is.

const file = (content: string, name: string) => new File([content], name, { type: 'text/plain' });

describe('firstFileText (drag-drop / picker intake)', () => {
	it('returns null for null (drop with no dataTransfer)', async () => {
		expect(await firstFileText(null)).toBeNull();
	});

	it('returns null for undefined (dataTransfer absent)', async () => {
		expect(await firstFileText(undefined)).toBeNull();
	});

	it('returns null for an empty list (drop of non-file content)', async () => {
		expect(await firstFileText([])).toBeNull();
	});

	it('returns the file text and filename', async () => {
		const jsonl = '{"type":"user","message":{"role":"user","content":"hi"}}';
		const got = await firstFileText([file(jsonl, 'session.jsonl')]);
		expect(got).toEqual({ raw: jsonl, name: 'session.jsonl' });
	});

	it('takes the FIRST file when several are dropped', async () => {
		const got = await firstFileText([file('first', 'a.jsonl'), file('second', 'b.jsonl')]);
		expect(got).toEqual({ raw: 'first', name: 'a.jsonl' });
	});

	it('passes content through byte-faithfully (no trimming, multibyte intact)', async () => {
		const raw = '  {"a":1}\n\n{"b":"ø — 🟠"}\n';
		const got = await firstFileText([file(raw, 'x.jsonl')]);
		expect(got?.raw).toBe(raw);
	});

	it('does not filter by extension — any dropped file reaches the parser', async () => {
		const got = await firstFileText([file('not jsonl at all', 'notes.md')]);
		expect(got).toEqual({ raw: 'not jsonl at all', name: 'notes.md' });
	});
});
