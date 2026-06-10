// Built-in sample transcript (Claude Code dialect) so first-time visitors can
// see the reader working without hunting for a real file. Entirely synthetic.
// It deliberately includes one fake credential in a tool result so the secret
// scanner has something to demonstrate — the key is not real.

const lines = [
	{
		type: 'summary',
		summary: 'Build a JSONL transcript viewer'
	},
	{
		type: 'user',
		timestamp: '2026-06-10T18:02:11.000Z',
		message: {
			role: 'user',
			content:
				'I keep squinting at raw .jsonl session logs. Can you build a viewer that renders them as a readable conversation?'
		}
	},
	{
		type: 'assistant',
		timestamp: '2026-06-10T18:02:19.000Z',
		message: {
			role: 'assistant',
			model: 'claude-fable-5',
			content: [
				{
					type: 'thinking',
					thinking:
						'JSONL transcripts come in a few dialects — Claude Code session logs, OpenAI fine-tune files, generic {role, content} lines. Detect the dialect, normalize to one message shape, render. Everything client-side: these files are sensitive.'
				},
				{
					type: 'text',
					text: 'Yes. Plan: parse the file locally in your browser (it never uploads), auto-detect the dialect, and render messages with collapsible tool calls and thinking blocks. Let me check what a session log looks like.'
				},
				{
					type: 'tool_use',
					id: 'toolu_demo_01',
					name: 'Read',
					input: { file_path: '~/.claude/projects/demo/session.jsonl', limit: 3 }
				}
			]
		}
	},
	{
		type: 'user',
		timestamp: '2026-06-10T18:02:24.000Z',
		message: {
			role: 'user',
			content: [
				{
					type: 'tool_result',
					tool_use_id: 'toolu_demo_01',
					content:
						'{"type":"user","message":{"role":"user","content":"deploy the staging stack"}}\n{"type":"assistant","message":{"role":"assistant","content":"Deploying now."}}\n{"env":"OPENAI_API_KEY=sk-demo4f8a2b9c1d3e5f7a9b1c3d5e7f9a2b4c6d8e0f2a4b6c8d"}'
				}
			]
		}
	},
	{
		type: 'assistant',
		timestamp: '2026-06-10T18:02:31.000Z',
		message: {
			role: 'assistant',
			model: 'claude-fable-5',
			content: [
				{
					type: 'text',
					text: 'Note the third line of that log: there is an API key sitting in plain text. This happens in real transcripts constantly — which is why this viewer ships a secret scanner. The banner above this conversation flagged that key (it is a fake one, planted for this demo).'
				}
			]
		}
	},
	{
		type: 'user',
		timestamp: '2026-06-10T18:03:02.000Z',
		message: {
			role: 'user',
			content: 'Nice catch. And subagent chatter? My logs are full of it.'
		}
	},
	{
		type: 'assistant',
		timestamp: '2026-06-10T18:03:10.000Z',
		isSidechain: true,
		message: {
			role: 'assistant',
			model: 'claude-fable-5',
			content: [
				{
					type: 'text',
					text: 'This message is marked as a sidechain — subagent traffic renders with its own marker so the main thread stays readable. Use the role filters above to hide or isolate it.'
				}
			]
		}
	},
	{
		type: 'assistant',
		timestamp: '2026-06-10T18:03:25.000Z',
		message: {
			role: 'assistant',
			model: 'claude-fable-5',
			content: [
				{
					type: 'text',
					text: 'That is the tour: drop any .jsonl in — Claude Code session logs, OpenAI fine-tune files, or generic {role, content} lines. Parsing happens in this tab; nothing leaves your machine.'
				}
			]
		}
	}
];

export const SAMPLE_JSONL: string = lines.map((l) => JSON.stringify(l)).join('\n');
