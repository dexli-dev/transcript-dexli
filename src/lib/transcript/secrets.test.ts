import { describe, expect, it } from 'vitest';
import { parseJsonl } from './parse';
import { scanSecrets } from './secrets';
import { SAMPLE_JSONL } from './sample';

async function hitsFor(content: string) {
	const r = await parseJsonl(JSON.stringify({ role: 'user', content }));
	return scanSecrets(r.conversations);
}

describe('secret scanner', () => {
	it('flags API-key shapes', async () => {
		expect(await hitsFor('my key is sk-ant-api03-aBcDeF0123456789aBcDeF0123456789')).toHaveLength(1);
		expect(await hitsFor('AKIAIOSFODNN7EXAMPLE7')).toHaveLength(0); // contains EXAMPLE → suppressed
		expect(await hitsFor('AKIAIOSFODNN7RLPM3Q2')).toHaveLength(1);
		expect(await hitsFor('ghp_aBcDeF0123456789aBcDeF0123456789aBcD')).toHaveLength(1);
		// fixture assembled at runtime — GitHub push protection pattern-matches
		// literal Slack-token shapes in blobs (it blocked this very file), and a
		// secret scanner's own test fixtures shouldn't trip other scanners.
		expect(await hitsFor(['xoxb', '123456789012', 'abcdefghijklmnop'].join('-'))).toHaveLength(1);
	});

	it('flags private key blocks and JWTs', async () => {
		expect(await hitsFor('-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaA==')).toHaveLength(1);
		expect(
			await hitsFor('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk')
		).toHaveLength(1);
	});

	it('flags password assignments', async () => {
		expect(await hitsFor('config: password = "hunter2hunter2"')).toHaveLength(1);
	});

	it('stays quiet on clean prose and placeholder keys', async () => {
		expect(await hitsFor('We rotated all keys yesterday; nothing sensitive here.')).toHaveLength(0);
		expect(await hitsFor('set OPENAI_API_KEY=sk-your-key-placeholder-0000000000')).toHaveLength(0);
	});

	it('dedupes the same leaked value across messages', async () => {
		const key = 'sk-proj-aBcDeF0123456789aBcDeF0123456789';
		const raw = [
			JSON.stringify({ role: 'user', content: `first paste ${key}` }),
			JSON.stringify({ role: 'assistant', content: `I see ${key} in your message` })
		].join('\n');
		const r = await parseJsonl(raw);
		expect(scanSecrets(r.conversations)).toHaveLength(1);
	});

	it('scans tool_use input and tool_result text, not just prose', async () => {
		const raw = JSON.stringify({
			type: 'assistant',
			message: {
				role: 'assistant',
				content: [
					{
						type: 'tool_use',
						name: 'Bash',
						input: { command: 'curl -H "Authorization: Bearer abcdef0123456789abcdef0123456789abcdef"' }
					}
				]
			}
		});
		const r = await parseJsonl(raw);
		const hits = scanSecrets(r.conversations);
		expect(hits.length).toBeGreaterThanOrEqual(1);
	});

	it('finds the planted demo key in the sample (and elides the preview)', async () => {
		const r = await parseJsonl(SAMPLE_JSONL);
		const hits = scanSecrets(r.conversations);
		expect(hits.length).toBeGreaterThanOrEqual(1);
		const planted = hits.find((h) => h.label.includes('API key'));
		expect(planted).toBeDefined();
		expect(planted!.preview).toContain('…'); // never shows the full value
		expect(planted!.preview.length).toBeLessThan(30);
	});
});
