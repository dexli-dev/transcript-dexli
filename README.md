# transcript.dexli.dev

Drop a `.jsonl` transcript — read it as a conversation.

LLM tooling stores conversations as JSONL: one JSON object per line, unreadable
raw. This tool parses the file **entirely in your browser** (there is no upload
endpoint) and renders it as a chat: tool calls and thinking blocks folded,
subagent sidechains marked, timestamps and models surfaced.

Part of the [dexli.dev](https://dexli.dev) tiny-tools family.

## Understands

- **Claude Code session logs** (`~/.claude/projects/**/*.jsonl`) — text /
  thinking / tool_use / tool_result blocks, sidechains, summaries, models.
- **OpenAI chat / fine-tune files** — `{"messages": [...]}` per line; each
  line renders as its own conversation.
- **Generic chat lines** — `{role|speaker|from, content|text|message}` objects.

## Secret scanner

Transcripts leak credentials constantly — API keys pasted into prompts, tokens
echoed in tool output. Every loaded transcript is scanned for credential-shaped
strings (API keys, GitHub/Slack/Stripe tokens, private key blocks, JWTs,
password assignments) and flagged **before** you screenshot or share. Detection
is heuristic and local, like everything else here.

## Privacy model

The file is read with the browser's `FileReader` and parsed in the tab. No
transcript byte is ever part of a request: no upload, no URL-encoded state, no
analytics events carrying content. The server serves a static shell.

## Develop

```bash
npm install
npm run dev        # vite dev server
npm test           # vitest — parser + scanner suites
npm run check      # svelte-check
npm run build && npm start   # adapter-node production build
```

## Deploy

Dockerfile builds a multi-stage node:22-alpine image, listens on `:3000`
(`HOST=0.0.0.0`). No env vars required.
