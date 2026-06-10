// Secret scanner — flags credential-shaped strings in a parsed transcript so
// nobody screenshots or shares an API key by accident. Born from a real
// incident: two live API keys and fourteen SSH private keys found sitting in
// a session history file. Detection is heuristic by design — the tool warns,
// the human judges.
//
// Every pattern is linear-safe: bounded repetition, no nested quantifiers,
// no overlapping alternations (ReDoS lessons applied — a scanner that can be
// wedged by its own input would be an irony too far).

import type { Conversation } from './types';

export interface SecretHit {
	/** which pattern fired */
	label: string;
	/** the matched text, middle-elided for display */
	preview: string;
	/** message index within the conversation */
	msgIndex: number;
	/** conversation index */
	convIndex: number;
	/** source line in the file */
	line: number;
}

interface Pattern {
	label: string;
	re: RegExp;
}

// NOTE: all regexes are used with .matchAll on capped block text (≤200k chars
// per block), global flag required.
const PATTERNS: Pattern[] = [
	{ label: 'OpenAI/Anthropic-style API key', re: /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,120}\b/g },
	{ label: 'GitHub token', re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,255}\b/g },
	{ label: 'GitHub fine-grained PAT', re: /\bgithub_pat_[A-Za-z0-9_]{22,255}\b/g },
	{ label: 'AWS access key id', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g },
	{ label: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
	{ label: 'Slack token', re: /\bxox[bporas]-[A-Za-z0-9-]{10,250}\b/g },
	{ label: 'Stripe key', re: /\b[sr]k_(?:live|test)_[A-Za-z0-9]{20,120}\b/g },
	{ label: 'private key block', re: /-----BEGIN [A-Z ]{0,20}PRIVATE KEY-----/g },
	{ label: 'JWT', re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g },
	{ label: 'bearer token', re: /\bBearer +[A-Za-z0-9._~+/=-]{25,300}\b/g },
	{
		label: 'password assignment',
		re: /\b(?:password|passwd|api_key|apikey|secret|token)["']? *[:=] *["'][^"'\n]{8,120}["']/gi
	}
];

/** Things that look like keys but are placeholders/docs — suppress. */
const FALSE_POSITIVE = /\b(?:xxx|example|placeholder|your[_-]?key|redacted|\.{3})\b/i;

function elide(s: string): string {
	const flat = s.replace(/\s+/g, ' ').trim();
	if (flat.length <= 24) return flat;
	return `${flat.slice(0, 12)}…${flat.slice(-6)}`;
}

export function scanSecrets(conversations: Conversation[]): SecretHit[] {
	const hits: SecretHit[] = [];
	const seen = new Set<string>();

	conversations.forEach((conv, convIndex) => {
		conv.messages.forEach((msg) => {
			for (const block of msg.blocks) {
				const text =
					block.kind === 'tool_use'
						? block.input
						: block.kind === 'other'
							? block.raw
							: 'text' in block
								? block.text
								: '';
				if (!text) continue;
				for (const { label, re } of PATTERNS) {
					re.lastIndex = 0;
					for (const m of text.matchAll(re)) {
						const value = m[0];
						if (FALSE_POSITIVE.test(value)) continue;
						const key = `${label}:${value}`;
						if (seen.has(key)) continue; // dedupe identical leaks repeated across messages
						seen.add(key);
						hits.push({ label, preview: elide(value), msgIndex: msg.i, convIndex, line: msg.line });
					}
				}
			}
		});
	});

	return hits;
}
